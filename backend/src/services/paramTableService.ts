/**
 * Param Table Service — gestisce la creazione e il CRUD delle tabelle _PARAM
 * per i report ESG.
 *
 * SECURITY (OWASP A03 — Injection):
 *   - assertValidIdentifier: tutti gli identificatori SQL (schema, tabella, colonna)
 *     vengono validati con whitelist regex PRIMA di essere interpolati nel DDL.
 *   - Per il CRUD delle righe, il nome fisico della tabella viene risolto dalla
 *     registry cfg_ParamTable usando solo l'integer paramTableId — mai da input
 *     diretto dell'utente.
 *   - I DDL usano bracket-quoting [name] come difesa in profondità.
 *   - Le formule vengono validate: nessuna SQL keyword consentita.
 *
 * [V3] Le query DML usano ? parametrizzati. Il DDL usa solo identificatori
 *      validati + bracket-quoted (i placeholder ? non sono disponibili per
 *      gli identificatori SQL Server).
 * [V6] Logica di business qui; le routes orchestrano e validano solo.
 */

import { dbAll, dbGet, dbRun, dbInsertGetId, withTransaction } from '../config/dbHelpers';
import { logConfigEvent } from './configAuditService';
import {
  ParamTableInfo, ParamRow, UpsertParamRowDto,
  CustomColumnDef, DistinctValuesResult, SeedResult, RowKind,
  CreateParamTableDto,
} from '../models/paramTable.models';
import { getPool } from '../config/db';
import sql from 'mssql';

// ── Security helpers ──────────────────────────────────────────────────────────

const IDENTIFIER_RE = /^[A-Za-z0-9_]+$/;

/**
 * Validates a SQL identifier (schema / table / column name).
 * Throws an error with a 400 status-like property if invalid.
 * OWASP A03: Injection prevention — allowlist over blocklist.
 */
export function assertValidIdentifier(name: string, context = 'identifier'): void {
  if (!name || typeof name !== 'string') {
    const e = new Error(`${context} is required`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (!IDENTIFIER_RE.test(name)) {
    const e = new Error(
      `${context} contains invalid characters. Only letters, digits, and underscores are allowed.`,
    );
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (name.length > 128) {
    const e = new Error(`${context} exceeds maximum length of 128 characters`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
}

/**
 * Validates that the composed param table name fits within SQL Server's
 * 128-char identifier limit.
 */
function assertParamTableNameLength(schema: string, fact: string, col: string): void {
  const composed = `${fact}_${col}_PARAM`;
  if (composed.length > 128) {
    const e = new Error(
      `The composed param table name "${composed}" exceeds 128 characters. ` +
      `Use shorter fact table or column names.`,
    );
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  // schema.tableName must also fit in 128+1+128 but SQL Server limit is per-segment
  if (schema.length + 1 + composed.length > 257) {
    const e = new Error(`Fully qualified param table name is too long`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
}

/**
 * Validates a formula field.
 * Formulas are stored verbatim and evaluated client-side; they are never
 * executed server-side. We still reject obvious SQL injection attempts.
 */
const FORMULA_FORBIDDEN_RE =
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|TRUNCATE|GRANT|REVOKE)\b/i;

function assertValidFormula(formula: string): void {
  if (FORMULA_FORBIDDEN_RE.test(formula)) {
    const e = new Error('Formula contains forbidden SQL keywords');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (formula.length > 2000) {
    const e = new Error('Formula exceeds maximum length of 2000 characters');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
}

/** Returns the physical param table name for a (fact, col) pair. */
export function buildParamTableName(factTable: string, column: string): string {
  return `${factTable}_${column}_PARAM`;
}

// ── Registry helpers ──────────────────────────────────────────────────────────

interface RawParamTable {
  ParamTableId:    number;
  ReportId:        number;
  SchemaName:      string;
  FactTableName:   string;
  ColumnName:      string;
  ParamTableName:  string;
  CustomColumnDefs: string | null;
  CreatedAt:       string;
}

function mapParamTable(r: RawParamTable): ParamTableInfo {
  return {
    paramTableId:    r.ParamTableId,
    reportId:        r.ReportId,
    schemaName:      r.SchemaName,
    factTableName:   r.FactTableName,
    columnName:      r.ColumnName,
    paramTableName:  r.ParamTableName,
    customColumnDefs: r.CustomColumnDefs ? JSON.parse(r.CustomColumnDefs) : [],
    createdAt:       r.CreatedAt,
  };
}

// ── Registry CRUD ─────────────────────────────────────────────────────────────

export async function getParamTableRegistry(reportId: number): Promise<ParamTableInfo[]> {
  const rows = await dbAll<RawParamTable>(
    `SELECT ParamTableId, ReportId, SchemaName, FactTableName, ColumnName,
            ParamTableName, CustomColumnDefs, CreatedAt
     FROM cfg_ParamTable
     WHERE ReportId = ?
     ORDER BY CreatedAt`,
    reportId,
  );
  return rows.map(mapParamTable);
}

export async function getParamTableById(paramTableId: number): Promise<ParamTableInfo | null> {
  const r = await dbGet<RawParamTable>(
    `SELECT ParamTableId, ReportId, SchemaName, FactTableName, ColumnName,
            ParamTableName, CustomColumnDefs, CreatedAt
     FROM cfg_ParamTable WHERE ParamTableId = ?`,
    paramTableId,
  );
  return r ? mapParamTable(r) : null;
}

/**
 * Resolves the physical table name + schema from the registry.
 * Throws 404 if not found.  Row CRUD always calls this first — ensures
 * table identity comes from our trusted registry, not from user input.
 */
async function resolveParamTable(paramTableId: number): Promise<{ schema: string; tableName: string }> {
  const info = await getParamTableById(paramTableId);
  if (!info) {
    const e = new Error('Param table not found');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
  return { schema: info.schemaName, tableName: info.paramTableName };
}

// ── Table lifecycle ───────────────────────────────────────────────────────────

/**
 * Creates the physical _PARAM table if it does not exist, then ensures
 * a registry row in cfg_ParamTable.  Idempotent.
 */
export async function ensureParamTable(
  reportId: number,
  dto: CreateParamTableDto,
  userId: string,
): Promise<ParamTableInfo> {
  const { schema, factTable, column } = dto;

  // OWASP A03: Validate all identifiers before any DDL
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(factTable, 'factTable');
  assertValidIdentifier(column, 'column');
  assertParamTableNameLength(schema, factTable, column);

  const paramTableName = buildParamTableName(factTable, column);

  // Check registry first (idempotent)
  const existing = await dbGet<RawParamTable>(
    `SELECT ParamTableId, ReportId, SchemaName, FactTableName, ColumnName,
            ParamTableName, CustomColumnDefs, CreatedAt
     FROM cfg_ParamTable
     WHERE ReportId = ? AND SchemaName = ? AND FactTableName = ? AND ColumnName = ?`,
    reportId, schema, factTable, column,
  );
  if (existing) return mapParamTable(existing);

  // Check physical table in INFORMATION_SCHEMA
  const physExists = await dbGet<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'`,
    schema, paramTableName,
  );

  if (!physExists?.cnt) {
    // CREATE TABLE — identifiers are validated + bracket-quoted (OWASP A03)
    const ddl = `
      CREATE TABLE [${schema}].[${paramTableName}] (
        ParamId           INT IDENTITY(1,1) PRIMARY KEY,
        SourceValue       NVARCHAR(500)  NOT NULL,
        Label             NVARCHAR(500)  NOT NULL,
        RowKind           VARCHAR(20)    NOT NULL DEFAULT 'Indicatore'
                          CONSTRAINT CK_${paramTableName}_RowKind
                          CHECK (RowKind IN ('Aggregato','Indicatore')),
        IndentLevel       TINYINT        NOT NULL DEFAULT 1,
        ParentParamId     INT            NULL,
        Raggruppamento    NVARCHAR(500)  NULL,
        Formula           NVARCHAR(2000) NULL,
        GuidaCompilazione NVARCHAR(MAX)  NULL,
        IsEditable        BIT            NOT NULL DEFAULT 1,
        IsFormula         BIT            NOT NULL DEFAULT 0,
        IsVisible         BIT            NOT NULL DEFAULT 1,
        SortOrder         INT            NOT NULL DEFAULT 0,
        CustomColumns     NVARCHAR(MAX)  NULL,
        CreatedBy         NVARCHAR(128)  NOT NULL,
        CreatedAt         DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy         NVARCHAR(128)  NULL,
        UpdatedAt         DATETIME2      NULL,
        CONSTRAINT UQ_${paramTableName}_SourceValue UNIQUE (SourceValue),
        CONSTRAINT FK_${paramTableName}_Parent
          FOREIGN KEY (ParentParamId)
          REFERENCES [${schema}].[${paramTableName}](ParamId)
      );
      CREATE INDEX IX_${paramTableName}_SortOrder
        ON [${schema}].[${paramTableName}](SortOrder);
    `;
    await dbRun(ddl);
  }

  // Insert registry row
  const now = new Date().toISOString();
  const newId = await dbInsertGetId(
    `INSERT INTO cfg_ParamTable
       (ReportId, SchemaName, FactTableName, ColumnName, ParamTableName, CreatedBy, CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    reportId, schema, factTable, column, paramTableName, userId, now,
  );

  await logConfigEvent(
    'ParamTableCreated', 'ParamTable', String(newId), reportId, null,
    { schema, factTable, column, paramTableName }, userId,
  );

  const created = await getParamTableById(newId);
  return created!;
}

export async function dropParamTable(paramTableId: number, userId: string): Promise<void> {
  const info = await getParamTableById(paramTableId);
  if (!info) {
    const e = new Error('Param table not found');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  // Identifiers come from our registry — already validated at creation time,
  // bracket-quote as defence-in-depth
  const { schemaName: schema, paramTableName } = info;
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(paramTableName, 'paramTableName');

  await dbRun(`DROP TABLE IF EXISTS [${schema}].[${paramTableName}]`);
  await dbRun(`DELETE FROM cfg_ParamTable WHERE ParamTableId = ?`, paramTableId);
  await logConfigEvent(
    'ParamTableDropped', 'ParamTable', String(paramTableId), info.reportId,
    info, null, userId,
  );
}

export async function updateCustomColumnDefs(
  paramTableId: number,
  defs: CustomColumnDef[],
  userId: string,
): Promise<ParamTableInfo> {
  const info = await getParamTableById(paramTableId);
  if (!info) {
    const e = new Error('Param table not found');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  // Validate each custom column name
  for (const d of defs) {
    assertValidIdentifier(d.name, 'custom column name');
    if (!d.label || d.label.length > 200) {
      const e = new Error('Custom column label is required and must be ≤ 200 chars');
      (e as Error & { statusCode: number }).statusCode = 400;
      throw e;
    }
    if (!['text', 'number', 'boolean'].includes(d.dataType)) {
      const e = new Error(`Invalid dataType "${d.dataType}"`);
      (e as Error & { statusCode: number }).statusCode = 400;
      throw e;
    }
  }

  await dbRun(
    `UPDATE cfg_ParamTable SET CustomColumnDefs = ? WHERE ParamTableId = ?`,
    JSON.stringify(defs), paramTableId,
  );

  await logConfigEvent(
    'ParamTableColumnsUpdated', 'ParamTable', String(paramTableId), info.reportId,
    { customColumnDefs: info.customColumnDefs }, { customColumnDefs: defs }, userId,
  );

  // Return the full updated ParamTableInfo so callers can update their state
  return { ...info, customColumnDefs: defs };
}

// ── DISTINCT values ───────────────────────────────────────────────────────────

/**
 * Returns DISTINCT values from a source column.
 * OWASP A03: Identifiers validated + bracket-quoted. limit is parameterized.
 */
export async function getDistinctValues(
  schema: string,
  table: string,
  column: string,
  limit = 500,
): Promise<DistinctValuesResult> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(table, 'table');
  assertValidIdentifier(column, 'column');

  const cap = Math.min(Math.max(1, limit), 5000);

  // Use mssql directly for TOP (N) — mssql supports TOP as parameter input
  const pool = await getPool();
  const req = new sql.Request(pool);
  req.input('cap', sql.Int, cap);

  const valuesResult = await req.query<{ v: string }>(
    `SELECT DISTINCT TOP(@cap) [${column}] AS v
     FROM [${schema}].[${table}]
     WHERE [${column}] IS NOT NULL
     ORDER BY [${column}]`,
  );

  const countReq = new sql.Request(pool);
  const countResult = await countReq.query<{ cnt: number }>(
    `SELECT COUNT(DISTINCT [${column}]) AS cnt
     FROM [${schema}].[${table}]
     WHERE [${column}] IS NOT NULL`,
  );

  return {
    values: valuesResult.recordset.map((r) => String(r.v)),
    total:  countResult.recordset[0]?.cnt ?? 0,
  };
}

// ── Row helpers ───────────────────────────────────────────────────────────────

interface RawParamRow {
  ParamId:           number;
  SourceValue:       string;
  Label:             string;
  RowKind:           string;
  IndentLevel:       number;
  ParentParamId:     number | null;
  Raggruppamento:    string | null;
  Formula:           string | null;
  GuidaCompilazione: string | null;
  IsEditable:        number;
  IsFormula:         number;
  IsVisible:         number;
  SortOrder:         number;
  CustomColumns:     string | null;
}

function mapRow(r: RawParamRow): ParamRow {
  return {
    paramId:           r.ParamId,
    sourceValue:       r.SourceValue,
    label:             r.Label,
    rowKind:           r.RowKind as RowKind,
    indentLevel:       r.IndentLevel,
    parentParamId:     r.ParentParamId,
    grouping:          r.Raggruppamento,
    formula:           r.Formula,
    compilationGuide:  r.GuidaCompilazione,
    isEditable:        Boolean(r.IsEditable),
    isFormula:         Boolean(r.IsFormula),
    isVisible:         Boolean(r.IsVisible),
    sortOrder:         r.SortOrder,
    customColumns:     r.CustomColumns ? JSON.parse(r.CustomColumns) : null,
  };
}

// ── Row CRUD ──────────────────────────────────────────────────────────────────

export async function getParamRows(paramTableId: number): Promise<ParamRow[]> {
  const { schema, tableName } = await resolveParamTable(paramTableId);
  const rows = await dbAll<RawParamRow>(
    `SELECT ParamId, SourceValue, Label, RowKind, IndentLevel, ParentParamId,
            Raggruppamento, Formula, GuidaCompilazione,
            IsEditable, IsFormula, IsVisible, SortOrder, CustomColumns
     FROM [${schema}].[${tableName}]
     ORDER BY SortOrder, ParamId`,
  );
  return rows.map(mapRow);
}

export async function getParamRowById(
  paramTableId: number,
  paramId: number,
): Promise<ParamRow | null> {
  const { schema, tableName } = await resolveParamTable(paramTableId);
  const r = await dbGet<RawParamRow>(
    `SELECT ParamId, SourceValue, Label, RowKind, IndentLevel, ParentParamId,
            Raggruppamento, Formula, GuidaCompilazione,
            IsEditable, IsFormula, IsVisible, SortOrder, CustomColumns
     FROM [${schema}].[${tableName}]
     WHERE ParamId = ?`,
    paramId,
  );
  return r ? mapRow(r) : null;
}

export async function upsertParamRow(
  paramTableId: number,
  dto: UpsertParamRowDto,
  userId: string,
): Promise<ParamRow> {
  const { schema, tableName } = await resolveParamTable(paramTableId);

  if (!dto.sourceValue || dto.sourceValue.trim() === '') {
    const e = new Error('sourceValue is required');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (!dto.label || dto.label.trim() === '') {
    const e = new Error('label is required');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (dto.formula) assertValidFormula(dto.formula);

  const rowKind  = dto.rowKind  ?? 'Indicatore';
  const isEdit   = dto.isEditable !== undefined ? (dto.isEditable ? 1 : 0) : 1;
  const isForm   = dto.isFormula  !== undefined ? (dto.isFormula  ? 1 : 0) : 0;
  const isVis    = dto.isVisible  !== undefined ? (dto.isVisible  ? 1 : 0) : 1;
  const indent   = rowKind === 'Aggregato' ? 0 : 1;
  const now      = new Date().toISOString();

  // Check existing by SourceValue
  const existing = await dbGet<{ ParamId: number; SortOrder: number }>(
    `SELECT TOP 1 ParamId, SortOrder FROM [${schema}].[${tableName}] WHERE SourceValue = ?`,
    dto.sourceValue,
  );

  let paramId: number;
  if (existing) {
    paramId = existing.ParamId;
    await dbRun(
      `UPDATE [${schema}].[${tableName}]
       SET Label=?, RowKind=?, IndentLevel=?, ParentParamId=?,
           Raggruppamento=?, Formula=?, GuidaCompilazione=?,
           IsEditable=?, IsFormula=?, IsVisible=?, SortOrder=?,
           CustomColumns=?, UpdatedBy=?, UpdatedAt=?
       WHERE ParamId=?`,
      dto.label.trim(), rowKind, indent, dto.parentParamId ?? null,
      dto.grouping ?? null, dto.formula ?? null, dto.compilationGuide ?? null,
      isEdit, isForm, isVis,
      dto.sortOrder ?? existing.SortOrder,
      dto.customColumns ? JSON.stringify(dto.customColumns) : null,
      userId, now, paramId,
    );
  } else {
    // Compute next SortOrder with gap-10 convention
    const maxOrder = await dbGet<{ m: number | null }>(
      `SELECT MAX(SortOrder) AS m FROM [${schema}].[${tableName}]`,
    );
    const nextOrder = dto.sortOrder ?? ((maxOrder?.m ?? -10) + 10);

    paramId = await dbInsertGetId(
      `INSERT INTO [${schema}].[${tableName}]
         (SourceValue, Label, RowKind, IndentLevel, ParentParamId,
          Raggruppamento, Formula, GuidaCompilazione,
          IsEditable, IsFormula, IsVisible, SortOrder, CustomColumns, CreatedBy, CreatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      dto.sourceValue.trim(), dto.label.trim(), rowKind, indent,
      dto.parentParamId ?? null, dto.grouping ?? null, dto.formula ?? null,
      dto.compilationGuide ?? null, isEdit, isForm, isVis, nextOrder,
      dto.customColumns ? JSON.stringify(dto.customColumns) : null,
      userId, now,
    );
  }

  const saved = await getParamRowById(paramTableId, paramId);
  return saved!;
}

export async function deleteParamRow(paramTableId: number, paramId: number): Promise<void> {
  const { schema, tableName } = await resolveParamTable(paramTableId);
  // Nullify parent references on children before deleting the parent
  await dbRun(
    `UPDATE [${schema}].[${tableName}] SET ParentParamId = NULL WHERE ParentParamId = ?`,
    paramId,
  );
  await dbRun(`DELETE FROM [${schema}].[${tableName}] WHERE ParamId = ?`, paramId);
}

// ── Seed from DISTINCT values ─────────────────────────────────────────────────

export async function seedFromDistinct(
  paramTableId: number,
  userId: string,
): Promise<SeedResult> {
  const info = await getParamTableById(paramTableId);
  if (!info) {
    const e = new Error('Param table not found');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  const { values } = await getDistinctValues(
    info.schemaName, info.factTableName, info.columnName, 5000,
  );

  const { tableName: ptName, schema } = await resolveParamTable(paramTableId);

  // Load existing SourceValues to avoid duplicates
  const existing = await dbAll<{ SourceValue: string }>(
    `SELECT SourceValue FROM [${schema}].[${ptName}]`,
  );
  const existingSet = new Set(existing.map((r) => r.SourceValue));

  const toInsert = values.filter((v) => !existingSet.has(v));
  if (toInsert.length === 0) return { inserted: 0 };

  // Insert in batches of 50 (OWASP A06: bounded operations)
  const BATCH = 50;
  const now = new Date().toISOString();

  const maxOrder = await dbGet<{ m: number | null }>(
    `SELECT MAX(SortOrder) AS m FROM [${schema}].[${ptName}]`,
  );
  let nextOrder = (maxOrder?.m ?? -10) + 10;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    for (const v of batch) {
      await dbRun(
        `INSERT INTO [${schema}].[${ptName}]
           (SourceValue, Label, RowKind, IndentLevel, IsEditable, IsFormula, IsVisible,
            SortOrder, CreatedBy, CreatedAt)
         VALUES (?,?,?,1,1,0,1,?,?,?)`,
        v, v, 'Indicatore', nextOrder, userId, now,
      );
      nextOrder += 10;
    }
  }

  return { inserted: toInsert.length };
}

// ── Reordering ────────────────────────────────────────────────────────────────

export async function reorderParamRows(
  paramTableId: number,
  orderedIds: number[],
  userId: string,
): Promise<void> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;

  const { schema, tableName } = await resolveParamTable(paramTableId);
  const now = new Date().toISOString();

  await withTransaction(async (tx) => {
    const { dbRunTx } = await import('../config/dbHelpers');
    for (let i = 0; i < orderedIds.length; i++) {
      await dbRunTx(
        tx,
        `UPDATE [${schema}].[${tableName}]
         SET SortOrder = ?, UpdatedBy = ?, UpdatedAt = ?
         WHERE ParamId = ?`,
        i, userId, now, orderedIds[i],
      );
    }
  });
}

export async function moveParamRow(
  paramTableId: number,
  paramId: number,
  direction: 'up' | 'down',
  userId: string,
): Promise<void> {
  const { schema, tableName } = await resolveParamTable(paramTableId);
  const now = new Date().toISOString();

  const current = await dbGet<{ ParamId: number; SortOrder: number }>(
    `SELECT ParamId, SortOrder FROM [${schema}].[${tableName}] WHERE ParamId = ?`,
    paramId,
  );
  if (!current) return;

  // Find adjacent row
  const adjacent = direction === 'up'
    ? await dbGet<{ ParamId: number; SortOrder: number }>(
        `SELECT TOP 1 ParamId, SortOrder FROM [${schema}].[${tableName}]
         WHERE SortOrder < ? ORDER BY SortOrder DESC`,
        current.SortOrder,
      )
    : await dbGet<{ ParamId: number; SortOrder: number }>(
        `SELECT TOP 1 ParamId, SortOrder FROM [${schema}].[${tableName}]
         WHERE SortOrder > ? ORDER BY SortOrder ASC`,
        current.SortOrder,
      );

  if (!adjacent) return; // already at top/bottom

  await withTransaction(async (tx) => {
    const { dbRunTx } = await import('../config/dbHelpers');
    await dbRunTx(
      tx,
      `UPDATE [${schema}].[${tableName}]
       SET SortOrder = ?, UpdatedBy = ?, UpdatedAt = ?
       WHERE ParamId = ?`,
      adjacent.SortOrder, userId, now, current.ParamId,
    );
    await dbRunTx(
      tx,
      `UPDATE [${schema}].[${tableName}]
       SET SortOrder = ?, UpdatedBy = ?, UpdatedAt = ?
       WHERE ParamId = ?`,
      current.SortOrder, userId, now, adjacent.ParamId,
    );
  });
}
