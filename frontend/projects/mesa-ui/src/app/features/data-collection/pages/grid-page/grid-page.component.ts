import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  CellChange,
  GridResponse,
  GridRow,
  Report,
  SaveState,
  Section,
  User,
} from '../../../../core/models/grid.model';
import { GridDataService } from '../../services/grid-data.service';
import { CellEditService } from '../../services/cell-edit.service';
import { ApiService } from '../../../../core/services/api.service';
import { RealtimeService } from '../../../../core/services/realtime.service';

@Component({
  selector: 'app-grid-page',
  templateUrl: './grid-page.component.html',
  styleUrls: ['./grid-page.component.scss'],
  providers: [CellEditService], // scoped per grid-page instance
})
export class GridPageComponent implements OnInit, OnChanges, OnDestroy {
  @Input() report!: Report;
  @Input() selectedSection: Section | null = null;
  @Input() currentUser: User | null = null;

  gridData: GridResponse | null = null;
  saveState: SaveState = 'idle';
  lastSaved: Date | null = null;
  dirtyKeys = new Set<string>();
  loading = false;
  error: string | null = null;

  // Column visibility filter (enabled when filterEnabled in grid response)
  filterPanelOpen = false;
  visibleColumnIds: Set<number> | null = null; // null = show all

  // For Excel upload flow
  showImportDialog = false;
  importPreview: any = null;
  importFile: File | null = null;

  // For comment modal
  commentModalVisible = false;
  commentRow: GridRow | null = null;

  private subs = new Subscription();

  constructor(
    private gridDataService: GridDataService,
    private cellEditService: CellEditService,
    private api: ApiService,
    private realtime: RealtimeService,
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.cellEditService.saveState$.subscribe(state => {
        this.saveState = state;
      }),
    );
    this.subs.add(
      this.cellEditService.lastSaved$.subscribe(d => {
        this.lastSaved = d;
      }),
    );
    // When server sends back recalculated values, apply to grid
    this.subs.add(
      this.cellEditService.recalculated$.subscribe(recs => {
        if (!this.gridData) return;
        for (const rec of recs) {
          for (const ss of this.gridData.subSections) {
            const row = ss.rows.find(r => r.kpiId === rec.kpiId);
            if (!row) continue;
            const cell = row.values.find(v => v.dimensionValueId === rec.dimensionValueId);
            if (cell) { cell.numericValue = rec.numericValue; cell.isEmpty = rec.numericValue === 0; }
          }
        }
      }),
    );
    // Subscribe to real-time cell updates from other users
    this.subs.add(
      this.realtime.cellSaved$.subscribe(ev => {
        if (!this.gridData) return;
        if (ev.reportId !== this.report?.id || ev.sectionId !== this.selectedSection?.id) return;
        // Apply remote cell update to local grid (only if it's not our own save)
        for (const ss of this.gridData.subSections) {
          const row = ss.rows.find(r => r.kpiId === ev.kpiId);
          if (!row) continue;
          const cell = row.values.find(v => v.dimensionValueId === ev.dimensionValueId);
          if (cell) {
            cell.numericValue = ev.numericValue;
            cell.isEmpty = ev.numericValue === null || ev.numericValue === 0;
          }
        }
      }),
    );

    if (this.selectedSection) this.loadGrid();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedSection'] && !changes['selectedSection'].firstChange) {
      this.loadGrid();
    }
  }

  private loadGrid(): void {
    if (!this.report || !this.selectedSection) return;
    this.loading = true;
    this.error = null;
    this.gridData = null;
    this.dirtyKeys.clear();
    this.cellEditService.init(this.report.id, this.selectedSection.id);
    // Join real-time room
    this.realtime.joinRoom(this.report.id, this.selectedSection.id, this.currentUser?.id ?? 0);

    this.subs.add(
      this.gridDataService
        .loadGrid(this.report.id, this.selectedSection.id)
        .subscribe({
          next: data => {
            this.gridData = data;
            // Reset filter to show all columns when grid reloads
            this.visibleColumnIds = null;
            this.filterPanelOpen = false;
            this.loading = false;
          },
          error: () => {
            this.error = 'Errore nel caricamento della griglia.';
            this.loading = false;
          },
        }),
    );
  }

  onCellChanged(change: CellChange): void {
    if (!this.gridData) return;

    // Optimistic update
    this.gridData = this.cellEditService.applyOptimistic(
      this.gridData,
      change.kpiId,
      change.dimensionValueId,
      change.numericValue,
    );

    // Track dirty key
    const key = `${change.kpiId}-${change.dimensionValueId}`;
    this.dirtyKeys = new Set(this.dirtyKeys).add(key);

    // Queue autosave
    this.cellEditService.markDirty(change);
  }

  onRefresh(): void {
    this.loadGrid();
  }

  onSaveDraft(): void {
    this.cellEditService.flush();
  }

  onDownloadExcel(): void {
    if (!this.report || !this.selectedSection) return;
    this.api
      .getBlob(`/reports/${this.report.id}/sections/${this.selectedSection.id}/excel/download`)
      .subscribe(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MESA_${this.report.code}_${this.selectedSection!.code}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  onUploadExcel(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      this.importFile = file;
      this.api
        .postFile<any>(
          `/reports/${this.report.id}/sections/${this.selectedSection!.id}/excel/upload`,
          file,
        )
        .subscribe({
          next: preview => {
            this.importPreview = preview;
            this.showImportDialog = true;
          },
          error: () => alert('Errore durante il parsing del file Excel.'),
        });
    };
    input.click();
  }

  onConfirmImport(): void {
    if (!this.importPreview) return;
    this.api
      .post<any>(
        `/reports/${this.report.id}/sections/${this.selectedSection!.id}/excel/confirm`,
        { changes: this.importPreview.changes },
      )
      .subscribe({
        next: () => {
          this.showImportDialog = false;
          this.importPreview = null;
          this.loadGrid();
        },
        error: () => alert('Errore durante l\'importazione.'),
      });
  }

  onCancelImport(): void {
    this.showImportDialog = false;
    this.importPreview = null;
  }

  onCommentClicked(row: GridRow): void {
    this.commentRow = row;
    this.commentModalVisible = true;
  }

  onCommentClosed(changed: boolean): void {
    this.commentModalVisible = false;
    if (changed) this.loadGrid();
  }

  onSubmitReport(): void { this.onTransition('SUBMIT'); }

  onTransition(action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'REOPEN'): void {
    if (!this.report) return;
    const labels: Record<string, string> = {
      SUBMIT: 'Inviare il report al coordinatore per la revisione?',
      APPROVE: 'Approvare definitivamente il report?',
      REJECT: 'Rifiutare il report? Il compilatore dovrà revisionarlo.',
      REOPEN: 'Riaprire il report in modalità bozza?',
    };
    if (!confirm(labels[action] ?? `Eseguire azione ${action}?`)) return;
    this.api.post<any>(`/reports/${this.report.id}/transition`, { action }).subscribe({
      next: (updated) => { this.report = { ...this.report, status: updated.status }; },
      error: (e) => alert(e?.error?.message ?? 'Errore durante la transizione.'),
    });
  }

  // ---- Column visibility filter ----

  toggleFilterPanel(): void {
    this.filterPanelOpen = !this.filterPanelOpen;
    // Init visible set with all columns on first open
    if (this.filterPanelOpen && this.visibleColumnIds === null && this.gridData) {
      this.visibleColumnIds = new Set(this.gridData.columns.map(c => c.id));
    }
  }

  isColumnVisible(colId: number): boolean {
    return this.visibleColumnIds === null || this.visibleColumnIds.has(colId);
  }

  toggleColumn(colId: number): void {
    if (!this.gridData) return;
    if (this.visibleColumnIds === null) {
      // Init with all columns, then remove this one
      this.visibleColumnIds = new Set(this.gridData.columns.map(c => c.id));
    }
    const next = new Set(this.visibleColumnIds);
    if (next.has(colId)) {
      // Keep at least one column visible
      if (next.size > 1) next.delete(colId);
    } else {
      next.add(colId);
    }
    this.visibleColumnIds = next;
  }

  showAllColumns(): void { this.visibleColumnIds = null; }

  get visibleColumnCount(): number {
    if (!this.gridData) return 0;
    return this.visibleColumnIds === null
      ? this.gridData.columns.length
      : this.visibleColumnIds.size;
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}
