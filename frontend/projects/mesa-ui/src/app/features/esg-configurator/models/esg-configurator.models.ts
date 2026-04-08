export type DataModelStatus = 'Draft' | 'ReadyForPublish' | 'Published' | 'Archived';
export type WritebackMode   = 'Delta' | 'Overwrite';

// ── Data Model (Report) ───────────────────────────────────────────────────────

export interface DataModelSummary {
  reportId:      number;
  reportCode:    string;
  reportLabel:   string;
  domain:        string | null;
  category:      string | null;
  status:        DataModelStatus;
  version:       number;
  writebackMode: WritebackMode;
  createdBy:     string;
  createdAt:     string;
  updatedAt:     string | null;
}

export interface DataModelDetail extends DataModelSummary {
  description: string | null;
  tags:        string | null;
  owner:       string | null;
  isActive:    boolean;
}

export interface CreateDataModelDto {
  reportCode:    string;
  reportLabel:   string;
  description?:  string;
  domain?:       string;
  writebackMode?: WritebackMode;
}

export interface UpdateDataModelDto {
  reportLabel?:   string;
  description?:   string;
  writebackMode?: WritebackMode;
}

// Keep legacy aliases for backward-compat (backend still uses ReportSummary names)
export type ReportSummary        = DataModelSummary;
export type ReportDetail         = DataModelDetail;
export type CreateReportDto      = CreateDataModelDto;
export type UpdateReportDto      = UpdateDataModelDto;

// ── Dataset Binding ───────────────────────────────────────────────────────────

export interface FieldMapping {
  dbField:       string;
  businessLabel: string;
  fieldType:     'measure' | 'dimension' | 'key' | 'period' | 'scenario' | 'note' | 'audit';
  editable:      boolean;
}

export interface JoinConfig {
  leftTable:  string;
  rightTable: string;
  leftKey:    string;
  rightKey:   string;
  joinType:   'INNER' | 'LEFT';
  smartName?: string;   // friendly alias for the dim table
}

export interface HierarchyDef {
  hierarchyDefId?: number;
  bindingId?:      number;
  dimTable:        string;    // schema.table
  childKeyCol:     string;
  parentKeyCol:    string;
  labelCol:        string;
  orderCol?:       string | null;
  smartName?:      string | null;
}

export interface DatasetBinding {
  bindingId:           number;
  reportId:            number;
  factTable:           string;
  factTableSmartName?: string;
  fieldMappings:       FieldMapping[];
  joinConfig:          JoinConfig[];
  hierarchyDefs?:      HierarchyDef[];
  createdBy:           string;
  createdAt:           string;
}

export interface UpsertDatasetBindingDto {
  factTable:           string;
  factTableSmartName?: string;
  fieldMappings:       FieldMapping[];
  joinConfig:          JoinConfig[];
}

// ── DB Explorer ───────────────────────────────────────────────────────────────

export interface DbTableInfo {
  tableName:  string;
  schemaName: string;
  rowCount:   number | null;
  tableType?: 'TABLE' | 'VIEW';
}

export interface DbColumnInfo {
  columnName:   string;
  dataType:     string;
  maxLength:    number | null;
  isNullable:   boolean;
  isPrimaryKey: boolean;
}

// ── Parameter Tables ──────────────────────────────────────────────────────────

export type RowKind = 'Aggregate' | 'Indicator';

/** @deprecated use RowKind */
export type LegacyRowKind = 'Aggregato' | 'Indicatore';

export interface CustomColumnDef {
  name:     string;
  label:    string;
  dataType: 'text' | 'number' | 'boolean' | 'date';
  width?:   number;
}

export interface ParamTableInfo {
  paramTableId:     number;
  reportId:         number;
  schemaName:       string;
  factTableName:    string;
  columnName:       string;
  paramTableName:   string;
  customColumnDefs: CustomColumnDef[];
  createdAt:        string;
}

export interface CreateParamTableDto {
  schema:    string;
  factTable: string;
  column:    string;
}

export interface ParamRow {
  paramId:           number;
  sourceValue:       string;
  label:             string;
  rowKind:           RowKind | LegacyRowKind;
  indentLevel:       number;
  parentParamId:     number | null;
  grouping:          string | null;   // was: raggruppamento
  formula:           string | null;
  compilationGuide:  string | null;   // was: guidaCompilazione
  isEditable:        boolean;
  isFormula:         boolean;
  isVisible:         boolean;
  sortOrder:         number;
  customColumns:     Record<string, unknown> | null;
}

export interface UpsertParamRowDto {
  sourceValue:       string;
  label:             string;
  rowKind?:          RowKind | LegacyRowKind;
  parentParamId?:    number | null;
  grouping?:         string | null;
  formula?:          string | null;
  compilationGuide?: string | null;
  isEditable?:       boolean;
  isFormula?:        boolean;
  isVisible?:        boolean;
  sortOrder?:        number;
  customColumns?:    Record<string, unknown> | null;
}

export interface DistinctValuesResult {
  values: string[];
  total:  number;
}

export interface SeedResult {
  inserted: number;
}

// ── Entry Layout ──────────────────────────────────────────────────────────────

export interface EntryAxisItem {
  fieldName:      string;
  label:          string;
  paramTableId:   number | null;
  dimTable?:      string | null;
  skipDepths?:    number;
  /** For colonne items: list of member values that should be locked (read-only in the grid). */
  lockedMembers?: string[];
  /** Set when the axis item is a Parent-Child hierarchy field. */
  hierarchyDefId?: number;
}

export type AggregationFn = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'NONE';

export interface EntryValueItem {
  fieldName:   string;
  label:       string;
  aggregation: AggregationFn;
}

/** Four-zone pivot layout stored as ConfigJson in cfg_EntryLayout. */
export interface EntryLayoutConfig {
  filters:  EntryAxisItem[];   // was: filtri
  rows:     EntryAxisItem[];   // was: righe
  columns:  EntryAxisItem[];   // was: colonne
  values:   EntryValueItem[];  // was: valori
}

export interface EntryLayout {
  layoutId:  number;
  reportId:  number;
  config:    EntryLayoutConfig;
  updatedAt: string | null;
}

// ── Data Entry Sheet ──────────────────────────────────────────────────────────

export interface DataEntryFilterOption {
  fieldName: string;
  label:     string;
  values:    string[];
}

/** @deprecated use DataEntryFilterOption */
export type DataEntryFiltriOption = DataEntryFilterOption;

export interface DataEntryRowOption {
  depth:        number;
  fieldName:    string;
  value:        string;
  label:        string;
  isLeaf:       boolean;
  pathValues:   Record<string, string>;
  ancestorKeys?: string[];
  paramRow: {
    rowKind:          RowKind | LegacyRowKind;
    indentLevel:      number;
    grouping:         string | null;
    formula:          string | null;
    compilationGuide: string | null;
    isEditable:       boolean;
    isFormula:        boolean;
  } | null;
}

/** @deprecated use DataEntryRowOption */
export type DataEntryRigaOption = DataEntryRowOption;

export interface WriteRow {
  dimensionValues: Record<string, string>;
  values:          Record<string, string | null>;
}

export interface DataEntryGridResponse {
  bindingInfo: {
    factTable:  string;
    schemaName: string;
    writeTable: string;
  };
  layout: {
    filters:  Array<{ fieldName: string; label: string; paramTableId: number | null; dimTable?: string | null }>;
    rows:     Array<{ fieldName: string; label: string; paramTableId: number | null; dimTable?: string | null; skipDepths?: number }>;
    /** colonne items may include lockedMembers: string[] */
    columns:  Array<{ fieldName: string; label: string; paramTableId: number | null; dimTable?: string | null; lockedMembers?: string[] }>;
    values:   Array<{ fieldName: string; label: string; aggregation: string }>;
    // legacy keys still accepted from backend until full migration
    filtri?:  Array<{ fieldName: string; label: string; paramTableId: number | null; dimTable?: string | null }>;
    righe?:   Array<{ fieldName: string; label: string; paramTableId: number | null; dimTable?: string | null; skipDepths?: number }>;
    colonne?: Array<{ fieldName: string; label: string; paramTableId: number | null; dimTable?: string | null; lockedMembers?: string[] }>;
    valori?:  Array<{ fieldName: string; label: string; aggregation: string }>;
  };
  filterOptions:  DataEntryFilterOption[];
  rowOptions:     DataEntryRowOption[];
  columnOptions:  Array<{ fieldName: string; values: string[] }>;
  writeRows:      WriteRow[];
  /** Sorted-JSON dimension keys of approved (read-only) rows. */
  approvedRows:   string[];
  // legacy keys
  filtriOptions?:  DataEntryFilterOption[];
  righeOptions?:   DataEntryRowOption[];
  colonneOptions?: Array<{ fieldName: string; values: string[] }>;
}

// ── Row Approval ─────────────────────────────────────────────────────────────

export interface RowApprovalDto {
  dimensionsJson: string;
  approved: boolean;
}

export interface BulkRowApprovalDto {
  dimensionsJsonArray: string[];
  approved: boolean;
}

// ── Master Data (Anagrafiche) ─────────────────────────────────────────────────

export interface MasterDataTableDef {
  masterDataId:  number;
  reportId:      number;
  schemaName:    string;
  tableName:     string;
  label:         string;
  primaryKeyCol: string;
  editableCols:  string[];
  createdBy:     string;
  createdAt:     string;
}

export interface RegisterMasterDataDto {
  schemaName:    string;
  tableName:     string;
  label:         string;
  primaryKeyCol: string;
  editableCols:  string[];
}

export interface MasterDataRow {
  pkValue:  string;
  columns:  Record<string, string | null>;
}

export interface UpsertMasterDataRowDto {
  values: Record<string, string | null>;
}

export interface SaveCellDto {
  dimensionValues: Record<string, string>;
  valoreField:     string;
  value:           string;
}

export interface CellHistoryEntry {
  logId:     number;
  oldValue:  string | null;
  newValue:  string;
  writtenBy: string;
  writtenAt: string;
}

export interface CellHistoryRequest {
  dimensionValues: Record<string, string>;
  valoreField:     string;
}

export interface EnsureAdjDto {
  rigaFieldName:     string;
  parentSourceValue: string;
}

export interface EnsureAdjResult {
  created:        boolean;
  adjSourceValue: string;
}

// ── Task / Publish ────────────────────────────────────────────────────────────

export interface TaskSummary {
  taskId:         number;
  reportId:       number;
  taskCode:       string;
  label:          string;
  status:         'Draft' | 'Active' | 'Archived';
  menuItemCode:   string | null;
  parentMenuCode: string | null;
  routeUrl:       string | null;
  allowedRoles:   string | null;
  allowedEntities: string | null;
  defaultFilters: string | null;
  rowOrder:       string | null;
  columnOrder:    string | null;
  accessReaders:  string | null;
  accessWriters:  string | null;
}

export interface UpsertTaskDto {
  label:           string;
  description?:    string;
  menuItemCode?:   string;
  parentMenuCode?: string;
  routeUrl?:       string;
  allowedRoles?:   string;
  defaultFilters?: string;
  rowOrder?:       string;
  columnOrder?:    string;
  accessReaders?:  string;
  accessWriters?:  string;
}

export interface MenuTreeNode {
  code:     string;
  label:    string;
  children: MenuTreeNode[];
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface SnapshotSummary {
  snapshotId:   number;
  taskId:       number;
  reportId:     number;
  createdBy:    string;
  createdAt:    string;
}
