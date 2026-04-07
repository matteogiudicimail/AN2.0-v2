/**
 * Report Container — root component of the CFS plugin.
 * Wires filter panel → report service → report grid + all dialogs.
 *
 * WCAG 2.1 AA:
 *   4.1.3  — aria-live regions for loading/error states
 *   2.1.1  — All interactions keyboard accessible
 */
import {
  Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { FilterState } from '../../models/filter-state.model';
import { ReportRow, ProcessColumn, CellCoordinates } from '../../models/report.models';
import { ReportDefinitionFull, ReportPresetFilters, TaskLaunchData, ReportFilterConfig, ColumnDimension } from '../../models/report-definition.model';
import { ReportService } from '../../services/report.service';
import { WritebackService } from '../../services/writeback.service';
import { ApiService } from '../../services/api.service';
import { ConflictInfo } from '../../models/writeback.models';
import { CellEditorHandler } from '../report-grid/cell-editor-handler';
import { AnnotationResult } from '../annotation-dialog/annotation-dialog.component';
import { ConflictResolution } from '../conflict-dialog/conflict-dialog.component';
import { InputData } from '../../cfs-report.module';

@Component({
  selector: 'cfs-report-container',
  templateUrl: './report-container.component.html',
  styleUrls: ['./report-container.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CellEditorHandler],
})
export class ReportContainerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() inputData!: InputData;
  /** Writeback mode for the current task/report — shown as a toolbar badge. */
  @Input() writebackMode: 'Delta' | 'Overwrite' | null = null;
  /** Allow pivot view toggle — enabled when the report layout has allowPivot=true. */
  @Input() allowPivot = false;

  // Report state
  reportRows: ReportRow[] = [];
  processColumns: ProcessColumn[] = [];
  isLoading = false;
  errorMessage = '';

  // Permissions
  canWrite = false;
  lockedLoadIds: number[] = [];

  // Dialog state
  showAnnotationDialog = false;
  showConflictDialog = false;
  showHistoryDialog = false;

  pendingEditCoordinates: CellCoordinates | null = null;
  pendingEditOldValue = 0;
  pendingEditIsLeaf = true;
  pendingEditRowLabel = '';
  pendingEditProcessLabel = '';
  pendingEditVersion = 0;

  conflictInfo: ConflictInfo | null = null;

  historyCoordinates: CellCoordinates | null = null;
  historyCellLabel = '';

  currentFilterState: FilterState | null = null;

  /** rclAccountKeys whose save API call is currently in-flight → yellow row in grid */
  pendingSaveRclKeys: string[] = [];

  // Definizione caricata dal configuratore (se inputData.reportId è impostato)
  reportPresetFilters:  ReportPresetFilters | undefined = undefined;
  reportFilterConfig:   ReportFilterConfig | null = null;
  reportColumnDimension: ColumnDimension = 'Process';

  private destroy$ = new Subject<void>();

  constructor(
    private reportSvc: ReportService,
    private writebackSvc: WritebackService,
    private apiSvc: ApiService,
    private cellEditorHandler: CellEditorHandler,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (this.inputData?.token) {
      this.apiSvc.setToken(this.inputData.token);
    }
    if (this.inputData?.apiBaseUrl) {
      this.apiSvc.setBaseUrl(this.inputData.apiBaseUrl);
    }
    // Derive write permission from inputData role
    this.canWrite = ['Editor', 'Approver', 'Admin'].includes(this.inputData?.role ?? '');

    this._loadContextFromInputData();
  }

  /** Loads task or report definition from the current inputData and resets context state. */
  private _loadContextFromInputData(): void {
    // Reset context so the filter panel goes back to default if no task/report is set
    this.reportPresetFilters   = undefined;
    this.reportFilterConfig    = null;
    this.reportColumnDimension = 'Process';
    this.writebackMode         = null;
    this.allowPivot            = false;
    this.currentFilterState    = null;
    this.reportRows            = [];
    this.processColumns        = [];
    this.errorMessage          = '';
    this.cdr.markForCheck();

    // taskId ha priorità su reportId — carica task + definizione unificati
    if (this.inputData?.taskId) {
      this.apiSvc.get<TaskLaunchData>(`/tasks/${this.inputData.taskId}/launch`)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (launch) => {
            this.writebackMode            = launch.writebackMode ?? null;
            this.allowPivot               = launch.allowPivot;
            this.reportPresetFilters      = launch.presetFilters ?? undefined;
            this.reportFilterConfig       = launch.filterConfig ?? null;
            this.reportColumnDimension    = launch.columnDimension ?? 'Process';
            this.cdr.markForCheck();
          },
          error: () => {
            console.warn(`[ReportContainer] Impossibile caricare il task ${this.inputData.taskId}`);
          },
        });
    } else if (this.inputData?.reportId) {
      this.apiSvc.get<ReportDefinitionFull>(`/report/definition/${this.inputData.reportId}`)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (def) => {
            this.writebackMode            = def.writebackMode ?? null;
            this.allowPivot               = def.allowPivot;
            this.reportPresetFilters      = def.presetFilters ?? undefined;
            this.reportFilterConfig       = def.filterConfig ?? null;
            this.reportColumnDimension    = def.columnDimension ?? 'Process';
            this.cdr.markForCheck();
          },
          error: () => {
            console.warn(`[ReportContainer] Impossibile caricare la definizione del report ${this.inputData.reportId}`);
          },
        });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const inputDataChange = changes['inputData'];
    if (!inputDataChange || inputDataChange.isFirstChange()) return;

    const prev: InputData | undefined = inputDataChange.previousValue;
    const curr: InputData | undefined = inputDataChange.currentValue;

    // React only when taskId actually changes (covers null → id, id → null, id → different id)
    if (prev?.taskId !== curr?.taskId) {
      this._loadContextFromInputData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Filter applied ────────────────────────────────────────────────────────

  onFilterApplied(state: FilterState): void {
    this.currentFilterState = { ...state, columnDimension: this.reportColumnDimension };
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    this.reportSvc.executeReport({
      filterState: { ...state, columnDimension: this.reportColumnDimension },
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (resp) => {
        this.reportRows = resp.rows;
        this.processColumns = resp.processColumns;
        this.lockedLoadIds = resp.lockedLoadIds ?? [];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMessage = 'Failed to load report data. Please try again.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Cell edit requested from grid ─────────────────────────────────────────

  onCellEditRequested(ev: {
    coordinates: CellCoordinates;
    newValue: number;
    oldValue: number;
    isLeaf: boolean;
  }): void {
    if (!this.currentFilterState) return;

    // Fill in filter-state-derived coordinates
    const coords: CellCoordinates = {
      ...ev.coordinates,
      entityId:   this.currentFilterState.entityIds[0],
      scopeId:    this.currentFilterState.scopeId,
      currencyId: this.currentFilterState.currencyId,
    };

    // Resolve version from current grid data
    const row = this.reportRows.find(r => r.rclAccountKey === coords.rclAccountKey);
    this.pendingEditVersion = row?.versions?.[String(coords.loadId)] ?? 0;

    this.pendingEditCoordinates = coords;
    this.pendingEditIsLeaf = ev.isLeaf;
    this.pendingEditRowLabel = row?.label ?? '';
    this.pendingEditProcessLabel =
      this.processColumns.find(p => p.loadId === coords.loadId)?.processDescription ?? '';

    if (ev.isLeaf && !row?.isSynthetic) {
      // Natural leaf: dialog shows absolute value (backend computes delta = newValue - base)
      this.pendingEditOldValue = ev.oldValue;
    } else {
      // Aggregate edit OR edit of existing synthetic: dialog shows adjustment amount
      // For aggregates: start at 0 (user enters the increment to add)
      // For existing synthetic: show current synthetic value
      this.pendingEditOldValue = row?.isSynthetic ? (ev.oldValue ?? 0) : 0;
    }

    this.showAnnotationDialog = true;
    this.cdr.markForCheck();
  }

  // ── Annotation dialog closed ──────────────────────────────────────────────

  onAnnotationClosed(result: AnnotationResult): void {
    this.showAnnotationDialog = false;
    this.cdr.markForCheck();

    if (!result.confirmed || !this.pendingEditCoordinates || !this.currentFilterState) return;

    // For aggregate edits, pass parentRclKey so the backend creates a synthetic child
    const parentRclKey = !this.pendingEditIsLeaf
      ? this.pendingEditCoordinates.rclAccountKey
      : undefined;

    const request = this.cellEditorHandler.buildRequest(
      this.pendingEditCoordinates,
      result.newValue,
      result.annotation,
      this.pendingEditVersion,
      this.currentFilterState,
      parentRclKey,
    );

    // Mark row as pending (yellow highlight) until the save resolves
    const pendingKey = request.rclAccountKey;
    this.pendingSaveRclKeys = [...this.pendingSaveRclKeys, pendingKey];
    this.cdr.markForCheck();

    const clearPending = () => {
      this.pendingSaveRclKeys = this.pendingSaveRclKeys.filter((k) => k !== pendingKey);
      this.cdr.markForCheck();
    };

    this.cellEditorHandler.save(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (saveResult) => {
          clearPending();
          if (saveResult.success) {
            // Reload report to reflect new value
            this.onFilterApplied(this.currentFilterState!);
          } else if (saveResult.conflict) {
            this.conflictInfo = saveResult.conflict;
            this.showConflictDialog = true;
            this.cdr.markForCheck();
          } else if (saveResult.processLocked) {
            this.errorMessage = 'This process is locked. No changes can be saved.';
            this.cdr.markForCheck();
          }
        },
        error: () => {
          clearPending();
          this.errorMessage = 'Save failed. Please try again.';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Conflict dialog resolved ──────────────────────────────────────────────

  onConflictResolved(resolution: ConflictResolution): void {
    this.showConflictDialog = false;
    this.conflictInfo = null;
    this.cdr.markForCheck();

    if (resolution === 'retry' && this.currentFilterState) {
      this.onFilterApplied(this.currentFilterState);
    }
  }

  // ── Cell history requested ────────────────────────────────────────────────

  onCellHistoryRequested(coords: CellCoordinates): void {
    if (!this.currentFilterState) return;

    // Disambiguate loadId/entityId/adjLevelId based on columnDimension,
    // same logic as CellEditorHandler.buildRequest
    const colDim = this.currentFilterState.columnDimension ?? 'Process';
    let loadId: number;
    let entityId: number;
    let adjLevelId: number | undefined;

    if (colDim === 'Entity') {
      loadId     = this.currentFilterState.loadIds[0];
      entityId   = coords.loadId;   // column key = entityId
      adjLevelId = coords.adjLevelId;
    } else if (colDim === 'AdjLevel') {
      loadId     = this.currentFilterState.loadIds[0];
      entityId   = this.currentFilterState.entityIds[0];
      adjLevelId = coords.loadId;   // column key = adjLevelId
    } else {
      loadId     = coords.loadId;
      entityId   = this.currentFilterState.entityIds[0];
      adjLevelId = coords.adjLevelId;
    }

    this.historyCoordinates = {
      ...coords,
      loadId,
      entityId,
      scopeId:    this.currentFilterState.scopeId,
      currencyId: this.currentFilterState.currencyId,
      adjLevelId,
    };
    const row = this.reportRows.find(r => r.rclAccountKey === coords.rclAccountKey);
    const col = this.processColumns.find(p => p.loadId === coords.loadId);
    this.historyCellLabel = `${row?.label ?? ''} / ${col?.processDescription ?? ''}`;
    this.showHistoryDialog = true;
    this.cdr.markForCheck();
  }

  onHistoryClosed(): void {
    this.showHistoryDialog = false;
    this.historyCoordinates = null;
    this.cdr.markForCheck();
  }
}
