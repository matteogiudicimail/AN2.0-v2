/**
 * Backend models for report query and response.
 * These mirror the frontend report.models.ts interfaces.
 */

export type ColumnDimension = 'Process' | 'Entity' | 'AdjLevel';

export interface FilterState {
  entityIds:              number[];
  scopeId:                number;
  currencyId:             number;
  loadIds:                number[];
  includeManualWriteback: boolean;
  adjLevelIds:            number[];
  costCenterCodes:        string[];
  coCodes:                string[];
  counterpartIds:         number[];
  /** Quale dimensione usare come colonne della griglia. Default: 'Process' */
  columnDimension?:       ColumnDimension;
}

export interface ReportRow {
  rclAccountKey:  string;
  parentRclKey:   string | null;
  dataPath:       string[];
  label:          string;
  level:          number;
  isLeaf:         boolean;
  isSynthetic:    boolean;
  plis:           number;
  adjLevelId?:    number;
  values:         Record<string, number | null>;
  versions:       Record<string, number>;
  /** Keys that have at least one active delta (leaf rows only). loadId as string → true */
  hasAdjustments: Record<string, boolean>;
}

export interface ProcessColumn {
  loadId:             number;
  processDescription: string;
  month:              string;
  scenario:           string;
  isLocked:           boolean;
}

export interface ReportResponse {
  rows:           ReportRow[];
  processColumns: ProcessColumn[];
  lockedLoadIds:  number[];
}

/** Internal leaf-level fact row returned by the SQL query */
export interface FactLeafRow {
  rclAccountKey:  string;
  loadId:         number;
  amount:         number;
  version:        number;
}
