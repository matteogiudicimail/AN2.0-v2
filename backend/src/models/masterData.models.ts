/**
 * Models for the Master Data (Anagrafiche) management system.
 *
 * cfg_MasterDataTable registers dimension/lookup tables that can be
 * CRUD-managed from the configurator UI.
 *
 * Security: registry-as-whitelist pattern — only registered tables can be
 * accessed through the API, preventing arbitrary table manipulation.
 */

export interface MasterDataTableDef {
  masterDataId:   number;
  reportId:       number;
  schemaName:     string;
  tableName:      string;
  label:          string;
  primaryKeyCol:  string;
  /** JSON array of column names editable through the UI. */
  editableCols:   string[];
  createdBy:      string;
  createdAt:      string;
}

export interface RegisterMasterDataDto {
  schemaName:    string;
  tableName:     string;
  label:         string;
  primaryKeyCol: string;
  /** Column names users can edit (must exist in the target table). */
  editableCols:  string[];
}

export interface MasterDataRow {
  /** The primary key value (always a string for uniform handling). */
  pkValue:  string;
  /** All column values as strings. */
  columns:  Record<string, string | null>;
}

export interface UpsertMasterDataRowDto {
  /** Column name → new value. Only editableCols are accepted. */
  values: Record<string, string | null>;
}
