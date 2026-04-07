/**
 * Report Query Builder — generates parameterized SQL for the CFS P&L report.
 *
 * V4: supporto columnDimension (Process | Entity | AdjLevel).
 *     La colonna di raggruppamento cambia in base alla modalità:
 *       - Process  → GROUP BY RclAccountKey, LoadId     (default)
 *       - Entity   → GROUP BY RclAccountKey, EntityId
 *       - AdjLevel → GROUP BY RclAccountKey, AdjLevlId
 *
 * In tutti i casi il risultato è FactLeafRow[] con loadId = chiave colonna.
 *
 * V3: ALL parameters are positional placeholders — zero string concatenation of user data.
 *
 * Colonne reali nel DB Azure:
 *  vCFS_FactValue_Local_Cube : RclAccountKey, LoadId, EntityId, CurrencyId, AdjLevlId,
 *                              AmountLocCurrency, PLIs_SQL, DimAcc01Code, DimAcc02Code, Counterpart
 *  vCFS_ReclassificationHierarchy : FolderFatherKey, FolderChildKey, Folder, Folder_Code,
 *                                   InLevelOrder, HierarchyMasterLever
 */
import { dbAll } from '../../config/dbHelpers';
import { FilterState, FactLeafRow, ColumnDimension } from '../../models/report.models';

interface RawFactRow {
  RclAccountKey: string;
  ColId:         number;   // loadId, entityId o adjLevelId a seconda della modalità
  Amount:        number;
  Version:       number;
}

function buildStringInFilter(values: string[], params: unknown[], field: string): string {
  if (!values.length) return '';
  const ph = values.map(() => '?').join(',');
  values.forEach((v) => params.push(v));
  return `AND ${field} IN (${ph})`;
}

function buildIntInFilter(values: number[], params: unknown[], field: string): string {
  if (!values.length) return '';
  const ph = values.map(() => '?').join(',');
  values.forEach((v) => params.push(v));
  return `AND ${field} IN (${ph})`;
}

export async function queryLeafFacts(filter: FilterState): Promise<FactLeafRow[]> {
  const mode: ColumnDimension = filter.columnDimension ?? 'Process';

  const params: unknown[] = [];

  const entityPh = filter.entityIds.map(() => '?').join(',');
  filter.entityIds.forEach((id) => params.push(id));

  const loadPh = filter.loadIds.map(() => '?').join(',');
  filter.loadIds.forEach((id) => params.push(id));

  params.push(filter.currencyId);
  params.push(filter.scopeId);

  // Filtro AdjLevel opzionale — per la modalità AdjLevel-in-columns NON applicare
  // (tutte le adj come colonne), a meno che l'utente non abbia selezionato un subset esplicito
  const adjClause = (() => {
    if (mode === 'AdjLevel') return ''; // le adj diventano colonne, nessun filtro aggiuntivo
    const levels = (filter.adjLevelIds ?? []).filter((id) => id >= 0);
    if (!levels.length) return '';
    const ph = levels.map(() => '?').join(',');
    levels.forEach((id) => params.push(id));
    return `AND f.AdjLevlId IN (${ph})`;
  })();

  const cc1Clause = buildStringInFilter(filter.costCenterCodes ?? [], params, 'f.DimAcc01Code');
  const co2Clause = buildStringInFilter(filter.coCodes ?? [],         params, 'f.DimAcc02Code');
  const cpClause  = buildIntInFilter(filter.counterpartIds ?? [],     params, 'f.Counterpart');

  // Colonna di raggruppamento in base alla modalità
  const colField = mode === 'Entity'   ? 'f.EntityId'  :
                   mode === 'AdjLevel' ? 'f.AdjLevlId' :
                   'f.LoadId';

  const sql = `
    SELECT
      f.RclAccountKey,
      ${colField} AS ColId,
      SUM(
        CASE WHEN COALESCE(f.PLIs_SQL, 0) = 1 THEN -1.0 ELSE 1.0 END
        * f.AmountLocCurrency
      ) AS Amount,
      1 AS Version
    FROM  vCFS_FactValue_Local_Cube f
    JOIN  vCFS_ReclassificationHierarchy h
           ON h.FolderChildKey = f.RclAccountKey
    WHERE f.EntityId   IN (${entityPh})
      AND f.LoadId      IN (${loadPh})
      AND f.CurrencyId   = ?
      AND f.AdjLevlId   IN (
            SELECT AdjLevelId FROM tCFS_Mapping_AdjLevel_ScopeId WHERE ScopeId = ?
          )
      ${adjClause}
      ${cc1Clause}
      ${co2Clause}
      ${cpClause}
    GROUP BY f.RclAccountKey, ${colField}`;

  const rawRows = await dbAll<RawFactRow>(sql, ...params);

  return rawRows.map((r): FactLeafRow => ({
    rclAccountKey: r.RclAccountKey,
    loadId:        r.ColId,   // sempre chiamato loadId per compatibilità con aggregatore
    amount:        r.Amount ?? 0,
    version:       r.Version ?? 1,
  }));
}

/**
 * Fetches active deltas from app_Delta and returns them as FactLeafRow[].
 * The delta ColId follows the same logic as queryLeafFacts (Process/Entity/AdjLevel).
 */
export async function queryDeltas(filter: FilterState): Promise<FactLeafRow[]> {
  const mode: ColumnDimension = filter.columnDimension ?? 'Process';

  const colField = mode === 'Entity'   ? 'EntityId'   :
                   mode === 'AdjLevel' ? 'AdjLevelId' :
                   'LoadId';

  const params: unknown[] = [];

  const entityPh = filter.entityIds.map(() => '?').join(',');
  filter.entityIds.forEach((id) => params.push(id));

  const loadPh = filter.loadIds.map(() => '?').join(',');
  filter.loadIds.forEach((id) => params.push(id));

  params.push(filter.currencyId);

  const sql = `
    SELECT
      RclAccountKey,
      ${colField}      AS ColId,
      SUM(DeltaValue)  AS Amount,
      MAX(Version)     AS Version
    FROM app_Delta
    WHERE EntityId   IN (${entityPh})
      AND LoadId      IN (${loadPh})
      AND CurrencyId  = ?
      AND IsActive    = 1
    GROUP BY RclAccountKey, ${colField}`;

  const rows = await dbAll<RawFactRow>(sql, ...params);
  return rows.map((r): FactLeafRow => ({
    rclAccountKey: r.RclAccountKey,
    loadId:        r.ColId,
    amount:        r.Amount ?? 0,
    version:       r.Version ?? 1,
  }));
}
