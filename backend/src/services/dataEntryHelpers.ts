/**
 * dataEntryHelpers — utility pure functions shared across data-entry services.
 *
 * [V3] All identifier validation via assertValidIdentifier (re-exported from paramTableService).
 * [V5] <100 lines.
 * [V6] No DB access here — pure computation only.
 */

import { dbAll, dbGet } from '../config/dbHelpers';
import { assertValidIdentifier } from './paramTableService';

/**
 * Serialises a dimension-values map to JSON with keys sorted alphabetically.
 * Stable key used for SQL equality and set membership checks.
 */
export function sortedJson(obj: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify(sorted);
}

/**
 * In-memory path key — matches the frontend's pathKey() format: "field1=val1|field2=val2".
 * Used for hierarchy deduplication sets and ancestorKeys emitted to the frontend.
 */
export function memPathKey(obj: Record<string, string>): string {
  return Object.keys(obj).sort().map((k) => `${k}=${obj[k]}`).join('|');
}

/**
 * Splits "schema.table" → [schema, table]. Defaults schema to 'dbo'.
 */
export function splitFact(fullName: string): [string, string] {
  if (fullName.includes('.')) {
    const [s, t] = fullName.split('.');
    return [s, t];
  }
  return ['dbo', fullName];
}

/**
 * Returns DISTINCT values for a column in a table/view.
 * [V3] All identifiers validated before interpolation.
 */
export async function getDistinctColValues(
  schema: string, table: string, col: string, limit = 1000,
): Promise<string[]> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(table, 'table');
  assertValidIdentifier(col, 'column');
  const rows = await dbAll<{ v: string }>(
    `SELECT DISTINCT TOP(${Number(limit)}) [${col}] AS v
       FROM [${schema}].[${table}]
      WHERE [${col}] IS NOT NULL`,
  );
  return rows.map((r) => String(r.v ?? '')).sort();
}

/**
 * Validates all field names in a layout config. Throws 400 if any is invalid.
 */
export function validateLayoutIdentifiers(
  filtriFields: string[], righeFields: string[], colonneFields: string[], valoriFields: string[],
): void {
  const all = [...filtriFields, ...righeFields, ...colonneFields, ...valoriFields];
  all.forEach((f) => assertValidIdentifier(f, `layout field "${f}"`));
}

/**
 * Checks whether a column exists in a table or view (case-insensitive).
 * Used to detect optional columns like InLevelOrder or FolderFatherKey.
 */
export async function columnExists(schema: string, table: string, col: string): Promise<boolean> {
  const row = await dbGet<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    schema, table, col,
  );
  return !!(row && (row.cnt as unknown as number) > 0);
}
