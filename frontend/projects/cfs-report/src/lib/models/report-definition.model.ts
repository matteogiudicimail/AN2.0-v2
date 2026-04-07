/**
 * Modello per la definizione di report restituita da GET /api/report/definition/:reportId.
 * Usata dal ReportContainerComponent per pre-caricare filtri e impostazioni.
 */

export interface ReportPresetFilters {
  entityIds?:  number[];
  scopeId?:    number;
  currencyId?: number;
  loadIds?:    number[];
}

/** Visibilità e obbligatorietà di un singolo filtro — configurata nel Configurator */
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
  entity?:                 FilterFieldConfig;
  scope?:                  FilterFieldConfig;
  currency?:               FilterFieldConfig;
  process?:                FilterFieldConfig;
  adjLevel?:               FilterFieldConfig;
  costCenter?:             FilterFieldConfig;
  co?:                     FilterFieldConfig;
  counterpart?:            FilterFieldConfig;
  includeManualWriteback?: FilterFieldConfig;
}

export type ColumnDimension = 'Process' | 'Entity' | 'AdjLevel';

export interface ReportDefinitionFull {
  reportId:        number;
  reportCode:      string;
  reportLabel:     string;
  writebackMode:   'Delta' | 'Overwrite';
  allowPivot:      boolean;
  presetFilters:   ReportPresetFilters;
  /** null = nessuna config → FilterPanel mostra tutto in modalità classica */
  filterConfig:    ReportFilterConfig | null;
  columnDimension: ColumnDimension;
}

/** Dati restituiti da GET /api/tasks/:id/launch — unificazione task + report */
export interface TaskLaunchData {
  taskId:          number;
  taskCode:        string;
  label:           string;
  reportId:        number;
  writebackMode:   'Delta' | 'Overwrite';
  allowPivot:      boolean;
  presetFilters:   ReportPresetFilters;
  filterConfig:    ReportFilterConfig | null;
  columnDimension: ColumnDimension;
}
