/**
 * Entry Layout Service — gestisce la configurazione della scheda di data entry.
 *
 * [V3] Nessun input utente interpolato in SQL: il reportId viene validato
 *      come intero prima di arrivare qui e usato solo come parametro.
 * [V6] Tutta la logica di business qui; le routes orchestrano soltanto.
 * [V4] Nessun dettaglio interno esposto al client.
 */
import { dbGet, dbRun } from '../config/dbHelpers';
import { EntryLayoutRecord, EntryLayoutConfig } from '../models/entryLayout.models';

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToRecord(row: {
  LayoutId:   number;
  ReportId:   number;
  ConfigJson: string;
  UpdatedAt:  Date | string | null;
}): EntryLayoutRecord {
  let config: EntryLayoutConfig;
  try {
    config = JSON.parse(row.ConfigJson);
  } catch {
    config = { filtri: [], righe: [], colonne: [], valori: [] };
  }
  const updatedAt = row.UpdatedAt instanceof Date
    ? row.UpdatedAt.toISOString()
    : (row.UpdatedAt ?? null);
  return {
    layoutId:  row.LayoutId,
    reportId:  row.ReportId,
    config,
    updatedAt,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the entry layout for the given report, or null if none exists.
 */
export async function getEntryLayout(reportId: number): Promise<EntryLayoutRecord | null> {
  const row = await dbGet<{
    LayoutId: number;
    ReportId: number;
    ConfigJson: string;
    UpdatedAt: Date | null;
  }>(
    'SELECT LayoutId, ReportId, ConfigJson, UpdatedAt FROM dbo.cfg_EntryLayout WHERE ReportId = ?',
    reportId,
  );
  return row ? rowToRecord(row) : null;
}

/**
 * Creates or replaces the entry layout for the given report.
 * Uses explicit EXISTS check + UPDATE / INSERT (avoids MERGE edge cases with mssql).
 *
 * [V3] All values passed as positional ? params — never interpolated.
 */
export async function upsertEntryLayout(
  reportId: number,
  config:   EntryLayoutConfig,
  userId:   string,
): Promise<EntryLayoutRecord> {
  const configJson = JSON.stringify(config);

  const existing = await dbGet<{ LayoutId: number }>(
    'SELECT LayoutId FROM dbo.cfg_EntryLayout WHERE ReportId = ?',
    reportId,
  );

  if (existing) {
    // UpdatedAt set by DB to avoid passing datetime strings as params
    await dbRun(
      `UPDATE dbo.cfg_EntryLayout
          SET ConfigJson = ?, UpdatedBy = ?, UpdatedAt = SYSUTCDATETIME()
        WHERE ReportId = ?`,
      configJson, userId, reportId,
    );
  } else {
    // CreatedAt has a DEFAULT — only pass the columns we supply
    await dbRun(
      `INSERT INTO dbo.cfg_EntryLayout (ReportId, ConfigJson, CreatedBy)
       VALUES (?, ?, ?)`,
      reportId, configJson, userId,
    );
  }

  const saved = await getEntryLayout(reportId);
  if (!saved) throw new Error('Entry layout not found after upsert');
  return saved;
}
