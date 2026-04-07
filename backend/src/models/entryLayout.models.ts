/**
 * Models for the Entry Layout configuration.
 *
 * An EntryLayout defines how the data-entry grid for a given report
 * is structured: which fields act as filters, which as rows/columns,
 * and which are the editable values.
 *
 * For axis items (filtri/righe/colonne) linked to a KPI _PARAM table,
 * paramTableId is set so the UI can use the param-defined order/groupings.
 */

export interface EntryAxisItem {
  fieldName:    string;        // dbField from DatasetBinding.fieldMappings
  label:        string;        // businessLabel copy (denormalised for runtime)
  paramTableId: number | null; // if this dimension has a _PARAM table
  /**
   * When set, this field is sourced from a dimension/JOIN table rather than the
   * fact table itself.  Value must be a fully-qualified table name, e.g.
   * "dbo.tCFS_ReclassificationHierarchy".
   * The data-entry service resolves the JOIN key from cfg_DatasetBinding.JoinConfig.
   * Fields with dimTable are used for display/navigation; the write key is derived
   * from the ordered combination of all righe fieldNames (same behaviour as plain
   * multi-level righe — the WRITE table PK includes every righe column).
   */
  dimTable?: string | null;
  /**
   * For colonne items only: list of member values that should be locked (read-only)
   * in the data-entry grid. Users cannot edit cells in locked column members.
   * Stored as part of ConfigJson in cfg_EntryLayout.
   */
  lockedMembers?: string[];
  /**
   * For righe dim-table / P&C hierarchy items: skip the first N depth levels.
   * depth=0 nodes are hidden; depth=N becomes the new visual root.
   */
  skipDepths?: number;
  /** When the axis item is a P&C hierarchy field, stores the HierarchyDefId. */
  hierarchyDefId?: number;
}

export type AggregationFn = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'NONE';

export interface EntryValueItem {
  fieldName:   string;
  label:       string;
  aggregation: AggregationFn; // default 'SUM'
}

export interface EntryLayoutConfig {
  filtri:  EntryAxisItem[];
  righe:   EntryAxisItem[];
  colonne: EntryAxisItem[];
  valori:  EntryValueItem[];
}

export interface EntryLayoutRecord {
  layoutId:  number;
  reportId:  number;
  config:    EntryLayoutConfig;
  updatedAt: string | null;
}

export interface UpsertEntryLayoutDto {
  config: EntryLayoutConfig;
}
