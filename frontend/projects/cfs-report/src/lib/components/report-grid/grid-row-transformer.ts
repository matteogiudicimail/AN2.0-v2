/**
 * Transforms flat ReportRow[] (with dataPath[]) into AG Grid tree-data format.
 * AG Grid treeData expects every row to have a `dataPath: string[]` property.
 */
import { ReportRow } from '../../models/report.models';

export interface GridRow {
  /** Unique row identifier */
  rowId: string;
  /** Hierarchy path from root → leaf — consumed by AG Grid getDataPath */
  dataPath: string[];
  /** Display label for the hierarchy column */
  label: string;
  /** Process → amount map (key = loadId as string) */
  values: Record<string, number | null>;
  /** Version map for optimistic locking (key = loadId as string) */
  versions: Record<string, number>;
  /** True → synthetic write-back node, rendered in italic */
  isSynthetic: boolean;
  /** True → leaf node (editable) */
  isLeaf: boolean;
  /** Rcl account key for writeback */
  rclAccountKey: string;
  /** Adj level id, if set */
  adjLevelId: number | null;
  /** loadId keys with at least one active adjustment (leaf rows only) — drives "!" badge */
  hasAdjustments: Record<string, boolean>;
}

/**
 * Converts server-side ReportRow[] to AG Grid tree rows.
 * dataPath elements must be UNIQUE keys (not display names) to avoid collisions
 * in ragged hierarchies; we use rclAccountKey for leaves and the path items
 * for parents.
 */
export function transformRows(rows: ReportRow[]): GridRow[] {
  return rows.map((r): GridRow => ({
    rowId:          r.rclAccountKey,
    dataPath:       r.dataPath,
    label:          r.label,
    values:         r.values,
    versions:       r.versions,
    isSynthetic:    r.isSynthetic,
    isLeaf:         r.isLeaf,
    rclAccountKey:  r.rclAccountKey,
    adjLevelId:     r.adjLevelId ?? null,
    hasAdjustments: r.hasAdjustments ?? {},
  }));
}
