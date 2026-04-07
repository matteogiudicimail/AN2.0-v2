/**
 * masterDataService — CRUD for registered dimension/lookup tables.
 *
 * Security model (OWASP A01/A03):
 *   - Only tables registered in cfg_MasterDataTable can be accessed.
 *   - All schema/table/column names validated with assertValidIdentifier.
 *   - Row values always parameterised (never interpolated).
 *   - DELETE checks for referential integrity warnings (soft check).
 *
 * [V3] Parameterised SQL; identifier allowlist validation.
 * [V5] <350 lines.
 * [V6] Business logic here; routes orchestrate only.
 */

import { dbAll, dbGet, dbRun } from '../config/dbHelpers';
import { assertValidIdentifier } from './paramTableService';
import { getPool } from '../config/db';
import {
  MasterDataTableDef, RegisterMasterDataDto, MasterDataRow, UpsertMasterDataRowDto,
} from '../models/masterData.models';

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseEditableCols(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json) as string[]; } catch { return []; }
}

async function resolveDef(masterDataId: number, reportId: number): Promise<{
  schemaName: string; tableName: string; primaryKeyCol: string; editableCols: string[];
}> {
  const row = await dbGet<{
    SchemaName: string; TableName: string; PrimaryKeyCol: string; EditableCols: string | null;
  }>(
    `SELECT SchemaName, TableName, PrimaryKeyCol, EditableCols
       FROM dbo.cfg_MasterDataTable
      WHERE MasterDataId = ? AND ReportId = ?`,
    masterDataId, reportId,
  );
  if (!row) {
    const e = new Error('Master data table non trovata o non accessibile');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
  return {
    schemaName:    row.SchemaName,
    tableName:     row.TableName,
    primaryKeyCol: row.PrimaryKeyCol,
    editableCols:  parseEditableCols(row.EditableCols),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** List all registered master-data tables for a report. */
export async function listMasterDataTables(reportId: number): Promise<MasterDataTableDef[]> {
  const rows = await dbAll<{
    MasterDataId: number; ReportId: number; SchemaName: string; TableName: string;
    Label: string; PrimaryKeyCol: string; EditableCols: string | null;
    CreatedBy: string; CreatedAt: string;
  }>(
    `SELECT MasterDataId, ReportId, SchemaName, TableName, Label,
            PrimaryKeyCol, EditableCols, CreatedBy, CreatedAt
       FROM dbo.cfg_MasterDataTable
      WHERE ReportId = ?
      ORDER BY Label`,
    reportId,
  );
  return rows.map((r) => ({
    masterDataId:   r.MasterDataId,
    reportId:       r.ReportId,
    schemaName:     r.SchemaName,
    tableName:      r.TableName,
    label:          r.Label,
    primaryKeyCol:  r.PrimaryKeyCol,
    editableCols:   parseEditableCols(r.EditableCols),
    createdBy:      r.CreatedBy,
    createdAt:      r.CreatedAt,
  }));
}

/** Register a dimension table for CRUD management. */
export async function registerMasterDataTable(
  reportId: number, dto: RegisterMasterDataDto, userId: string,
): Promise<number> {
  // Validate identifiers [V3]
  assertValidIdentifier(dto.schemaName, 'schemaName');
  assertValidIdentifier(dto.tableName, 'tableName');
  assertValidIdentifier(dto.primaryKeyCol, 'primaryKeyCol');
  dto.editableCols.forEach((c) => assertValidIdentifier(c, `editableCol "${c}"`));

  if (!dto.label || dto.label.trim().length === 0 || dto.label.length > 200) {
    const e = new Error('label è obbligatorio (max 200 caratteri)');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }

  // Check table exists in DB
  const tableExists = await dbGet<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    dto.schemaName, dto.tableName,
  );
  if (!tableExists || (tableExists.cnt as unknown as number) === 0) {
    const e = new Error(`Tabella [${dto.schemaName}].[${dto.tableName}] non trovata nel database`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }

  // Validate editableCols exist in the table
  for (const col of dto.editableCols) {
    const colExists = await dbGet<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      dto.schemaName, dto.tableName, col,
    );
    if (!colExists || (colExists.cnt as unknown as number) === 0) {
      const e = new Error(`Colonna "${col}" non trovata nella tabella`);
      (e as Error & { statusCode: number }).statusCode = 400;
      throw e;
    }
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('ReportId',      reportId)
    .input('SchemaName',    dto.schemaName)
    .input('TableName',     dto.tableName)
    .input('Label',         dto.label.trim())
    .input('PrimaryKeyCol', dto.primaryKeyCol)
    .input('EditableCols',  JSON.stringify(dto.editableCols))
    .input('CreatedBy',     userId)
    .query(`
      INSERT INTO dbo.cfg_MasterDataTable (ReportId, SchemaName, TableName, Label, PrimaryKeyCol, EditableCols, CreatedBy)
      OUTPUT INSERTED.MasterDataId
      VALUES (@ReportId, @SchemaName, @TableName, @Label, @PrimaryKeyCol, @EditableCols, @CreatedBy)
    `);
  return result.recordset[0].MasterDataId as number;
}

/** Unregister a master-data table (does not drop the actual DB table). */
export async function unregisterMasterDataTable(
  masterDataId: number, reportId: number,
): Promise<void> {
  const pool = await getPool();
  const result = await pool.request()
    .input('MasterDataId', masterDataId)
    .input('ReportId',     reportId)
    .query(`DELETE FROM dbo.cfg_MasterDataTable WHERE MasterDataId = @MasterDataId AND ReportId = @ReportId`);
  if (result.rowsAffected[0] === 0) {
    const e = new Error('Master data table non trovata');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
}

/** Read all rows from a registered master-data table. */
export async function getMasterDataRows(
  masterDataId: number, reportId: number,
): Promise<MasterDataRow[]> {
  const { schemaName, tableName, primaryKeyCol, editableCols } = await resolveDef(masterDataId, reportId);

  assertValidIdentifier(schemaName, 'schema');
  assertValidIdentifier(tableName, 'table');
  assertValidIdentifier(primaryKeyCol, 'pk');

  const allCols = [primaryKeyCol, ...editableCols.filter((c) => c !== primaryKeyCol)];
  const selectCols = allCols.map((c) => `[${c}]`).join(', ');

  const rows = await dbAll<Record<string, unknown>>(
    `SELECT ${selectCols} FROM [${schemaName}].[${tableName}] ORDER BY [${primaryKeyCol}]`,
  );

  return rows.map((row) => ({
    pkValue: row[primaryKeyCol] != null ? String(row[primaryKeyCol]) : '',
    columns: Object.fromEntries(
      allCols.map((c) => [c, row[c] != null ? String(row[c]) : null]),
    ) as Record<string, string | null>,
  }));
}

/** Insert a new row into a registered master-data table. */
export async function insertMasterDataRow(
  masterDataId: number, reportId: number, dto: UpsertMasterDataRowDto,
): Promise<void> {
  const { schemaName, tableName, editableCols } = await resolveDef(masterDataId, reportId);

  const colsToInsert = Object.keys(dto.values).filter((c) => editableCols.includes(c));
  if (colsToInsert.length === 0) {
    const e = new Error('Nessuna colonna valida da inserire');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  colsToInsert.forEach((c) => assertValidIdentifier(c, `insert col "${c}"`));

  const colList  = colsToInsert.map((c) => `[${c}]`).join(', ');
  const valList  = colsToInsert.map(() => '?').join(', ');
  const values   = colsToInsert.map((c) => dto.values[c] ?? null);

  await dbRun(
    `INSERT INTO [${schemaName}].[${tableName}] (${colList}) VALUES (${valList})`,
    ...values,
  );
}

/** Update an existing row in a registered master-data table. */
export async function updateMasterDataRow(
  masterDataId: number, reportId: number, pkValue: string, dto: UpsertMasterDataRowDto,
): Promise<void> {
  const { schemaName, tableName, primaryKeyCol, editableCols } = await resolveDef(masterDataId, reportId);

  const colsToUpdate = Object.keys(dto.values).filter((c) => editableCols.includes(c) && c !== primaryKeyCol);
  if (colsToUpdate.length === 0) {
    const e = new Error('Nessuna colonna valida da aggiornare');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  colsToUpdate.forEach((c) => assertValidIdentifier(c, `update col "${c}"`));
  assertValidIdentifier(primaryKeyCol, 'pk');

  const setList = colsToUpdate.map((c) => `[${c}] = ?`).join(', ');
  const values  = colsToUpdate.map((c) => dto.values[c] ?? null);

  await dbRun(
    `UPDATE [${schemaName}].[${tableName}] SET ${setList} WHERE [${primaryKeyCol}] = ?`,
    ...values, pkValue,
  );
}

/** Delete a row from a registered master-data table. */
export async function deleteMasterDataRow(
  masterDataId: number, reportId: number, pkValue: string,
): Promise<void> {
  const { schemaName, tableName, primaryKeyCol } = await resolveDef(masterDataId, reportId);

  assertValidIdentifier(schemaName, 'schema');
  assertValidIdentifier(tableName, 'table');
  assertValidIdentifier(primaryKeyCol, 'pk');

  await dbRun(
    `DELETE FROM [${schemaName}].[${tableName}] WHERE [${primaryKeyCol}] = ?`,
    pkValue,
  );
}
