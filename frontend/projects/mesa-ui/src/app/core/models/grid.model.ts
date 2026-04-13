// Mirrors the shared interfaces — kept local to avoid build complexity in MVP

export interface GridColumn {
  id: number;
  code: string;
  name: string;
}

export interface GridCellValue {
  dimensionValueId: number;
  numericValue: number | null;
  isEmpty: boolean;
  isReadonly: boolean;
}

export interface GridRow {
  kpiId: number;
  kpiName: string;
  unit: string;
  isCalculated: boolean;
  formulaTag: string | null;
  isBold: boolean;
  indentLevel: number;
  hasComment: boolean;
  values: GridCellValue[];
}

export interface GridSubSection {
  code: string;
  name: string;
  rows: GridRow[];
}

export interface GridResponse {
  reportId: number;
  sectionId: number;
  filterEnabled: boolean;
  columns: GridColumn[];
  subSections: GridSubSection[];
  warnings?: ValidationWarning[];
}

export interface CellChange {
  kpiId: number;
  dimensionValueId: number;
  numericValue: number | null;
  source?: 'MANUAL' | 'EXCEL';
}

export interface SaveCellsRequest {
  changes: CellChange[];
}

export interface SaveCellsResponse {
  saved: number;
  errors: string[];
  timestamp: string;
  recalculated?: { kpiId: number; dimensionValueId: number; numericValue: number }[];
}

export interface Report {
  id: number;
  code: string;
  name: string;
  description?: string;
  period: string;
  status: string;
  sections?: Section[];
}

export interface Section {
  id: number;
  reportId: number;
  code: string;
  name: string;
  sortOrder: number;
  status: 'COMPLETE' | 'INCOMPLETE' | 'EMPTY';
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  initials: string;
  email?: string;
  roles: string[];
  scopedDimensionValueIds?: number[];
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface Comment {
  id: number;
  text: string;
  author: { id: number; displayName: string };
  createdAt: string;
  updatedAt: string;
}

export interface ValidationWarning {
  kpiId: number;
  dimensionValueId?: number;
  rule: string;
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export interface AuditEntry {
  id: number;
  factValueId: number;
  userId?: number;
  userDisplayName?: string;
  kpiName?: string;
  sectionName?: string;
  dimensionValueCode?: string;
  oldValue?: string;
  newValue?: string;
  source: string;
  changedAt: string;
}
