import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import { TaskSummary } from '../../../models/esg-configurator.models';

@Component({
  selector: 'esg-step-publish',
  templateUrl: './esg-step-publish.component.html',
})
export class EsgStepPublishComponent implements OnInit {
  @Input()  reportId!: number;
  @Output() back = new EventEmitter<void>();

  tasks:    TaskSummary[] = [];
  isLoading = false;
  errorMsg: string | null = null;
  successMsg: string | null = null;

  /** Currently open dialog: null = closed, undefined = new task, TaskSummary = edit */
  dialogTask: TaskSummary | null | undefined = null;

  /** Task IDs currently being refreshed (snapshot regeneration) */
  refreshing = new Set<number>();
  get dialogOpen(): boolean { return this.dialogTask !== null; }

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void { this.loadTasks(); }

  private loadTasks(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.svc.listTasks(this.reportId).subscribe({
      next:  (list) => { this.tasks = list; this.isLoading = false; },
      error: ()     => { this.errorMsg = 'Could not load published reports.'; this.isLoading = false; },
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
    this.flash('Saved.');
  }

  activate(t: TaskSummary): void {
    this.errorMsg = null;
    this.svc.activateTask(t.taskId).subscribe({
      next:  () => { this.flash('Report activated.'); this.loadTasks(); },
      error: () => { this.errorMsg = 'Could not activate report.'; },
    });
  }

  // ── Snapshot viewer ────────────────────────────────────────────────────────
  viewerSnapshotId:      number | null = null;
  viewerTaskLabel        = '';
  viewerDefaultFilters:  string | null = null;

  openViewer(t: TaskSummary): void {
    this.errorMsg = null;
    this.svc.getActiveSnapshot(t.taskId).subscribe({
      next:  (snap) => {
        this.viewerSnapshotId     = snap.snapshotId;
        this.viewerTaskLabel      = t.label;
        this.viewerDefaultFilters = t.defaultFilters ?? null;
      },
      error: ()     => { this.errorMsg = 'Nessuno snapshot trovato per questo task. Riattivare per crearlo.'; },
    });
  }

  closeViewer(): void { this.viewerSnapshotId = null; this.viewerTaskLabel = ''; this.viewerDefaultFilters = null; }

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
      next:  () => { this.flash('Report archived.'); this.loadTasks(); },
      error: () => { this.errorMsg = 'Could not archive report.'; },
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
