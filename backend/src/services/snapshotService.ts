/**
 * snapshotService — frozen layout snapshots for published tasks.
 *
 * When a task is activated, a snapshot of the current entry layout and dataset
 * binding is saved in cfg_Snapshot.  The snapshot viewer uses this frozen copy
 * so layout changes after activation do not affect the published grid.
 *
 * [V3] All identifiers validated; SQL always parameterised.
 * [V4] No internals exposed to client.
 * [V5] <350 lines.
 * [V6] Logic here; routes orchestrate.
 */

import { dbGet, dbRun, dbInsertGetId } from '../config/dbHelpers';
import { assertValidIdentifier } from './paramTableService';
import { SnapshotRecord, SnapshotBindingInfo } from '../models/snapshot.models';
import { DataEntryGridResponse, SaveCellDto } from '../models/dataEntry.models';
import { sortedJson, splitFact, validateLayoutIdentifiers } from './dataEntryHelpers';
import { ensureWriteTable } from './dataEntryCellService';
import {
  getMultiLevelRigheOptions,
  loadWriteRows,
  loadAggregatedFactRows,
  resolveDistinctSource,
} from './dataEntryGridService';
import { getDistinctColValues } from './dataEntryHelpers';
import { getDistinctParamGroupings } from './dataEntryHierarchyBuilderService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGroupingItem(item: { fieldName: string; paramTableId?: number | null }): boolean {
  return !!(item.paramTableId) && item.fieldName.endsWith('_Grouping');
}

function isFactDim(f: { paramTableId?: number | null; dimTable?: unknown }): boolean {
  return !isGroupingItem(f as any) && (!(f as any).dimTable || !!(f as any).paramTableId);
}

// ── createSnapshot ────────────────────────────────────────────────────────────

/**
 * Creates a frozen snapshot of the current entry layout and binding for a task.
 * Called automatically when a task is activated.
 * Idempotent: if an active snapshot already exists for the task, it is replaced.
 */
export async function createSnapshot(
  taskId: number, reportId: number, userId: string,
): Promise<number> {
  // Load current layout
  const layoutRow = await dbGet<{ ConfigJson: string }>(
    'SELECT ConfigJson FROM dbo.cfg_EntryLayout WHERE ReportId = ?', reportId,
  );
  if (!layoutRow) {
    console.warn(`[snapshot] ReportId ${reportId} has no entry layout — snapshot skipped`);
    return 0;
  }

  // Load current binding
  const bindingRow = await dbGet<{ FactTable: string; JoinConfig: string | null }>(
    'SELECT FactTable, JoinConfig FROM dbo.cfg_DatasetBinding WHERE ReportId = ?', reportId,
  );
  if (!bindingRow) {
    console.warn(`[snapshot] ReportId ${reportId} has no binding — snapshot skipped`);
    return 0;
  }

  const bindingJson = JSON.stringify({
    factTable:  bindingRow.FactTable,
    joinConfig: bindingRow.JoinConfig ? JSON.parse(bindingRow.JoinConfig) : [],
  });

  // Deactivate previous snapshots for this task
  await dbRun(
    `UPDATE dbo.cfg_Snapshot SET IsActive = 0 WHERE TaskId = ?`, taskId,
  );

  const snapshotId = await dbInsertGetId(
    `INSERT INTO dbo.cfg_Snapshot
       (TaskId, ReportId, LayoutJson, BindingJson, FilterValues, CreatedBy, CreatedAt, IsActive)
     VALUES (?, ?, ?, ?, NULL, ?, SYSUTCDATETIME(), 1)`,
    taskId, reportId, layoutRow.ConfigJson, bindingJson, userId,
  );

  console.info(`[snapshot] Created snapshot ${snapshotId} for task ${taskId} (report ${reportId})`);
  return snapshotId;
}

// ── getSnapshot ───────────────────────────────────────────────────────────────

export async function getSnapshot(snapshotId: number): Promise<SnapshotRecord | null> {
  const row = await dbGet<{
    SnapshotId: number; TaskId: number; ReportId: number;
    LayoutJson: string; BindingJson: string; FilterValues: string | null;
    CreatedBy: string; CreatedAt: Date | string;
  }>(
    `SELECT SnapshotId, TaskId, ReportId, LayoutJson, BindingJson,
            FilterValues, CreatedBy, CreatedAt
       FROM dbo.cfg_Snapshot WHERE SnapshotId = ?`,
    snapshotId,
  );
  if (!row) return null;
  return {
    snapshotId:   row.SnapshotId,
    taskId:       row.TaskId,
    reportId:     row.ReportId,
    layoutJson:   row.LayoutJson,
    bindingJson:  row.BindingJson,
    filterValues: row.FilterValues,
    createdBy:    row.CreatedBy,
    createdAt:    row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
  };
}

/** Returns the active snapshot for a task, or null. */
export async function getActiveSnapshot(taskId: number): Promise<SnapshotRecord | null> {
  const row = await dbGet<{ SnapshotId: number }>(
    `SELECT TOP 1 SnapshotId FROM dbo.cfg_Snapshot WHERE TaskId = ? AND IsActive = 1
     ORDER BY CreatedAt DESC`,
    taskId,
  );
  if (!row) return null;
  return getSnapshot(row.SnapshotId);
}

// ── getSnapshotGrid ───────────────────────────────────────────────────────────

export async function getSnapshotGrid(snapshotId: number): Promise<DataEntryGridResponse> {
  const snap = await getSnapshot(snapshotId);
  if (!snap) {
    const e = new Error('Snapshot non trovato');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  const layout = JSON.parse(snap.layoutJson) as DataEntryGridResponse['layout'];
  const binding = JSON.parse(snap.bindingJson) as SnapshotBindingInfo;

  const [schemaName, factTable] = splitFact(binding.factTable);
  const joinConfig = binding.joinConfig;
  const writeTable = `${factTable}_WRITE`;

  const filtriFields  = layout.filtri.map((f) => f.fieldName);
  const righeFields   = layout.righe.map((f) => f.fieldName);
  const colonneFields = layout.colonne.map((f) => f.fieldName);
  const valoriFields  = layout.valori.map((f) => f.fieldName);

  validateLayoutIdentifiers(filtriFields, righeFields, colonneFields, valoriFields);

  // Filter options
  const filtriOptions = await Promise.all(
    layout.filtri.map(async (f) => {
      if (isGroupingItem(f)) {
        return { fieldName: f.fieldName, label: f.label,
                 values: await getDistinctParamGroupings(f.paramTableId!) };
      }
      const [qs, qt] = resolveDistinctSource(
        f.fieldName, (f as any).dimTable as string | null, joinConfig, schemaName, factTable,
      );
      try {
        return { fieldName: f.fieldName, label: f.label,
                 values: await getDistinctColValues(qs, qt, f.fieldName) };
      } catch {
        return { fieldName: f.fieldName, label: f.label, values: [] };
      }
    }),
  );

  // Row options — uses reportId for hierarchy defs lookup
  const righeOptions = await getMultiLevelRigheOptions(
    schemaName, factTable, layout.righe, snap.reportId,
  );

  // Column options
  const colonneOptions = await Promise.all(
    layout.colonne.map(async (f) => {
      if (isGroupingItem(f)) {
        return { fieldName: f.fieldName,
                 values: await getDistinctParamGroupings(f.paramTableId!) };
      }
      const [qs, qt] = resolveDistinctSource(
        f.fieldName, (f as any).dimTable as string | null, joinConfig, schemaName, factTable,
      );
      return { fieldName: f.fieldName,
               values: await getDistinctColValues(qs, qt, f.fieldName) };
    }),
  );

  // Write rows (same live table as regular data entry)
  const factFiltriFields  = layout.filtri.filter(isFactDim).map((f) => f.fieldName);
  const factRigheFields   = layout.righe.filter(isFactDim).map((f) => f.fieldName);
  const factColonneFields = layout.colonne.filter((f) => !isGroupingItem(f)).map((f) => f.fieldName);
  const allDimFields      = [...factFiltriFields, ...factRigheFields, ...factColonneFields];

  let writeRows = await loadWriteRows(schemaName, writeTable, allDimFields, valoriFields);
  const factRows = await loadAggregatedFactRows(schemaName, factTable, joinConfig, layout, snap.reportId);
  if (writeRows.length === 0) {
    writeRows = factRows;
  } else {
    const writeKeys = new Set(writeRows.map((r) => sortedJson(r.dimensionValues)));
    for (const fr of factRows) {
      if (!writeKeys.has(sortedJson(fr.dimensionValues))) writeRows.push(fr);
    }
  }

  return {
    bindingInfo: { factTable, schemaName, writeTable },
    layout,
    filtriOptions,
    righeOptions,
    colonneOptions,
    writeRows,
    approvedRows: [],  // Snapshots don't participate in the approval workflow
  };
}

// ── saveSnapshotCell ──────────────────────────────────────────────────────────

export async function saveSnapshotCell(
  snapshotId: number, dto: SaveCellDto, userId: string,
): Promise<void> {
  const snap = await getSnapshot(snapshotId);
  if (!snap) {
    const e = new Error('Snapshot non trovato');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  const layout = JSON.parse(snap.layoutJson) as DataEntryGridResponse['layout'];
  const binding = JSON.parse(snap.bindingJson) as SnapshotBindingInfo;

  const [schemaName, factTable] = splitFact(binding.factTable);
  const writeTable = `${factTable}_WRITE`;

  const valoriFields  = layout.valori.map((f) => f.fieldName);
  const factFiltriFields  = layout.filtri.filter(isFactDim).map((f) => f.fieldName);
  const factRigheFields   = layout.righe.filter(isFactDim).map((f) => f.fieldName);
  const factColonneFields = layout.colonne.filter((f) => !isGroupingItem(f)).map((f) => f.fieldName);
  const allDimFields      = [...factFiltriFields, ...factRigheFields, ...factColonneFields];

  assertValidIdentifier(dto.valoreField, 'valoreField');
  if (!valoriFields.includes(dto.valoreField)) {
    const e = new Error(`Campo valori "${dto.valoreField}" non presente nel layout snapshot`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }

  for (const f of allDimFields) {
    if (!(f in dto.dimensionValues)) {
      const e = new Error(`Valore mancante per la dimensione "${f}"`);
      (e as Error & { statusCode: number }).statusCode = 400;
      throw e;
    }
  }

  await ensureWriteTable(schemaName, writeTable, allDimFields, valoriFields);

  const whereClause = allDimFields.map((f) => `[${f}] = ?`).join(' AND ');
  const dimValues   = allDimFields.map((f) => dto.dimensionValues[f] ?? '');

  const currentRow = await dbGet<Record<string, unknown>>(
    `SELECT [${dto.valoreField}] FROM [${schemaName}].[${writeTable}] WHERE ${whereClause}`,
    ...dimValues,
  );

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
}
