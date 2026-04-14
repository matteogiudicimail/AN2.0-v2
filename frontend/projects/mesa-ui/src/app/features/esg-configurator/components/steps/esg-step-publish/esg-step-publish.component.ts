import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import { DataModelDetail, TaskSummary, ViewerSettings } from '../../../models/esg-configurator.models';

@Component({
  selector: 'esg-step-publish',
  templateUrl: './esg-step-publish.component.html',
})
export class EsgStepPublishComponent implements OnInit {
  @Input()  reportId!: number;
  @Output() back = new EventEmitter<void>();

  tasks:    TaskSummary[] = [];
  taskFilter = '';
  sortCol: 'label' | 'status' | null = null;
  sortAsc = true;
  isLoading = false;
  errorMsg: string | null = null;
  successMsg: string | null = null;

  sortBy(col: 'label' | 'status'): void {
    if (this.sortCol === col) { this.sortAsc = !this.sortAsc; }
    else { this.sortCol = col; this.sortAsc = true; }
  }

  get filteredTasks(): TaskSummary[] {
    const q = this.taskFilter.trim().toLowerCase();
    let list = q ? this.tasks.filter(t => t.label.toLowerCase().includes(q)) : [...this.tasks];
    if (this.sortCol) {
      const col = this.sortCol;
      const asc = this.sortAsc;
      list = list.sort((a, b) => {
        const va = (a[col] ?? '').toLowerCase();
        const vb = (b[col] ?? '').toLowerCase();
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }

  /** Full report detail — used to read trackingEnabled flag. */
  report: DataModelDetail | null = null;

  /** Currently open dialog: null = closed, undefined = new task, TaskSummary = edit */
  dialogTask: TaskSummary | null | undefined = null;

  /** Task IDs currently being refreshed (snapshot regeneration) */
  refreshing = new Set<number>();
  get dialogOpen(): boolean { return this.dialogTask !== null; }

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void {
    this.loadTasks();
    this.svc.getReport(this.reportId).subscribe({
      next:  (r) => { this.report = r; },
      error: ()  => { /* non-critical */ },
    });
  }

  get reportTrackingEnabled(): boolean {
    return this.report?.trackingEnabled ?? false;
  }

  private loadTasks(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.svc.listTasks(this.reportId).subscribe({
      next:  (list) => { this.tasks = list; this.isLoading = false; },
      error: ()     => { this.errorMsg = 'Impossibile caricare i report pubblicati.'; this.isLoading = false; },
    });
  }

  openNew(): void  { this.dialogTask = undefined; }
  openEdit(t: TaskSummary): void { this.dialogTask = t; }
  closeDialog(): void { this.dialogTask = null; }

  onDialogSaved(saved: TaskSummary): void {
    this.closeDialog();
    const idx = this.tasks.findIndex((t) => t.taskId === saved.taskId);
    if (idx >= 0) {
      this.tasks = [...this.tasks.slice(0, idx), saved, ...this.tasks.slice(idx + 1)];
    } else {
      this.tasks = [...this.tasks, saved];
    }
    this.flash('Salvato.');
  }

  activate(t: TaskSummary): void {
    this.errorMsg = null;
    this.svc.activateTask(t.taskId).subscribe({
      next:  () => { this.flash('Report attivato.'); this.loadTasks(); },
      error: () => { this.errorMsg = 'Impossibile attivare il report.'; },
    });
  }

  // ── Snapshot viewer ────────────────────────────────────────────────────────
  viewerSnapshotId:      number | null = null;
  viewerTaskLabel        = '';
  viewerDefaultFilters:  string | null = null;
  viewerHiddenFilters:   string | null = null;
  viewerSettings:        ViewerSettings | null = null;

  openViewer(t: TaskSummary): void {
    this.errorMsg = null;
    this.svc.getActiveSnapshot(t.taskId).subscribe({
      next:  (snap) => {
        this.viewerSnapshotId     = snap.snapshotId;
        this.viewerTaskLabel      = t.label;
        this.viewerDefaultFilters = t.defaultFilters ?? null;
        this.viewerHiddenFilters  = t.hiddenFilters  ?? null;
        this.viewerSettings       = t.viewerSettings ?? null;
      },
      error: ()     => { this.errorMsg = 'Nessuno snapshot trovato per questo task. Riattivare per crearlo.'; },
    });
  }

  closeViewer(): void {
    this.viewerSnapshotId    = null;
    this.viewerTaskLabel     = '';
    this.viewerDefaultFilters = null;
    this.viewerHiddenFilters = null;
    this.viewerSettings      = null;
  }

  refreshSnapshot(t: TaskSummary): void {
    if (this.refreshing.has(t.taskId)) return;
    this.refreshing.add(t.taskId);
    this.errorMsg = null;
    // activateTask is idempotent on Active tasks: keeps status Active, recreates snapshot from current layout
    this.svc.activateTask(t.taskId).subscribe({
      next:  () => { this.refreshing.delete(t.taskId); this.flash('Snapshot aggiornato con il layout corrente.'); },
      error: () => { this.refreshing.delete(t.taskId); this.errorMsg = 'Impossibile aggiornare lo snapshot.'; },
    });
  }

  archive(t: TaskSummary): void {
    this.errorMsg = null;
    this.svc.archiveTask(t.taskId).subscribe({
      next:  () => { this.flash('Report archiviato.'); this.loadTasks(); },
      error: () => { this.errorMsg = 'Impossibile archiviare il report.'; },
    });
  }

  deleteTask(t: TaskSummary): void {
    if (!confirm(`Eliminare definitivamente "${t.label}"? Questa azione non può essere annullata.`)) return;
    this.errorMsg = null;
    this.svc.deleteTask(t.taskId).subscribe({
      next:  () => { this.tasks = this.tasks.filter((x) => x.taskId !== t.taskId); this.flash('Report eliminato.'); },
      error: () => { this.errorMsg = 'Impossibile eliminare il report.'; },
    });
  }

  private flash(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = null; }, 4000);
  }

  statusBadgeClass(status: TaskSummary['status']): string {
    return status === 'Active' ? 'cfg-badge--success'
         : status === 'Archived' ? 'cfg-badge--muted'
         : 'cfg-badge--info';
  }

  trackByTask(_: number, t: TaskSummary): number { return t.taskId; }
}
