/**
 * EsgStepLayoutPreviewComponent — fused Layout + Preview + Publish step.
 *
 * Shows the drag-drop layout designer (collapsible left panel) next to the
 * live data entry grid (right panel).  The Publish task list is shown below
 * the split-pane so designers don't need a separate step.
 */
import {
  Component, EventEmitter, Input, OnInit, Output, ViewChild,
} from '@angular/core';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import { TaskSummary } from '../../../models/esg-configurator.models';
import { EsgStepEntryLayoutComponent } from '../esg-step-entry-layout/esg-step-entry-layout.component';

@Component({
  selector:    'esg-step-layout-preview',
  templateUrl: './esg-step-layout-preview.component.html',
})
export class EsgStepLayoutPreviewComponent implements OnInit {
  @Input()  reportId!: number;
  @Output() back = new EventEmitter<void>();

  /** Reference to the embedded layout designer so we can trigger save from outside. */
  @ViewChild(EsgStepEntryLayoutComponent)
  private layoutEditor?: EsgStepEntryLayoutComponent;

  // ── Preview popup state ───────────────────────────────────────────────────
  showPreviewPopup = false;
  showPreview      = true;
  reloading        = false;
  layoutSavedOnce  = false;
  layoutDirty      = false;

  // ── Publish state (formerly EsgStepPublishComponent) ──────────────────────
  tasks:    TaskSummary[] = [];
  pubLoading  = false;
  pubError:   string | null = null;
  pubSuccess: string | null = null;

  /** Currently open dialog: null = closed, undefined = new task, TaskSummary = edit */
  dialogTask: TaskSummary | null | undefined = null;
  get dialogOpen(): boolean { return this.dialogTask !== null; }

  /** Task IDs currently being refreshed (snapshot regeneration) */
  refreshing = new Set<number>();

  viewerSnapshotId: number | null = null;
  viewerTaskLabel   = '';

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void { this.loadTasks(); }

  // ── Preview popup ─────────────────────────────────────────────────────────

  openPreviewPopup(): void {
    this.showPreview     = true;
    this.showPreviewPopup = true;
  }

  closePreviewPopup(): void {
    this.showPreviewPopup = false;
  }

  // ── Layout panel ──────────────────────────────────────────────────────────

  onLayoutSaved(): void {
    this.layoutSavedOnce = true;
    this.layoutDirty = false;
    this.reloading = true;
    this.showPreview = false;
    setTimeout(() => {
      this.showPreview = true;
      setTimeout(() => { this.reloading = false; }, 300);
    }, 80);
  }

  onLayoutChanged(): void {
    this.layoutDirty = true;
  }

  /** Trigger save from the embedded layout editor and then reload preview. */
  saveLayoutFromParent(): void {
    if (!this.layoutEditor) return;
    // Call the child's saveLayout() — success triggers next.emit() which calls onLayoutSaved()
    this.layoutEditor.saveLayout();
  }

  // ── Publish task CRUD ─────────────────────────────────────────────────────

  private loadTasks(): void {
    this.pubLoading = true;
    this.pubError   = null;
    this.svc.listTasks(this.reportId).subscribe({
      next:  (list) => { this.tasks = list; this.pubLoading = false; },
      error: ()     => { this.pubError = 'Impossibile caricare i report pubblicati.'; this.pubLoading = false; },
    });
  }

  openNew():  void { this.dialogTask = undefined; }
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
    this.pubError = null;
    this.svc.activateTask(t.taskId).subscribe({
      next:  () => { this.flash('Report attivato.'); this.loadTasks(); },
      error: () => { this.pubError = 'Impossibile attivare il report.'; },
    });
  }

  openViewer(t: TaskSummary): void {
    this.pubError = null;
    this.svc.getActiveSnapshot(t.taskId).subscribe({
      next:  (snap) => { this.viewerSnapshotId = snap.snapshotId; this.viewerTaskLabel = t.label; },
      error: ()     => { this.pubError = 'Nessuno snapshot trovato. Riattivare per crearlo.'; },
    });
  }

  closeViewer(): void { this.viewerSnapshotId = null; this.viewerTaskLabel = ''; }

  refreshSnapshot(t: TaskSummary): void {
    if (this.refreshing.has(t.taskId)) return;
    this.refreshing.add(t.taskId);
    this.pubError = null;
    this.svc.activateTask(t.taskId).subscribe({
      next:  () => { this.refreshing.delete(t.taskId); this.flash('Snapshot aggiornato con il layout corrente.'); },
      error: () => { this.refreshing.delete(t.taskId); this.pubError = 'Impossibile aggiornare lo snapshot.'; },
    });
  }

  archive(t: TaskSummary): void {
    this.pubError = null;
    this.svc.archiveTask(t.taskId).subscribe({
      next:  () => { this.flash('Report archiviato.'); this.loadTasks(); },
      error: () => { this.pubError = 'Impossibile archiviare il report.'; },
    });
  }

  deleteTask(t: TaskSummary): void {
    if (!confirm(`Eliminare definitivamente "${t.label}"? Questa azione non può essere annullata.`)) return;
    this.pubError = null;
    this.svc.deleteTask(t.taskId).subscribe({
      next:  () => { this.tasks = this.tasks.filter((x) => x.taskId !== t.taskId); this.flash('Report eliminato.'); },
      error: () => { this.pubError = 'Impossibile eliminare il report.'; },
    });
  }

  private flash(msg: string): void {
    this.pubSuccess = msg;
    setTimeout(() => { this.pubSuccess = null; }, 4000);
  }

  statusBadgeClass(status: TaskSummary['status']): string {
    return status === 'Active'   ? 'cfg-badge--success'
         : status === 'Archived' ? 'cfg-badge--muted'
         : 'cfg-badge--info';
  }

  trackByTask(_: number, t: TaskSummary): number { return t.taskId; }
}
