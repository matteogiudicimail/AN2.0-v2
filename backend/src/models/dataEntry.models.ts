/**
 * Data Entry models — scheda di data entry pivot con scrittura su tabella _WRITE.
 */

export interface DataEntryFiltriOption {
  fieldName: string;
  label:     string;
  values:    string[];
}

export interface DataEntryRigaOption {
  /** 0 = top level, 1 = second level, etc. */
  depth:      number;
  /** Which righe layout field this node belongs to */
  fieldName:  string;
  value:      string;
  label:      string;
  /** true = last righe level — cells are editable; false = collapsible group header */
  isLeaf:     boolean;
  /** All righe dimension values from level 0 up to (and including) this node */
  pathValues: Record<string, string>;
  /**
   * Parent-child dim-table mode only: ordered list of pathKey strings for all
   * ancestor nodes (root → direct parent).  Empty array for depth-0 nodes.
   * Absent for fact-based multi-level rows (original behaviour unchanged).
   */
  ancestorKeys?: string[];
  paramRow: {
    rowKind:           'Aggregato' | 'Indicatore';
    indentLevel:       number;
    raggruppamento:    string | null;
    formula:           string | null;
    guidaCompilazione: string | null;
    isEditable:        boolean;
    isFormula:         boolean;
  } | null;
}

/** One row read from the _WRITE table. */
export interface WriteRow {
  dimensionValues: Record<string, string>;
  values: Record<string, string | null>;
}

export interface DataEntryGridResponse {
  bindingInfo: {
    factTable:  string;
    schemaName: string;
    writeTable: string;
  };
  layout: {
    filtri:  Array<{ fieldName: string; label: string; paramTableId: number | null }>;
    righe:   Array<{ fieldName: string; label: string; paramTableId: number | null }>;
    /** colonne items may include lockedMembers: string[] for column-member locking. */
    colonne: Array<{ fieldName: string; label: string; paramTableId: number | null; lockedMembers?: string[] }>;
    valori:  Array<{ fieldName: string; label: string; aggregation: string }>;
  };
  filtriOptions:  DataEntryFiltriOption[];
  righeOptions:   DataEntryRigaOption[];
  colonneOptions: Array<{ fieldName: string; values: string[] }>;
  writeRows:      WriteRow[];
  /** Sorted-JSON dimension keys of rows that have been approved (read-only in grid). */
  approvedRows:   string[];
}

export interface SaveCellDto {
  dimensionValues: Record<string, string>;
  valoreField: string;
  value:       string;
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

/**
 * DTO per la creazione (o riuso) di una riga "Rett. Manuale" (Manual Adjustment)
 * sotto una riga Aggregato nella tabella _PARAM associata al campo righe.
 */
export interface EnsureAdjDto {
  /** fieldName del campo righe layout che contiene l'Aggregato (es. "Descrizione_KPI") */
  rigaFieldName:     string;
  /** SourceValue della riga Aggregato (es. "AMBIENTE") */
  parentSourceValue: string;
}

export interface EnsureAdjResult {
  /** true se la riga è stata creata, false se già esisteva */
  created:         boolean;
  /** SourceValue della riga Rett. Manuale creata/trovata */
  adjSourceValue:  string;
}

/** DTO per l'inserimento di una riga manuale nella _WRITE table. */
export interface InsertManualRowDto {
  /** Valori dimensionali per la nuova riga (devono coprire tutti i campi PK della _WRITE table). */
  dimensionValues: Record<string, string>;
}
