/**
 * Models for the _PARAM table system.
 *
 * Each ESG report can have one or more "_PARAM" support tables,
 * one per (factTable, column) pair.  These tables store KPI metadata:
 * hierarchy (Aggregato / Indicatore), formula, compilation guide, editability.
 *
 * Naming convention: [schema].[factTable_column_PARAM]
 * Registry: cfg_ParamTable tracks all existing param tables.
 */

// ── Registry ──────────────────────────────────────────────────────────────────

export interface ParamTableInfo {
  paramTableId:    number;
  reportId:        number;
  schemaName:      string;
  factTableName:   string;
  columnName:      string;
  paramTableName:  string;            // e.g. ISP_Fact_Descrizione_KPI_PARAM
  customColumnDefs: CustomColumnDef[];
  createdAt:       string;
}

export interface CreateParamTableDto {
  schema:      string;
  factTable:   string;
  column:      string;
}

// ── Custom columns ────────────────────────────────────────────────────────────

export interface CustomColumnDef {
  name:      string;                  // identifier (alphanumeric + _)
  label:     string;                  // UI label
  dataType:  'text' | 'number' | 'boolean';
  width?:    number;
}

// ── Param rows ────────────────────────────────────────────────────────────────

export type RowKind = 'Aggregato' | 'Indicatore';

export interface ParamRow {
  paramId:            number;
  sourceValue:        string;
  label:              string;
  rowKind:            RowKind;
  indentLevel:        number;         // 0 = group, 1 = leaf KPI
  parentParamId:      number | null;
  grouping:           string | null;  // DB col: Raggruppamento
  formula:            string | null;
  compilationGuide:   string | null;  // DB col: GuidaCompilazione
  isEditable:         boolean;
  isFormula:          boolean;
  isVisible:          boolean;
  sortOrder:          number;
  customColumns:      Record<string, unknown> | null;
}

export interface UpsertParamRowDto {
  sourceValue:        string;
  label:              string;
  rowKind?:           RowKind;
  parentParamId?:     number | null;
  grouping?:          string | null;  // DB col: Raggruppamento
  formula?:           string | null;
  compilationGuide?:  string | null;  // DB col: GuidaCompilazione
  isEditable?:        boolean;
  isFormula?:         boolean;
  isVisible?:         boolean;
  sortOrder?:         number;
  customColumns?:     Record<string, unknown> | null;
}

// ── Responses ─────────────────────────────────────────────────────────────────

export interface DistinctValuesResult {
  values: string[];
  total:  number;
}

export interface SeedResult {
  inserted: number;
}

export interface ReorderDto {
  orderedIds: number[];
}

export interface MoveDto {
  direction: 'up' | 'down';
}
