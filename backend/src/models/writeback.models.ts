/**
 * Writeback request/response models.
 * Mirror the frontend writeback.models.ts interfaces.
 */

export interface WritebackRequest {
  rclAccountKey:  string;
  loadId:         number;
  entityId:       number;
  scopeId:        number;
  currencyId:     number;
  adjLevelId?:    number;
  dimAcc01Code?:  string | null;
  dimAcc02Code?:  string | null;
  counterpart?:   string | null;
  newValue:       number;
  currentVersion: number;
  annotation?:    string;
  parentRclKey?:  string;
}

export interface WritebackResponse {
  deltaId:           number;
  newEffectiveValue: number;
  newVersion:        number;
  syntheticKey?:     string;
}

export interface ConflictInfo {
  yourValue:   number;
  serverValue: number;
  modifiedBy:  string;
  modifiedAt:  string;
}
