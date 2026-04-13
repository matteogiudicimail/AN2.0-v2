/**
 * TypeScript models for the Report Configurator.
 */

export type ReportStatus = 'Draft' | 'ReadyForPublish' | 'Published' | 'Archived';
export type WritebackMode = 'Delta' | 'Overwrite';
export type RowType = 'Input' | 'Subtotal' | 'SectionHeader' | 'Spacer' | 'GroupParent';
export type SectionType = 'Section' | 'Subsection';
export type LayoutStyle = 'flat' | 'grouped' | 'collapsible';
export type TaskStatus = 'Draft' | 'Active' | 'Archived';

// ── Report ─────────────────────────────────────────────────────────────────────

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
  description:     string | null;
  tags:            string | null;
  owner:           string | null;
  isActive:        boolean;
  /** Whether insert-tracking (write log) is enabled for this data model. */
  trackingEnabled: boolean;
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
  reportLabel?:  string;
  description?:  string;
  domain?:       string;
  category?:     string;
  tags?:         string;
  owner?:        string;
  writebackMode?: WritebackMode;
  status?:       ReportStatus;
}

// ── Dataset Binding ────────────────────────────────────────────────────────────

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
  smartName?: string;    // friendly alias for this dim table
}

export interface HierarchyDef {
  hierarchyDefId?: number;
  bindingId?:      number;
  dimTable:        string;   // schema.table
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
  hierarchyDefs:       HierarchyDef[];
  createdBy:           string;
  createdAt:           string;
}

export interface UpsertDatasetBindingDto {
  factTable:           string;
  factTableSmartName?: string;
  fieldMappings:       FieldMapping[];
  joinConfig:          JoinConfig[];
}

export interface UpsertHierarchyDefDto {
  dimTable:    string;
  childKeyCol: string;
  parentKeyCol: string;
  labelCol:    string;
  orderCol?:   string | null;
  smartName?:  string | null;
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
  rowCode:          string;
  label:            string;
  unitOfMeasure?:   string;
  rowType?:         RowType;
  parentRowCode?:   string;
  indentLevel?:     number;
  isEditable?:      boolean;
  isVisible?:       boolean;
  sortOrder?:       number;
  measureField?:    string;
  dimensionMembers?: unknown[];
  subtotalConfig?:  unknown;
  sectionCode?:     string;
  subsectionCode?:  string;
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
  filterCode:    string;
  label:         string;
  dimensionName: string;
  isVisible?:    boolean;
  isMultiSelect?: boolean;
  isMandatory?:  boolean;
  defaultValue?: string;
  dependsOn?:    string;
  sortOrder?:    number;
}

// ── Sections ──────────────────────────────────────────────────────────────────

export interface ReportSectionDef {
  sectionId:          number;
  reportId:           number;
  sectionCode:        string;
  label:              string;
  description:        string | null;
  parentSectionCode:  string | null;
  sectionType:        SectionType;
  layoutStyle:        LayoutStyle;
  isCollapsible:      boolean;
  isExpandedByDefault: boolean;
  icon:               string | null;
  sortOrder:          number;
  isVisible:          boolean;
}

export interface UpsertSectionDto {
  sectionCode:         string;
  label:               string;
  description?:        string;
  parentSectionCode?:  string;
  sectionType?:        SectionType;
  layoutStyle?:        LayoutStyle;
  isCollapsible?:      boolean;
  isExpandedByDefault?: boolean;
  icon?:               string;
  sortOrder?:          number;
  isVisible?:          boolean;
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

// ── Viewer Settings ────────────────────────────────────────────────────────────

/** Controls which toolbars are shown to users in the snapshot viewer. */
export interface ViewerSettings {
  /** Show/hide the "Salva: Auto / Manuale" save-mode buttons. Default: true. */
  showSaveMode:     boolean;
  /** Default save mode when the viewer opens. Default: 'auto'. */
  defaultSaveMode:  'auto' | 'manual';
  /** Show/hide the "Excel: Griglia / Pivot / Importa" export buttons. Default: true. */
  showExcelExport:  boolean;
  /** Show/hide the "Solo con dati" checkbox. Default: true. */
  showSoloConDati:  boolean;
  /** Whether "Solo con dati" is active by default when the viewer opens. Default: false. */
  defaultSoloConDati: boolean;
}

// ── Task ──────────────────────────────────────────────────────────────────────

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
  /** Code of the parent menu node under which this task is registered. */
  parentMenuCode:  string | null;
  allowedRoles:    string | null;
  allowedEntities: number[] | null;
  /** JSON string of default filter values applied when the report opens. */
  defaultFilters:  string | null;
  /** JSON array of filter field names hidden from the user (but still applied via defaultFilters). */
  hiddenFilters:   string | null;
  /** JSON object controlling which controls are shown in the snapshot viewer. */
  viewerSettings:  ViewerSettings | null;
  /** Comma-separated user IDs / role names allowed to read this report. */
  accessReaders:   string | null;
  /** Comma-separated user IDs / role names allowed to write this report. */
  accessWriters:   string | null;
  createdBy:       string;
  createdAt:       string;
  reportDomain:    string | null;
  reportCode:      string | null;
  reportLabel:     string | null;
}

export interface CreateTaskDto {
  taskCode:        string;
  label:           string;
  description?:    string;
  reportId:        number;
  reportVersion?:  number;
  writebackMode?:  WritebackMode;
  contextFilters?: Record<string, unknown>;
  routeUrl?:       string;
  menuItemCode?:   string;
  parentMenuCode?: string;
  allowedRoles?:   string;
  allowedEntities?: number[];
  defaultFilters?: string;
  hiddenFilters?:  string;
  viewerSettings?: ViewerSettings | null;
  accessReaders?:  string;
  accessWriters?:  string;
}

export interface UpdateTaskDto {
  label?:          string;
  description?:    string;
  status?:         TaskStatus;
  writebackMode?:  WritebackMode;
  contextFilters?: Record<string, unknown>;
  routeUrl?:       string;
  menuItemCode?:   string;
  parentMenuCode?: string;
  allowedRoles?:   string;
  allowedEntities?: number[];
  defaultFilters?: string;
  hiddenFilters?:  string;
  viewerSettings?: ViewerSettings | null;
  accessReaders?:  string;
  accessWriters?:  string;
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

// ── Report Definition (rendering diretta, senza configuratore) ────────────────

/** Filtri predefiniti ricavati da cfg_ReportFilter.DefaultValue */
export interface ReportPresetFilters {
  entityIds?:  number[];
  scopeId?:    number;
  currencyId?: number;
  loadIds?:    number[];
}

/** Configurazione visibilità/obbligatorietà per un singolo campo filtro */
export interface FilterFieldConfig {
  visible:   boolean;
  mandatory: boolean;
}

/**
 * Configurazione completa dei filtri di un report.
 * null  = nessun report selezionato → mostra tutti i filtri (modalità classica).
 * Ogni campo assente nella config = campo nascosto.
 */
export interface ReportFilterConfig {
  entity?:                FilterFieldConfig;
  scope?:                 FilterFieldConfig;
  currency?:              FilterFieldConfig;
  process?:               FilterFieldConfig;
  adjLevel?:              FilterFieldConfig;
  costCenter?:            FilterFieldConfig;
  co?:                    FilterFieldConfig;
  counterpart?:           FilterFieldConfig;
  includeManualWriteback?: FilterFieldConfig;
}

/** Struttura completa restituita da GET /api/report/definition/:reportId */
export interface ReportDefinitionFull {
  reportId:        number;
  reportCode:      string;
  reportLabel:     string;
  writebackMode:   WritebackMode;
  allowPivot:      boolean;
  presetFilters:   ReportPresetFilters;
  /** null = nessuna config → FilterPanel mostra tutto in modalità classica */
  filterConfig:    ReportFilterConfig | null;
  /** Quale dimensione usare come colonne. Default: 'Process' */
  columnDimension: 'Process' | 'Entity' | 'AdjLevel';
}

// ── DB Explorer (step 1 wizard) ────────────────────────────────────────────────

export interface DbTableInfo {
  tableName:   string;
  schemaName:  string;
  rowCount:    number | null;
  tableType?:  'TABLE' | 'VIEW';
}

export interface DbColumnInfo {
  columnName:    string;
  dataType:      string;
  maxLength:     number | null;
  isNullable:    boolean;
  isPrimaryKey:  boolean;
}
