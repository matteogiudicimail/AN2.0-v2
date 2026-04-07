/**
 * Report Service — orchestrates hierarchy + query + aggregation.
 * Supporta tre modalità colonne: Process (default), Entity, AdjLevel.
 */
import { getReclassificationHierarchy, getSyntheticNodes } from '../hierarchyService';
import { queryLeafFacts, queryDeltas } from './reportQueryBuilder';
import { aggregateReport } from './reportAggregator';
import { getAllProcesses, getProcessLockStatus } from '../processService';
import { getAllEntities } from '../entityService';
import { getAdjLevelsForScope } from '../scopeService';
import { FilterState, ReportResponse, ProcessColumn, ColumnDimension, FactLeafRow } from '../../models/report.models';

export async function executeReport(filter: FilterState): Promise<ReportResponse> {
  const mode: ColumnDimension = filter.columnDimension ?? 'Process';

  // Step 1: fetch hierarchy, base facts and deltas in parallel
  const [hierarchy, baseFacts, deltaFacts] = await Promise.all([
    getReclassificationHierarchy(),
    queryLeafFacts(filter),
    queryDeltas(filter),
  ]);

  // Step 2: fetch synthetic nodes — needs hierarchy to build correct dataPath
  const syntheticNodes = await getSyntheticNodes(filter.entityIds, filter.loadIds, hierarchy);

  // Step 3: build delta map and adjustedKeys set
  // adjustedKeys drives the "!" badge on adjusted cells.
  const deltaMap     = new Map<string, number>();
  const adjustedKeys = new Set<string>();
  for (const d of deltaFacts) {
    const key = `${d.rclAccountKey}||${d.loadId}`;
    deltaMap.set(key, (deltaMap.get(key) ?? 0) + d.amount);
    adjustedKeys.add(key);
  }

  // Step 4: merge deltas onto natural base facts
  const naturalKeys = new Set(baseFacts.map((f) => f.rclAccountKey));
  const facts: FactLeafRow[] = baseFacts.map((f) => {
    const key = `${f.rclAccountKey}||${f.loadId}`;
    const delta = deltaMap.get(key) ?? 0;
    return delta !== 0 ? { ...f, amount: f.amount + delta } : f;
  });

  // Step 5: inject synthetic-node rows.
  // Synthetic nodes have no rows in vCFS_FactValue_Local_Cube — their value IS the delta sum.
  for (const [key, amount] of deltaMap) {
    const sepIdx = key.indexOf('||');
    const rclAccountKey = key.slice(0, sepIdx);
    const loadId        = Number(key.slice(sepIdx + 2));
    if (!naturalKeys.has(rclAccountKey)) {
      facts.push({ rclAccountKey, loadId, amount, version: 1 });
    }
  }

  // Le chiavi colonna sono gli ID distinti restituiti dalla query
  const columnIds = [...new Set(facts.map((f) => f.loadId))];

  // Aggrega usando columnIds come "loadIds" — l'aggregatore è generico
  const rows = aggregateReport(hierarchy, facts, columnIds, syntheticNodes, adjustedKeys);

  // Costruisce i descrittori colonna in base alla modalità
  let processColumns: ProcessColumn[];

  if (mode === 'Entity') {
    const allEntities = await getAllEntities();
    processColumns = columnIds.map((entityId): ProcessColumn => {
      const e = allEntities.find((en) => en.entityId === entityId);
      return {
        loadId:             entityId,
        processDescription: e ? `${e.entityCode} — ${e.entityName}` : `Entity ${entityId}`,
        month:              '',
        scenario:           '',
        isLocked:           false,
      };
    });

  } else if (mode === 'AdjLevel') {
    const allAdj = await getAdjLevelsForScope(filter.scopeId);
    processColumns = columnIds.map((adjLevelId): ProcessColumn => {
      const a = allAdj.find((al) => al.adjLevelId === adjLevelId);
      return {
        loadId:             adjLevelId,
        processDescription: a?.adjLevelCode ?? a?.adjLevelDescription ?? `AdjLevel ${adjLevelId}`,
        month:              '',
        scenario:           '',
        isLocked:           false,
      };
    });

  } else {
    // Default: Process
    const allProcesses = await getAllProcesses();
    const lockMap      = await getProcessLockStatus(filter.loadIds);
    processColumns = filter.loadIds.map((loadId): ProcessColumn => {
      const proc = allProcesses.find((p) => p.loadId === loadId);
      return {
        loadId,
        processDescription: proc?.processDescription ?? `Process ${loadId}`,
        month:              proc?.month ?? '',
        scenario:           proc?.scenario ?? '',
        isLocked:           lockMap.get(loadId) ?? false,
      };
    });
  }

  const lockedLoadIds = processColumns
    .filter((c) => c.isLocked)
    .map((c) => c.loadId);

  return { rows, processColumns, lockedLoadIds };
}
