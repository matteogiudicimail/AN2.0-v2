/**
 * dataEntryCellService — cell save, history, and write-table DDL.
 *
 * [V3] Identifiers validated; values always parameterised.
 * [V4] No stack traces exposed to client.
 * [V5] <300 lines.
 * [V6] Business logic here; routes orchestrate only.
 */

import { dbAll, dbGet, dbRun } from '../config/dbHelpers';
import { getPool } from '../config/db';
import { assertValidIdentifier } from './paramTableService';
import { getRowApprovals } from './rowApprovalService';
import { SaveCellDto, CellHistoryEntry, DataEntryGridResponse, InsertManualRowDto } from '../models/dataEntry.models';
import { sortedJson, splitFact, validateLayoutIdentifiers } from './dataEntryHelpers';

// ── ensureWriteLogTable ───────────────────────────────────────────────────────

/**
 * Creates the _WRITE_LOG table if it doesn't exist (DDL idempotent).
 */
async function ensureWriteLogTable(schema: string, logTable: string): Promise<void> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(logTable, 'logTable');
  const ddl = `
    IF OBJECT_ID('[${schema}].[${logTable}]', 'U') IS NULL
    BEGIN
      CREATE TABLE [${schema}].[${logTable}] (
        LogId       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        DimensionsJson NVARCHAR(MAX) NOT NULL,
        ValoreField NVARCHAR(128) NOT NULL,
        OldValue    NVARCHAR(MAX) NULL,
        NewValue    NVARCHAR(MAX) NOT NULL,
        WrittenBy   NVARCHAR(200) NOT NULL,
        WrittenAt   DATETIME2 NOT NULL CONSTRAINT [DF_${logTable}_WrittenAt] DEFAULT SYSUTCDATETIME()
      );
    END`;
  const pool = await getPool();
  await pool.request().query(ddl);
}

// ── ensureWriteTable ──────────────────────────────────────────────────────────

/**
 * Creates the _WRITE table if it doesn't exist.
 * DDL uses only bracket-quoted, allowlist-validated identifiers.
 */
export async function ensureWriteTable(
  schema: string,
  writeTable: string,
  allDimFields: string[],
  valoriFields: string[],
): Promise<void> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(writeTable, 'writeTable');
  allDimFields.forEach((f) => assertValidIdentifier(f, `dim field "${f}"`));
  valoriFields.forEach((f) => assertValidIdentifier(f, `valori field "${f}"`));

  const dimColsDdl = allDimFields.map((f) => `  [${f}] NVARCHAR(200) NOT NULL`).join(',\n');
  const valColsDdl = valoriFields.map((f) => `  [${f}] NVARCHAR(MAX) NULL`).join(',\n');
  const pkColsList = allDimFields.map((f) => `[${f}]`).join(', ');

  const ddl = `
    IF OBJECT_ID('[${schema}].[${writeTable}]', 'U') IS NULL
    BEGIN
      CREATE TABLE [${schema}].[${writeTable}] (
${dimColsDdl},
${valColsDdl},
        [UpdatedBy] NVARCHAR(200) NULL,
        [UpdatedAt] DATETIME2 NULL,
        CONSTRAINT [PK_${writeTable}] PRIMARY KEY (${pkColsList})
      );
    END`;

  const pool = await getPool();
  await pool.request().query(ddl);
}

// ── saveCell ──────────────────────────────────────────────────────────────────

export async function saveCell(
  reportId: number, dto: SaveCellDto, userId: string,
): Promise<void> {
  // 1. Reload layout
  const layoutRow = await dbGet<{ ConfigJson: string }>(
    'SELECT ConfigJson FROM dbo.cfg_EntryLayout WHERE ReportId = ?',
    reportId,
  );
  if (!layoutRow) {
    const e = new Error('Entry layout non trovato');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
  const layout = JSON.parse(layoutRow.ConfigJson) as DataEntryGridResponse['layout'];

  // 2. Binding
  const bindingRow = await dbGet<{ FactTable: string }>(
    'SELECT FactTable FROM dbo.cfg_DatasetBinding WHERE ReportId = ?',
    reportId,
  );
  if (!bindingRow) {
    const e = new Error('Binding non trovato');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  const [schemaName, factTable] = splitFact(bindingRow.FactTable);
  const writeTable = `${factTable}_WRITE`;

  const filtriFields  = layout.filtri.map((f) => f.fieldName);
  const righeFields   = layout.righe.map((f) => f.fieldName);
  const colonneFields = layout.colonne.map((f) => f.fieldName);
  const valoriFields  = layout.valori.map((f) => f.fieldName);

  // Virtual _Grouping fields are excluded from the write table (they don't exist as columns).
  // Param-based fields (paramTableId set) are fact-level dimensions even when dimTable is also set.
  // Pure dim-only fields (dimTable set, no paramTableId) are excluded.
  const isGroupingField = (f: { fieldName: string; paramTableId?: number | null }) =>
    !!(f.paramTableId) && f.fieldName.endsWith('_Grouping');
  const isFactDim = (f: { fieldName: string; paramTableId?: number | null }) =>
    !isGroupingField(f) && (!(f as any).dimTable || !!(f as any).paramTableId);

  const factFiltriFields  = layout.filtri.filter(isFactDim).map((f) => f.fieldName);
  const factRigheFields   = layout.righe.filter(isFactDim).map((f) => f.fieldName);
  const factColonneFields = layout.colonne.map((f) => f.fieldName);  // ALL colonne
  const allDimFields      = [...factFiltriFields, ...factRigheFields, ...factColonneFields];

  validateLayoutIdentifiers(filtriFields, righeFields, colonneFields, valoriFields);

  // 3. Validate valoreField
  assertValidIdentifier(dto.valoreField, 'valoreField');
  if (!valoriFields.includes(dto.valoreField)) {
    const e = new Error(`Campo valori "${dto.valoreField}" non presente nel layout`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }

  // 4. Validate dimension keys
  for (const f of allDimFields) {
    if (!(f in dto.dimensionValues)) {
      const e = new Error(`Valore mancante per la dimensione "${f}"`);
      (e as Error & { statusCode: number }).statusCode = 400;
      throw e;
    }
  }

  // 5. Check row approval — reject writes to approved rows [OWASP A01]
  const dimensionsJson = sortedJson(dto.dimensionValues);
  const approvedKeys   = await getRowApprovals(reportId);
  if (approvedKeys.has(dimensionsJson)) {
    const e = new Error('Questa riga è stata approvata e non può essere modificata. Rimuovere prima l\'approvazione.');
    (e as Error & { statusCode: number }).statusCode = 403;
    throw e;
  }

  const logTable = `${factTable}_WRITE_LOG`;

  // 6. Ensure tables
  await ensureWriteTable(schemaName, writeTable, allDimFields, valoriFields);
  await ensureWriteLogTable(schemaName, logTable);

  // 7. Build WHERE for unique key
  const whereClause = allDimFields.map((f) => `[${f}] = ?`).join(' AND ');
  const dimValues   = allDimFields.map((f) => dto.dimensionValues[f] ?? '');

  // 8. Read old value
  const currentRow = await dbGet<Record<string, unknown>>(
    `SELECT [${dto.valoreField}] FROM [${schemaName}].[${writeTable}] WHERE ${whereClause}`,
    ...dimValues,
  );
  const oldValue: string | null = currentRow
    ? (currentRow[dto.valoreField] != null ? String(currentRow[dto.valoreField]) : null)
    : null;

  // 9. UPDATE or INSERT
  if (currentRow !== undefined) {
    await dbRun(
      `UPDATE [${schemaName}].[${writeTable}]
          SET [${dto.valoreField}] = ?, UpdatedBy = ?, UpdatedAt = SYSUTCDATETIME()
        WHERE ${whereClause}`,
      dto.value, userId, ...dimValues,
    );
  } else {
    const insertFields = [...allDimFields, dto.valoreField, 'UpdatedBy'];
    const insertCols   = insertFields.map((f) => `[${f}]`).join(', ');
    const placeholders = insertFields.map(() => '?').join(', ');
    await dbRun(
      `INSERT INTO [${schemaName}].[${writeTable}] (${insertCols}, [UpdatedAt])
       VALUES (${placeholders}, SYSUTCDATETIME())`,
      ...dimValues, dto.value, userId,
    );
  }

  // 10. Audit log
  await dbRun(
    `INSERT INTO [${schemaName}].[${logTable}]
       (DimensionsJson, ValoreField, OldValue, NewValue, WrittenBy)
     VALUES (?, ?, ?, ?, ?)`,
    dimensionsJson, dto.valoreField, oldValue, dto.value, userId,
  );
}

// ── getCellHistory ────────────────────────────────────────────────────────────

export async function getCellHistory(
  reportId: number,
  dimensionValues: Record<string, string>,
  valoreField: string,
): Promise<CellHistoryEntry[]> {
  const bindingRow = await dbGet<{ FactTable: string }>(
    'SELECT FactTable FROM dbo.cfg_DatasetBinding WHERE ReportId = ?',
    reportId,
  );
  if (!bindingRow) {
    const e = new Error('Binding non trovato');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  const [schemaName, factTable] = splitFact(bindingRow.FactTable);
  const logTable = `${factTable}_WRITE_LOG`;
  assertValidIdentifier(schemaName, 'schema');
  assertValidIdentifier(logTable, 'logTable');
  assertValidIdentifier(valoreField, 'valoreField');

  let rawRows: Array<{
    LogId: number; DimensionsJson: string; OldValue: string | null;
    NewValue: string; WrittenBy: string; WrittenAt: Date | string;
  }>;

  try {
    rawRows = await dbAll(
      `SELECT TOP(500) LogId, DimensionsJson, OldValue, NewValue, WrittenBy, WrittenAt
         FROM [${schemaName}].[${logTable}]
        WHERE ValoreField = ?
        ORDER BY WrittenAt DESC`,
      valoreField,
    );
  } catch {
    return [];
  }

  const targetKey = sortedJson(dimensionValues);

  return rawRows
    .filter((r) => {
      try {
        return sortedJson(JSON.parse(r.DimensionsJson) as Record<string, string>) === targetKey;
      } catch { return false; }
    })
    .map((r) => ({
      logId:     r.LogId,
      oldValue:  r.OldValue ?? null,
      newValue:  r.NewValue,
      writtenBy: r.WrittenBy,
      writtenAt: r.WrittenAt instanceof Date ? r.WrittenAt.toISOString() : String(r.WrittenAt),
    }));
}

// ── insertManualRow ───────────────────────────────────────────────────────────

/**
 * Inserts a new row into the _WRITE table with the given dimension values and
 * NULL for all value fields.  Uses MERGE (upsert) so it is idempotent: if the
 * row already exists it is left unchanged.
 */
export async function insertManualRow(
  reportId: number,
  dto: InsertManualRowDto,
  userId: string,
): Promise<void> {
  // Load layout
  const layoutRow = await dbGet<{ ConfigJson: string }>(
    'SELECT ConfigJson FROM dbo.cfg_EntryLayout WHERE ReportId = ?',
    reportId,
  );
  if (!layoutRow) {
    const e = new Error('Entry layout non trovato');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
  const layout = JSON.parse(layoutRow.ConfigJson) as DataEntryGridResponse['layout'];

  // Load binding
  const bindingRow = await dbGet<{ FactTable: string }>(
    'SELECT FactTable FROM dbo.cfg_DatasetBinding WHERE ReportId = ?',
    reportId,
  );
  if (!bindingRow) {
    const e = new Error('Binding non trovato');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  const [schemaName, factTable] = splitFact(bindingRow.FactTable);
  const writeTable = `${factTable}_WRITE`;

  const isGroupingField = (f: { fieldName: string; paramTableId?: number | null }) =>
    !!(f.paramTableId) && f.fieldName.endsWith('_Grouping');
  const isFactDim = (f: { fieldName: string; paramTableId?: number | null }) =>
    !isGroupingField(f) && (!(f as any).dimTable || !!(f as any).paramTableId);

  const factFiltriFields  = layout.filtri.filter(isFactDim).map((f) => f.fieldName);
  const factRigheFields   = layout.righe.filter(isFactDim).map((f) => f.fieldName);
  const factColonneFields = layout.colonne.map((f) => f.fieldName);
  const allDimFields      = [...factFiltriFields, ...factRigheFields, ...factColonneFields];
  const valoriFields      = layout.valori.map((f) => f.fieldName);

  validateLayoutIdentifiers(
    layout.filtri.map((f) => f.fieldName),
    layout.righe.map((f) => f.fieldName),
    layout.colonne.map((f) => f.fieldName),
    valoriFields,
  );

  // Validate provided dimension values
  for (const f of allDimFields) {
    if (!(f in dto.dimensionValues)) {
      const e = new Error(`Valore mancante per la dimensione "${f}"`);
      (e as Error & { statusCode: number }).statusCode = 400;
      throw e;
    }
    assertValidIdentifier(f, `dim field "${f}"`);
  }

  // Ensure tables exist
  await ensureWriteTable(schemaName, writeTable, allDimFields, valoriFields);

  const dimValues = allDimFields.map((f) => dto.dimensionValues[f] ?? '');
  const whereClause = allDimFields.map((f) => `[${f}] = ?`).join(' AND ');

  // Only insert if row doesn't already exist (idempotent)
  const exists = await dbGet<{ cnt: number }>(
    `SELECT COUNT(1) AS cnt FROM [${schemaName}].[${writeTable}] WHERE ${whereClause}`,
    ...dimValues,
  );
  if (exists && exists.cnt > 0) return;

  const insertFields = [...allDimFields, 'UpdatedBy'];
  const insertCols   = insertFields.map((f) => `[${f}]`).join(', ');
  const placeholders = insertFields.map(() => '?').join(', ');
  await dbRun(
    `INSERT INTO [${schemaName}].[${writeTable}] (${insertCols}, [UpdatedAt])
     VALUES (${placeholders}, SYSUTCDATETIME())`,
    ...dimValues, userId,
  );
}
