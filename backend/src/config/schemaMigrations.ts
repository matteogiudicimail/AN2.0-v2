/**
 * Lightweight schema migration runner.
 * Each entry is idempotent — safe to run on every startup.
 */
import { dbRun } from './dbHelpers';

const migrations: Array<{ name: string; sql: string }> = [
  {
    name: '010_ParentMenuCode',
    sql: `IF COL_LENGTH('cfg_Task', 'ParentMenuCode') IS NULL
          ALTER TABLE cfg_Task ADD ParentMenuCode NVARCHAR(100) NULL`,
  },
  {
    name: '011_HiddenFilters',
    sql: `IF COL_LENGTH('cfg_Task', 'HiddenFilters') IS NULL
          ALTER TABLE cfg_Task ADD HiddenFilters NVARCHAR(MAX) NULL`,
  },
];

export async function runSchemaMigrations(): Promise<void> {
  for (const m of migrations) {
    try {
      await dbRun(m.sql);
      console.log(`[migrations] ${m.name} — OK`);
    } catch (err) {
      console.warn(`[migrations] ${m.name} — skipped (${(err as Error).message})`);
    }
  }
}
