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
  {
    name: '012_ViewerSettings',
    sql: `IF COL_LENGTH('cfg_Task', 'ViewerSettings') IS NULL
          ALTER TABLE cfg_Task ADD ViewerSettings NVARCHAR(MAX) NULL`,
  },
  {
    name: '013_ReportTrackingEnabled',
    sql: `IF COL_LENGTH('cfg_Report', 'TrackingEnabled') IS NULL
          ALTER TABLE cfg_Report ADD TrackingEnabled BIT NOT NULL CONSTRAINT DF_cfg_Report_TrackingEnabled DEFAULT 0`,
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
