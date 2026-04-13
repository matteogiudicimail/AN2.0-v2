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
 * Creates the _WRITE table if it doesn't exist, or adds any missing columns
 * if the table was created with an older schema (e.g. without righe dimTable fields).
 * DDL uses only bracket-quoted, allowlist-validated identifiers.
 *
 * NOTE: If new dim columns are added to an existing table they are added as NULLABLE
 * (to avoid breaking existing rows) and are NOT added to the PK.  The affected
 * existing rows will have NULL for the new column; a re-entry of data is required
 * to populate them properly.
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

  // 1. Create table if it does not exist yet (full schema with PK)
  const createDdl = `
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

  // 0. Clean up any leftover _STALE_ tables from previous failed repairs.
  //    These may also carry an orphaned PK constraint with the same name.
  //    We DROP them entirely so the constraint name is freed before step 1.
  const staleRes = await pool.request().query<{ tname: string }>(`
    SELECT t.name AS tname
    FROM   sys.tables  t
    JOIN   sys.schemas s ON s.schema_id = t.schema_id
    WHERE  s.name = '${schema}'
      AND  t.name LIKE '${writeTable}_STALE_%'`);
  for (const row of staleRes.recordset ?? []) {
    console.info(`[ensureWriteTable] Dropping leftover stale table [${schema}].[${row.tname}]`);
    await pool.request().query(`DROP TABLE [${schema}].[${row.tname}]`);
  }

  // 1. Create table if it does not exist yet (full schema with PK)
  await pool.request().query(createDdl);

  // 2. If the table already existed, add any missing dim or value columns.
  //    New dim columns are added as NULLABLE (they cannot be added to the existing PK).
  //    Existing rows will have NULL; users must re-enter data for those rows.
  const allExpected = [
    ...allDimFields.map((f) => ({ col: f, nullable: true,  type: 'NVARCHAR(200)' })),
    ...valoriFields.map((f) => ({ col: f, nullable: true,  type: 'NVARCHAR(MAX)' })),
  ];

  for (const { col, type } of allExpected) {
    const alterDdl = `
      IF COL_LENGTH('[${schema}].[${writeTable}]', '${col}') IS NULL
      BEGIN
        ALTER TABLE [${schema}].[${writeTable}] ADD [${col}] ${type} NULL;
      END`;
    await pool.request().query(alterDdl);
  }

  // 3. Detect stale PK columns (e.g. _Grouping fields mistakenly added at creation time).
  //    If found, DROP the table entirely and recreate with the correct PK.
  //    Data is lost, but it was keyed incorrectly and cannot be reliably migrated.
  const pkColsRes = await pool.request().query<{ name: string }>(`
    SELECT c.name
    FROM sys.key_constraints kc
    JOIN sys.index_columns ic
      ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
    JOIN sys.columns c
      ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE kc.type = 'PK'
      AND kc.parent_object_id = OBJECT_ID('[${schema}].[${writeTable}]')
    ORDER BY ic.key_ordinal`);

  const actualPkCols: string[] = (pkColsRes.recordset ?? []).map((r) => r.name);
  const expectedPkSet = new Set(allDimFields);
  const stalePkCols = actualPkCols.filter((c) => !expectedPkSet.has(c));

  if (stalePkCols.length > 0) {
    console.warn(
      `[ensureWriteTable] ${schema}.${writeTable} PK contains stale columns ` +
      `[${stalePkCols.join(', ')}] — dropping and recreating table`,
    );
    // DROP the table (this also drops its PK constraint, freeing the name).
    await pool.request().query(`DROP TABLE [${schema}].[${writeTable}]`);
    // Recreate with the correct PK (createDdl is IF NOT EXISTS so runs the CREATE).
    await pool.request().query(createDdl);
    console.info(`[ensureWriteTable] Rebuilt ${schema}.${writeTable} with correct PK`);
  }
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
  // A field is a virtual grouping field when it HAS a paramTableId AND ends with '_Grouping'.
  // (Consistent with dataEntryGridService.ts isGroupingItem.)
  const isGroupingField = (f: { fieldName: string; paramTableId?: number | null }) =>
    !!(f as any).paramTableId && f.fieldName.endsWith('_Grouping');

  // FILTRI: exclude pure dim-table-only fields (they filter the view, not stored per row).
  const isFactFiltro = (f: { fieldName: string; paramTableId?: number | null }) =>
    !isGroupingField(f) && (!(f as any).dimTable || !!(f as any).paramTableId);

  // RIGHE: include ALL non-grouping fields — even dimTable-only ones.
  // Row fields are the primary key of the WRITE table; every row dimension must be stored,
  // regardless of whether it also has a dimTable join (e.g. Descrizione_KPI).
  const isFactRiga = (f: { fieldName: string; paramTableId?: number | null }) =>
    !isGroupingField(f);

  const factFiltriFields  = layout.filtri.filter(isFactFiltro).map((f) => f.fieldName);
  const factRigheFields   = layout.righe.filter(isFactRiga).map((f) => f.fieldName);
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
