import { FilterState } from './filter-state.model';

/** One row in the report grid */
export interface ReportRow {
  /** Unique key for this row (rclAccountKey or SyntheticKey) */
  rclAccountKey: string;
  /** Parent key (null for L1 roots) */
  parentRclKey: string | null;
  /** AG Grid tree path: array of keys from root to this node */
  dataPath: string[];
  /** Display label for this node */
  label: string;
  /** Hierarchy depth (1-based) */
  level: number;
  /** True if no natural children */
  isLeaf: boolean;
  /** True if this is a synthetic aggregate-writeback node */
  isSynthetic: boolean;
  /** Sign flag: 1 = amounts stored positive, display negated */
  plis: number;
  /** Adjustment level id if applicable */
  adjLevelId?: number;
  /** Column values keyed by loadId: e.g. { '101': 1900000, '102': 2000000 } */
  values: Record<string, number | null>;
  /** Optimistic lock version per loadId for conflict detection */
  versions: Record<string, number>;
  /** loadId keys that have at least one active adjustment delta (leaf rows only) */
  hasAdjustments?: Record<string, boolean>;
}

/** Column descriptor for a pivoted Process */
export interface ProcessColumn {
  loadId: number;
  processDescription: string;
  month: string;
  scenario: string;
  isLocked: boolean;
}

export interface ReportRequest {
  filterState: FilterState;
}

export interface ReportResponse {
  rows: ReportRow[];
  processColumns: ProcessColumn[];
  lockedLoadIds: number[];
}

/** Cell identification used for writeback */
export interface CellCoordinates {
  rclAccountKey: string;
  loadId: number;
  entityId: number;
  scopeId: number;
  currencyId: number;
  adjLevelId?: number;
  dimAcc01Code?: string | null;
  dimAcc02Code?: string | null;
  counterpart?: string | null;
}
