/**
 * Report Grid — AG Grid Enterprise, Tree Data mode.
 *
 * WCAG 2.1 AA:
 *   1.3.1  — Column headers are semantic (AG Grid renders <th>)
 *   2.1.1  — AG Grid keyboard nav enabled (Tab, Arrow keys, Enter to edit)
 *   4.1.2  — aria-label on the grid container
 *   1.4.3  — Colours via CSS variables; negative values always in red text
 */
import {
  Component, Input, Output, EventEmitter, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import {
  GridOptions, GridReadyEvent, CellValueChangedEvent, GetDataPath,
  CellClassParams, MenuItemDef, GetContextMenuItemsParams,
  ColDef, CellEditingStartedEvent, EditableCallbackParams, ValueGetterParams,
  RowClassParams, ColumnApi,
} from 'ag-grid-community';
import { LicenseManager } from 'ag-grid-enterprise';
import { ProcessColumn, ReportRow, CellCoordinates } from '../../models/report.models';
import { GridRow, transformRows } from './grid-row-transformer';
import { buildAllColDefs } from './grid-column-factory';

// Set AG Grid Enterprise licence key via environment or leave blank for trial watermark
LicenseManager.setLicenseKey('');

@Component({
  selector: 'cfs-report-grid',
  templateUrl: './report-grid.component.html',
  styleUrls: ['./report-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportGridComponent implements OnChanges {
  @Input() rows: ReportRow[] = [];
  @Input() processColumns: ProcessColumn[] = [];
  /** Whether the current user can write (editor / approver / admin). */
  @Input() canWrite = false;
  /** LoadIds whose process is locked (no write allowed). */
  @Input() lockedLoadIds: number[] = [];

  /** When true, a Pivot toggle button is shown in the grid toolbar. */
  @Input() allowPivot = false;

  /**
   * rclAccountKey values whose save is currently in-flight.
   * The corresponding rows are highlighted in yellow while pending.
   */
  @Input() pendingSaveRclKeys: string[] = [];

  pivotActive = false;

  @Output() cellEditRequested = new EventEmitter<{
    coordinates: CellCoordinates;
    newValue: number;
    oldValue: number;
    isLeaf: boolean;
  }>();
  @Output() cellHistoryRequested = new EventEmitter<CellCoordinates>();

  gridRows: GridRow[] = [];
  columnDefs: ColDef[] = [];

  private gridApi: GridReadyEvent['api'] | null = null;
  private columnApi: ColumnApi | null = null;

  gridOptions: GridOptions = {
    treeData: true,
    animateRows: false,
    // Expand all levels so the full P&L tree is visible on load
    groupDefaultExpanded: -1,
    // ── Row dimensions — set as gridOptions to guarantee override ──────────
    rowHeight: 26,
    headerHeight: 30,
    // ── Suppress every Enterprise panel ───────────────────────────────────
    rowGroupPanelShow: 'never',
    pivotPanelShow:    'never',
    sideBar:           false,
    suppressMenuHide:  false,
    suppressDragLeaveHidesColumns: true,
    suppressRowClickSelection: true,
    pivotMode: false,
    enableCharts: false,
    enableRangeSelection: false,
    // ── Overlay when empty ─────────────────────────────────────────────────
    overlayNoRowsTemplate:
      '<span style="padding:24px;color:#888;font-size:13px;">Select filters above and click <b>Apply</b> to load the report.</span>',
    getDataPath: ((data: GridRow) => data.dataPath) as GetDataPath,
    autoGroupColumnDef: {
      headerName: 'Account',
      minWidth: 220,
      pinned: 'left',
      lockPinned: true,
      suppressMovable: true,
      // Show the node's display label (not the raw key from dataPath)
      valueGetter: (params: ValueGetterParams) =>
        (params.data as GridRow | undefined)?.label ?? params.node?.key ?? '',
      cellRendererParams: {
        suppressCount: true,
        checkbox: false,
      },
      // No checkbox in header or cells
      checkboxSelection: false,
      headerCheckboxSelection: false,
      // Level-based styling to match MESA: L0 = green bar white text, L1 = bold
      cellStyle: (params: CellClassParams) => {
        const level = params.node?.level ?? 0;
        if (level === 0) return { fontWeight: '700', color: '#fff' } as Record<string, string>;
        if (params.node?.group) return { fontWeight: '700', color: '#333' } as Record<string, string>;
        return { fontWeight: '400', color: '#333' } as Record<string, string>;
      },
      cellClass: (params: CellClassParams) => {
        const row = params.data as GridRow | undefined;
        if (!row) return '';
        return row.isSynthetic ? 'cfs-cell--synthetic' : '';
      },
    },
    defaultColDef: {
      resizable: true,
      sortable: false,
    },
    rowClassRules: {
      // Yellow highlight while a save API call is in-flight for this row
      'cfs-row--pending': (params: RowClassParams) =>
        this.pendingSaveRclKeys.includes((params.data as GridRow | undefined)?.rclAccountKey ?? ''),
    },
    statusBar: { statusPanels: [] },
    getContextMenuItems: (params: GetContextMenuItemsParams) => this.buildContextMenu(params),
    onCellValueChanged: (ev: CellValueChangedEvent) => this.onCellValueChanged(ev),
    onCellEditingStarted: (ev: CellEditingStartedEvent) => this.onCellEditingStarted(ev),
    onGridReady: (ev: GridReadyEvent) => {
      this.gridApi  = ev.api;
      this.columnApi = ev.columnApi;
      // Auto-size after first render; a short delay ensures rows are painted
      setTimeout(() => ev.columnApi.autoSizeAllColumns(), 100);
    },
  };

  constructor(private cdr: ChangeDetectorRef) {}

  togglePivot(): void {
    if (!this.gridApi) return;
    this.pivotActive = !this.pivotActive;
    this.gridApi.setPivotMode(this.pivotActive);
    this.cdr.markForCheck();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows'] || changes['processColumns']) {
      this.rebuildGrid();
    }
    // When pending-save set changes, redraw rows so rowClassRules re-evaluate
    if (changes['pendingSaveRclKeys'] && this.gridApi) {
      this.gridApi.redrawRows();
    }
  }

  private rebuildGrid(): void {
    this.gridRows = transformRows(this.rows);
    this.columnDefs = buildAllColDefs(
      this.processColumns,
      (params: EditableCallbackParams) => this.isCellEditable(params),
    );
    this.cdr.markForCheck();
    // Re-size columns after data/columns change (they arrive AFTER gridReady)
    setTimeout(() => {
      if (this.columnApi) {
        this.columnApi.autoSizeAllColumns();
      }
    }, 50);
  }

  private isCellEditable(params: EditableCallbackParams): boolean {
    if (!this.canWrite) return false;
    const row = params.data as GridRow | undefined;
    if (!row) return false;
    // Derive loadId from colId: 'load_<loadId>'
    const colId = params.column?.getColId() ?? '';
    const match = colId.match(/^load_(\d+)$/);
    if (!match) return false;
    const loadId = Number(match[1]);
    if (this.lockedLoadIds.includes(loadId)) return false;
    return true;
  }

  private onCellEditingStarted(ev: CellEditingStartedEvent): void {
    // Always stop inline editing immediately and open the dialog instead.
    // This gives a consistent UX for both leaf and aggregate rows:
    // double-click → dialog opens with current value pre-filled.
    const row = ev.data as GridRow | undefined;
    if (!row) return;

    const colId = ev.column.getColId();
    const match = colId.match(/^load_(\d+)$/);
    if (!match) return;
    const loadId = Number(match[1]);

    ev.api.stopEditing(true);

    const coordinates: CellCoordinates = {
      rclAccountKey: row.rclAccountKey,
      loadId,
      entityId:   0,  // filled in by container from FilterState
      scopeId:    0,
      currencyId: 0,
      adjLevelId: row.adjLevelId ?? undefined,
    };
    this.cellEditRequested.emit({
      coordinates,
      newValue: row.values[String(loadId)] ?? 0,  // pre-fill with current value
      oldValue: row.values[String(loadId)] ?? 0,
      isLeaf:   row.isLeaf,
    });
  }

  private onCellValueChanged(ev: CellValueChangedEvent): void {
    const row = ev.data as GridRow;
    const colId = ev.column.getColId();
    const match = colId.match(/^load_(\d+)$/);
    if (!match) return;
    const loadId = Number(match[1]);
    if (!row.isLeaf) return; // handled by onCellEditingStarted

    const coordinates: CellCoordinates = {
      rclAccountKey: row.rclAccountKey,
      loadId,
      entityId: 0,   // filled by container
      scopeId:  0,
      currencyId: 0,
      adjLevelId: row.adjLevelId ?? undefined,
    };
    this.cellEditRequested.emit({
      coordinates,
      newValue: Number(ev.newValue),
      oldValue: Number(ev.oldValue),
      isLeaf: true,
    });
  }

  private buildContextMenu(params: GetContextMenuItemsParams): (string | MenuItemDef)[] {
    const row = params.node?.data as GridRow | undefined;
    const colId = params.column?.getColId() ?? '';
    const match = colId.match(/^load_(\d+)$/);
    const menu: (string | MenuItemDef)[] = [];

    if (row && match) {
      const loadId = Number(match[1]);
      menu.push({
        name: 'Dettaglio cella',
        icon: '<span class="ag-icon ag-icon-linked" aria-hidden="true"></span>',
        action: () => {
          const coords: CellCoordinates = {
            rclAccountKey: row.rclAccountKey,
            loadId,
            entityId: 0,
            scopeId: 0,
            currencyId: 0,
            adjLevelId: row.adjLevelId ?? undefined,
          };
          this.cellHistoryRequested.emit(coords);
        },
      });
      menu.push('separator');
    }

    menu.push('copy', 'copyWithHeaders', 'separator', 'export');
    return menu;
  }
}
