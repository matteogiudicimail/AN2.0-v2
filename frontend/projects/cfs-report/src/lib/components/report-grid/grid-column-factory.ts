/**
 * Generates AG Grid ColDef[] from ProcessColumn[] returned by the backend.
 * Pinned-left hierarchy column + one numeric column per process.
 */
import { ColDef, ValueFormatterParams, CellClassParams, EditableCallbackParams } from 'ag-grid-community';
import { ProcessColumn } from '../../models/report.models';

const NUMBER_FORMAT = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function amountFormatter(params: ValueFormatterParams): string {
  if (params.value == null) return '';
  const n = Number(params.value);
  if (isNaN(n)) return '';
  return NUMBER_FORMAT.format(n);
}

function negativeClass(params: CellClassParams): string {
  const n = Number(params.value);
  return !isNaN(n) && n < 0 ? 'cfs-cell--negative' : '';
}

/** Hierarchy / label column — always pinned left */
export function buildHierarchyColDef(): ColDef {
  return {
    colId: '__hierarchy',
    headerName: 'Account',
    field: 'label',
    pinned: 'left',
    lockPinned: true,
    minWidth: 260,
    flex: 2,
    cellRendererParams: { suppressCount: true },
    sortable: false,
    filter: false,
  };
}

/** One numeric column per process */
export function buildProcessColDefs(
  processColumns: ProcessColumn[],
  isEditable: (params: EditableCallbackParams) => boolean,
): ColDef[] {
  return processColumns.map((pc) => ({
    colId: `load_${pc.loadId}`,
    headerName: pc.processDescription,
    field: `values.${pc.loadId}`,
    type: 'numericColumn',
    minWidth: 100,
    // No flex — let autoSizeAllColumns() determine width from content
    editable: (params: EditableCallbackParams) => isEditable(params),
    valueFormatter: amountFormatter,
    cellClass: (params: CellClassParams) => {
      const classes: string[] = ['cfs-cell--number'];
      const neg = negativeClass(params);
      if (neg) classes.push(neg);
      if (params.data?.isSynthetic) classes.push('cfs-cell--synthetic');
      if (params.data?.hasAdjustments?.[String(pc.loadId)]) classes.push('cfs-cell--adjusted');
      return classes.join(' ');
    },
    sortable: false,
    filter: false,
  }));
}

/**
 * Assembles the complete ColDef array.
 * NOTE: in treeData mode the hierarchy/Account column is provided by
 * autoGroupColumnDef (defined in gridOptions) — do NOT add a separate label
 * column here, or AG Grid would render two "Account" columns side by side.
 */
export function buildAllColDefs(
  processColumns: ProcessColumn[],
  isEditable: (params: EditableCallbackParams) => boolean,
): ColDef[] {
  return buildProcessColDefs(processColumns, isEditable);
}
