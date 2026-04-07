export interface WritebackRequest {
  rclAccountKey: string;
  loadId: number;
  entityId: number;
  scopeId: number;
  currencyId: number;
  adjLevelId?: number;
  dimAcc01Code?: string | null;
  dimAcc02Code?: string | null;
  counterpart?: string | null;
  newValue: number;
  currentVersion: number;
  annotation?: string;
  /** Parent node rclAccountKey — required when creating a synthetic member */
  parentRclKey?: string;
}

export interface WritebackResponse {
  deltaId: number;
  newEffectiveValue: number;
  newVersion: number;
  /** Synthetic key if a new synthetic member was created */
  syntheticKey?: string;
}

export interface ConflictInfo {
  yourValue: number;
  serverValue: number;
  modifiedBy: string;
  modifiedAt: string;
}

export interface ActiveDelta {
  deltaId: number;
  deltaValue: number;
  annotation: string | null;
  modifiedBy: string;
  modifiedAt: string;
}

export interface CellDetailResponse {
  baseValue: number;
  adjustments: ActiveDelta[];
  effectiveValue: number;
  auditTrail: AuditEntry[];
}

export interface AuditEntry {
  auditId: number;
  deltaId: number;
  modificationType: 'INSERT' | 'UPDATE' | 'REVERT';
  previousValue: number | null;
  newValue: number;
  deltaAmount: number;
  annotation: string | null;
  modifiedBy: string;
  modifiedAt: string;
}
