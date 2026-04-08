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
  viewerSnapshotId: number | null = null;
  viewerTaskLabel   = '';

  openViewer(t: TaskSummary): void {
    this.errorMsg = null;
    this.svc.getActiveSnapshot(t.taskId).subscribe({
      next:  (snap) => { this.viewerSnapshotId = snap.snapshotId; this.viewerTaskLabel = t.label; },
      error: ()     => { this.errorMsg = 'Nessuno snapshot trovato per questo task. Riattivare per crearlo.'; },
    });
  }

  closeViewer(): void { this.viewerSnapshotId = null; this.viewerTaskLabel = ''; }

  archive(t: TaskSummary): void {
    this.errorMsg = null;
    this.svc.archiveTask(t.taskId).subscribe({
      next:  () => { this.flash('Report archived.'); this.loadTasks(); },
      error: () => { this.errorMsg = 'Could not archive report.'; },
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
