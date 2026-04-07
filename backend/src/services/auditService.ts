/**
 * Audit Service — retrieves cell modification history from app_DeltaAudit. [F13]
 */
import { dbAll, dbGet } from '../config/dbHelpers';

export interface AuditEntry {
  auditId:           number;
  deltaId:           number;
  modificationType:  'INSERT' | 'UPDATE' | 'REVERT';
  previousValue:     number | null;
  newValue:          number;
  deltaAmount:       number;
  annotation:        string | null;
  modifiedBy:        string;
  modifiedAt:        string;
}

interface AuditRow {
  AuditId:               number;
  DeltaId:               number;
  ModificationType:      string;
  PreviousEffectiveValue: number | null;
  NewEffectiveValue:     number;
  DeltaAmount:           number;
  Annotation:            string | null;
  ModifiedBy:            string;
  ModifiedAt:            string;
}

export interface ActiveDelta {
  deltaId:     number;
  deltaValue:  number;
  annotation:  string | null;
  modifiedBy:  string;
  modifiedAt:  string;
}

export interface CellDetailResponse {
  baseValue:      number;
  adjustments:    ActiveDelta[];
  effectiveValue: number;
  auditTrail:     AuditEntry[];
}

interface DeltaRow {
  DeltaId:    number;
  DeltaValue: number;
  Annotation: string | null;
  CreatedBy:  string;
  CreatedAt:  string;
  UpdatedBy:  string | null;
  UpdatedAt:  string | null;
}

interface AmountRow { Amount: number; }

export async function getCellDetail(
  rclAccountKey: string,
  loadId: number,
  entityId: number,
  scopeId: number,
  currencyId: number,
  adjLevelId?: number,
): Promise<CellDetailResponse> {
  // AmLocSign = AmountLocCurrency * (PLIs_SQL=1 ? -1 : 1) — already sign-adjusted
  const baseParams: unknown[] = [rclAccountKey, entityId, loadId, currencyId, scopeId];
  let baseAdjClause = '';
  if (adjLevelId != null) {
    baseAdjClause = 'AND f.AdjLevlId = ?';
    baseParams.push(adjLevelId);
  }

  const baseRow = await dbGet<AmountRow>(
    `SELECT COALESCE(SUM(f.AmLocSign), 0) AS Amount
     FROM   vCFS_FactValue_Local_Cube f
     WHERE  f.RclAccountKey = ?
       AND  f.EntityId      = ?
       AND  f.LoadId        = ?
       AND  f.CurrencyId    = ?
       AND  f.AdjLevlId    IN (
              SELECT AdjLevelId FROM tCFS_Mapping_AdjLevel_ScopeId WHERE ScopeId = ?
            )
       ${baseAdjClause}`,
    ...baseParams
  );

  const baseValue = baseRow?.Amount ?? 0;

  const deltaParams: unknown[] = [rclAccountKey, loadId, entityId, currencyId];
  let deltaAdjClause = '';
  if (adjLevelId != null) {
    deltaAdjClause = 'AND d.AdjLevelId = ?';
    deltaParams.push(adjLevelId);
  }

  const deltaRows = await dbAll<DeltaRow>(
    `SELECT d.DeltaId, d.DeltaValue, d.Annotation,
            d.CreatedBy, d.CreatedAt, d.UpdatedBy, d.UpdatedAt
     FROM   app_Delta d
     WHERE  d.RclAccountKey = ?
       AND  d.LoadId        = ?
       AND  d.EntityId      = ?
       AND  d.CurrencyId    = ?
       AND  d.IsActive      = 1
       ${deltaAdjClause}
     ORDER  BY d.CreatedAt ASC`,
    ...deltaParams
  );

  const adjustments: ActiveDelta[] = deltaRows.map((r) => ({
    deltaId:    r.DeltaId,
    deltaValue: r.DeltaValue,
    annotation: r.Annotation,
    modifiedBy: r.UpdatedBy ?? r.CreatedBy,
    modifiedAt: r.UpdatedAt ?? r.CreatedAt,
  }));

  const deltaSum = adjustments.reduce((sum, a) => sum + a.deltaValue, 0);
  const auditTrail = await getCellHistory(rclAccountKey, loadId, entityId, currencyId, adjLevelId);

  return { baseValue, adjustments, effectiveValue: baseValue + deltaSum, auditTrail };
}

export async function getCellHistory(
  rclAccountKey: string,
  loadId: number,
  entityId: number,
  currencyId: number,
  adjLevelId?: number,
): Promise<AuditEntry[]> {
  let adjClause = '';
  const params: unknown[] = [rclAccountKey, loadId, entityId, currencyId];

  if (adjLevelId != null) {
    adjClause = 'AND a.AdjLevelId = ?';
    params.push(adjLevelId);
  }

  const rows = await dbAll<AuditRow>(
    `SELECT a.AuditId, a.DeltaId, a.ModificationType,
            a.PreviousEffectiveValue, a.NewEffectiveValue, a.DeltaAmount,
            a.Annotation, a.ModifiedBy, a.ModifiedAt
     FROM   app_DeltaAudit a
     WHERE  a.RclAccountKey = ?
       AND  a.LoadId        = ?
       AND  a.EntityId      = ?
       AND  a.CurrencyId    = ?
       ${adjClause}
     ORDER  BY a.ModifiedAt DESC`,
    ...params
  );

  return rows.map((r): AuditEntry => ({
    auditId:          r.AuditId,
    deltaId:          r.DeltaId,
    modificationType: r.ModificationType as AuditEntry['modificationType'],
    previousValue:    r.PreviousEffectiveValue,
    newValue:         r.NewEffectiveValue,
    deltaAmount:      r.DeltaAmount,
    annotation:       r.Annotation,
    modifiedBy:       r.ModifiedBy,
    modifiedAt:       r.ModifiedAt,
  }));
}
