/**
 * dimTableService — direct read/write access to joined dimension tables.
 *
 * Used by the "Gestisci" button in Step 2 to open a CRUD grid directly on
 * any dimension table configured in the DatasetBinding, without requiring
 * prior registration in cfg_MasterDataTable.
 *
 * SECURITY (OWASP A03): all SQL identifiers are validated with
 * assertValidIdentifier before interpolation. Row values always use
 * parameterised queries (prepared statements).
 */

import { dbAll, dbRun } from '../config/dbHelpers';
import { assertValidIdentifier } from './paramTableService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DimTableColumn {
  columnName:  string;
  dataType:    string;
  isPrimaryKey: boolean;
  isNullable:  boolean;
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export async function getDimTableRows(
  schema: string, table: string,
): Promise<Record<string, unknown>[]> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(table,  'table');
  return dbAll<Record<string, unknown>>(
    `SELECT * FROM [${schema}].[${table}] ORDER BY (SELECT NULL)`,
  );
}

export async function insertDimTableRow(
  schema: string, table: string,
  values: Record<string, string | null>,
): Promise<void> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(table,  'table');
  const cols = Object.keys(values);
  if (cols.length === 0) throw Object.assign(new Error('No columns provided'), { statusCode: 400 });
  for (const c of cols) assertValidIdentifier(c, 'column');
  const colList      = cols.map((c) => `[${c}]`).join(', ');
  const placeholders = cols.map(() => '?').join(', ');
  await dbRun(
    `INSERT INTO [${schema}].[${table}] (${colList}) VALUES (${placeholders})`,
    ...cols.map((c) => values[c]),
  );
}

export async function updateDimTableRow(
  schema: string, table: string,
  pkCol: string, pkValue: string,
  values: Record<string, string | null>,
): Promise<void> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(table,  'table');
  assertValidIdentifier(pkCol,  'pkCol');
  const setCols = Object.keys(values).filter((c) => c !== pkCol);
  if (setCols.length === 0) return;
  for (const c of setCols) assertValidIdentifier(c, 'column');
  const setClause = setCols.map((c) => `[${c}] = ?`).join(', ');
  await dbRun(
    `UPDATE [${schema}].[${table}] SET ${setClause} WHERE [${pkCol}] = ?`,
    ...setCols.map((c) => values[c]),
    pkValue,
  );
}

export async function deleteDimTableRow(
  schema: string, table: string,
  pkCol: string, pkValue: string,
): Promise<void> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(table,  'table');
  assertValidIdentifier(pkCol,  'pkCol');
  await dbRun(
    `DELETE FROM [${schema}].[${table}] WHERE [${pkCol}] = ?`,
    pkValue,
  );
}
