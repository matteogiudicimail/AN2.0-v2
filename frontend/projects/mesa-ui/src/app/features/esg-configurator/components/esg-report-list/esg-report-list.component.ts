import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../services/esg-configurator.service';
import { DataModelSummary, TaskSummary } from '../../models/esg-configurator.models';

type SortCol = 'reportCode' | 'reportLabel' | 'writebackMode' | 'status' | 'version' | 'updatedAt';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'esg-report-list',
  templateUrl: './esg-report-list.component.html',
})
export class EsgReportListComponent implements OnInit {
  /** Open the Data Model definition wizard (steps 1-3) */
  @Output() openDefinition = new EventEmitter<number | null>();
  /** Open the Report Designer wizard (steps 4-6) */
  @Output() openDesigner   = new EventEmitter<number>();

  reports: DataModelSummary[] = [];
  isLoading = false;
  errorMsg: string | null = null;

  searchText = '';
  sortCol: SortCol = 'updatedAt';
  sortDir: SortDir = 'desc';

  /** Tasks grouped by reportId */
  tasksByReport = new Map<number, TaskSummary[]>();

  // ── Drawer ─────────────────────────────────────────────────────────────────

  /** reportId il cui drawer è aperto; null = drawer chiuso */
  drawerReportId: number | null = null;

  get drawerTasks(): TaskSummary[] {
    return this.drawerReportId !== null ? this.tasksFor(this.drawerReportId) : [];
  }

  get drawerReportLabel(): string {
    if (this.drawerReportId === null) return '';
    return this.reports.find(r => r.reportId === this.drawerReportId)?.reportLabel ?? '';
  }

  openDrawer(reportId: number, event: Event): void {
    event.stopPropagation();
    this.drawerReportId = reportId;
  }

  closeDrawer(): void {
    this.drawerReportId = null;
    this.closeDialog();
  }

  // ── Publish dialog (nuovo / modifica task) ─────────────────────────────────

  /** reportId per il quale il dialog è aperto */
  activeReportId: number | null = null;
  dialogOpen = false;
  /** undefined = nuovo task, TaskSummary = modifica */
  dialogTask: TaskSummary | null | undefined = null;

  openNewTask(reportId: number, event: Event): void {
    event.stopPropagation();
    this.activeReportId = reportId;
    this.dialogTask     = undefined;
    this.dialogOpen     = true;
  }

  openEditTask(task: TaskSummary): void {
    this.activeReportId = task.reportId;
    this.dialogTask     = task;
    this.dialogOpen     = true;
  }

  closeDialog(): void {
    this.dialogOpen     = false;
    this.dialogTask     = null;
    this.activeReportId = null;
  }

  onDialogSaved(_saved: TaskSummary): void {
    this.closeDialog();
    this.loadTasks();
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.svc.listReports().subscribe({
      next: (all) => {
        this.reports   = all.filter(r => r.domain === 'ESG');
        this.isLoading = false;
        this.loadTasks();
      },
      error: () => { this.errorMsg = 'Impossibile caricare i Data Model.'; this.isLoading = false; },
    });
  }

  loadTasks(): void {
    this.svc.listAllTasks({ domain: 'ESG' }).subscribe({
      next: (tasks) => {
        this.tasksByReport.clear();
        for (const t of tasks) {
          const list = this.tasksByReport.get(t.reportId) ?? [];
          list.push(t);
          this.tasksByReport.set(t.reportId, list);
        }
      },
      error: () => { /* non bloccante */ },
    });
  }

  tasksFor(reportId: number): TaskSummary[] {
    return this.tasksByReport.get(reportId) ?? [];
  }

  taskStatusClass(status: string): string {
    if (status === 'Active')   return 'cfg-badge--published';
    if (status === 'Archived') return 'cfg-badge--archived';
    return 'cfg-badge--draft';
  }

  get filteredReports(): DataModelSummary[] {
    const q = this.searchText.toLowerCase().trim();
    let rows = q
      ? this.reports.filter(r =>
          r.reportCode.toLowerCase().includes(q) ||
          r.reportLabel.toLowerCase().includes(q) ||
          (r.status ?? '').toLowerCase().includes(q))
      : [...this.reports];

    rows.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (this.sortCol) {
        case 'reportCode':    va = a.reportCode;          vb = b.reportCode;          break;
        case 'reportLabel':   va = a.reportLabel;         vb = b.reportLabel;         break;
        case 'writebackMode': va = a.writebackMode ?? ''; vb = b.writebackMode ?? ''; break;
        case 'status':        va = a.status ?? '';         vb = b.status ?? '';         break;
        case 'version':       va = a.version ?? 0;         vb = b.version ?? 0;         break;
        case 'updatedAt':     va = a.updatedAt ?? '';      vb = b.updatedAt ?? '';      break;
      }
      if (va < vb) return this.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return this.sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return rows;
  }

  sortBy(col: SortCol): void {
    if (this.sortCol === col) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else { this.sortCol = col; this.sortDir = 'asc'; }
  }

  sortIcon(col: SortCol): string {
    if (this.sortCol !== col) return '⇅';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  trackById(_: number, r: DataModelSummary): number { return r.reportId; }
  trackByTask(_: number, t: TaskSummary): number     { return t.taskId; }

  // ── Duplicate ──────────────────────────────────────────────────────────────

  duplicatingReport = new Set<number>();

  duplicateReport(reportId: number, event: Event): void {
    event.stopPropagation();
    if (this.duplicatingReport.has(reportId)) return;
    this.duplicatingReport.add(reportId);
    this.svc.duplicateReport(reportId).subscribe({
      next: () => {
        this.duplicatingReport.delete(reportId);
        this.load();
      },
      error: () => {
        this.duplicatingReport.delete(reportId);
        this.errorMsg = 'Impossibile duplicare il Data Model.';
      },
    });
  }
}
