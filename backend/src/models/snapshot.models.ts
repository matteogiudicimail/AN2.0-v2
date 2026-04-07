/**
 * Snapshot models — frozen layout snapshot for published tasks.
 */

export interface SnapshotRecord {
  snapshotId:   number;
  taskId:       number;
  reportId:     number;
  layoutJson:   string;
  bindingJson:  string;
  filterValues: string | null;
  createdBy:    string;
  createdAt:    string;
}

export interface SnapshotBindingInfo {
  factTable:  string;
  joinConfig: Array<{ leftKey: string; rightTable: string; rightKey?: string; joinType?: string }>;
}
