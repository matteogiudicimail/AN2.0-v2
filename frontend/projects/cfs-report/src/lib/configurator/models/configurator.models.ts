/**
 * Frontend models for the Configurator module.
 * Mirrors backend/src/models/configurator.models.ts exactly.
 */

export type ReportStatus  = 'Draft' | 'ReadyForPublish' | 'Published' | 'Archived';
export type WritebackMode = 'Delta' | 'Overwrite';
export type RowType       = 'Input' | 'Subtotal' | 'SectionHeader' | 'Spacer' | 'GroupParent';
export type SectionType   = 'Section' | 'Subsection';
export type LayoutStyle   = 'flat' | 'grouped' | 'collapsible';
export type TaskStatus    = 'Draft' | 'Active' | 'Archived';

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ReportSummary {
  reportId:      number;
  reportCode:    string;
  reportLabel:   string;
  domain:        string | null;
  category:      string | null;
  status:        ReportStatus;
  version:       number;
  writebackMode: WritebackMode;
  createdBy:     string;
  createdAt:     string;
  updatedAt:     string | null;
}

export interface ReportDetail extends ReportSummary {
  description: string | null;
  tags:        string | null;
  owner:       string | null;
  isActive:    boolean;
}

export interface CreateReportDto {
  reportCode:    string;
  reportLabel:   string;
  description?:  string;
  domain?:       string;
  category?:     string;
  tags?:         string;
  owner?:        string;
  writebackMode?: WritebackMode;
}

export interface UpdateReportDto {
  reportLabel?:   string;
  description?:   string;
  domain?:        string;
  category?:      string;
  tags?:          string;
  owner?:         string;
  writebackMode?: WritebackMode;
  status?:        ReportStatus;
}

// ── Dataset Binding ───────────────────────────────────────────────────────────

export interface FieldMapping {
  dbField:       string;
  businessLabel: string;
  fieldType:     'measure' | 'dimension' | 'key' | 'period' | 'scenario' | 'note' | 'audit';
  role:          string;
  required:      boolean;
  editable:      boolean;
  visible:       boolean;
  notes?:        string;
}

export interface JoinConfig {
  leftTable:  string;
  rightTable: string;
  leftKey:    string;
  rightKey:   string;
  joinType:   'INNER' | 'LEFT';
}

export interface DatasetBinding {
  bindingId:     number;
  reportId:      number;
  factTable:     string;
  fieldMappings: FieldMapping[];
  joinConfig:    JoinConfig[];
  createdBy:     string;
  createdAt:     string;
}

export interface UpsertDatasetBindingDto {
  factTable:     string;
  fieldMappings: FieldMapping[];
  joinConfig:    JoinConfig[];
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export interface ReportRowDef {
  rowId:            number;
  reportId:         number;
  rowCode:          string;
  label:            string;
  unitOfMeasure:    string | null;
  rowType:          RowType;
  parentRowCode:    string | null;
  indentLevel:      number;
  isEditable:       boolean;
  isVisible:        boolean;
  sortOrder:        number;
  measureField:     string | null;
  dimensionMembers: unknown[] | null;
  subtotalConfig:   unknown | null;
  sectionCode:      string | null;
  subsectionCode:   string | null;
}

export interface UpsertRowDto {
  rowCode:           string;
  label:             string;
  unitOfMeasure?:    string;
  rowType?:          RowType;
  parentRowCode?:    string;
  indentLevel?:      number;
  isEditable?:       boolean;
  isVisible?:        boolean;
  sortOrder?:        number;
  measureField?:     string;
  dimensionMembers?: unknown[];
  subtotalConfig?:   unknown;
  sectionCode?:      string;
  subsectionCode?:   string;
}

// ── Columns ───────────────────────────────────────────────────────────────────

export interface ReportColumnDef {
  columnId:      number;
  reportId:      number;
  columnCode:    string;
  label:         string;
  dimensionName: string | null;
  memberKey:     string | null;
  isSystem:      boolean;
  defaultWidth:  number;
  isVisible:     boolean;
  sortOrder:     number;
  headerFormat:  string;
}

export interface UpsertColumnDto {
  columnCode:    string;
  label:         string;
  dimensionName?: string;
  memberKey?:    string;
  isSystem?:     boolean;
  defaultWidth?: number;
  isVisible?:    boolean;
  sortOrder?:    number;
  headerFormat?: string;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ReportFilterDef {
  filterId:      number;
  reportId:      number;
  filterCode:    string;
  label:         string;
  dimensionName: string;
  isVisible:     boolean;
  isMultiSelect: boolean;
  isMandatory:   boolean;
  defaultValue:  string | null;
  dependsOn:     string | null;
  sortOrder:     number;
}

export interface UpsertFilterDto {
  filterCode:     string;
  label:          string;
  dimensionName:  string;
  isVisible?:     boolean;
  isMultiSelect?: boolean;
  isMandatory?:   boolean;
  defaultValue?:  string;
  dependsOn?:     string;
  sortOrder?:     number;
}

// ── Sections ──────────────────────────────────────────────────────────────────

export interface ReportSectionDef {
  sectionId:           number;
  reportId:            number;
  sectionCode:         string;
  label:               string;
  description:         string | null;
  parentSectionCode:   string | null;
  sectionType:         SectionType;
  layoutStyle:         LayoutStyle;
  isCollapsible:       boolean;
  isExpandedByDefault: boolean;
  icon:                string | null;
  sortOrder:           number;
  isVisible:           boolean;
}

export interface UpsertSectionDto {
  sectionCode:          string;
  label:                string;
  description?:         string;
  parentSectionCode?:   string;
  sectionType?:         SectionType;
  layoutStyle?:         LayoutStyle;
  isCollapsible?:       boolean;
  isExpandedByDefault?: boolean;
  icon?:                string;
  sortOrder?:           number;
  isVisible?:           boolean;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export interface ReportLayout {
  layoutId:              number;
  reportId:              number;
  density:               'compact' | 'standard';
  frozenColumnCount:     number;
  kpiColumnWidth:        number;
  umColumnWidth:         number;
  metadataColumnVisible: boolean;
  defaultColumnWidth:    number;
  stickyHeader:          boolean;
  hoverHighlight:        boolean;
  subtotalHighlight:     boolean;
  showIndentation:       boolean;
  emptyValueStyle:       string;
  autosaveEnabled:       boolean;
  autosaveDebounceMs:    number;
  saveOnBlur:            boolean;
  allowPivot:            boolean;
  pivotConfig:           unknown | null;
}

export interface UpsertLayoutDto {
  density?:               'compact' | 'standard';
  frozenColumnCount?:     number;
  kpiColumnWidth?:        number;
  umColumnWidth?:         number;
  metadataColumnVisible?: boolean;
  defaultColumnWidth?:    number;
  stickyHeader?:          boolean;
  hoverHighlight?:        boolean;
  subtotalHighlight?:     boolean;
  showIndentation?:       boolean;
  emptyValueStyle?:       string;
  autosaveEnabled?:       boolean;
  autosaveDebounceMs?:    number;
  saveOnBlur?:            boolean;
  allowPivot?:            boolean;
  pivotConfig?:           unknown;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export interface TaskDef {
  taskId:          number;
  taskCode:        string;
  label:           string;
  description:     string | null;
  reportId:        number;
  reportVersion:   number;
  status:          TaskStatus;
  writebackMode:   WritebackMode | null;
  contextFilters:  Record<string, unknown> | null;
  routeUrl:        string | null;
  menuItemCode:    string | null;
  allowedRoles:    string | null;
  allowedEntities: number[] | null;
  createdBy:       string;
  createdAt:       string;
}

export interface CreateTaskDto {
  taskCode:         string;
  label:            string;
  description?:     string;
  reportId:         number;
  reportVersion?:   number;
  writebackMode?:   WritebackMode;
  contextFilters?:  Record<string, unknown>;
  routeUrl?:        string;
  menuItemCode?:    string;
  allowedRoles?:    string;
  allowedEntities?: number[];
}

export interface UpdateTaskDto {
  label?:           string;
  description?:     string;
  status?:          TaskStatus;
  writebackMode?:   WritebackMode;
  contextFilters?:  Record<string, unknown>;
  routeUrl?:        string;
  menuItemCode?:    string;
  allowedRoles?:    string;
  allowedEntities?: number[];
}

// ── DB Explorer ───────────────────────────────────────────────────────────────

export interface DbTableInfo {
  tableName:  string;
  schemaName: string;
  rowCount:   number | null;
}

export interface DbColumnInfo {
  columnName:   string;
  dataType:     string;
  maxLength:    number | null;
  isNullable:   boolean;
  isPrimaryKey: boolean;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface ConfigAuditEntry {
  auditId:     number;
  eventType:   string;
  entityType:  string;
  entityId:    string | null;
  reportId:    number | null;
  taskId:      number | null;
  oldSnapshot: unknown | null;
  newSnapshot: unknown | null;
  changedBy:   string;
  changedAt:   string;
  notes:       string | null;
}
