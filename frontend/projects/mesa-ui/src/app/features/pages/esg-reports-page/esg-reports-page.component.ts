import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../esg-configurator/services/esg-configurator.service';
import { TaskSummary } from '../../esg-configurator/models/esg-configurator.models';
import { User } from '../../../core/models/grid.model';

type StatusFilter = 'All' | 'Active' | 'Draft' | 'Archived';
type SortKey = 'label' | 'status' | 'reportLabel';

@Component({
  selector: 'app-esg-reports-page',
  templateUrl: './esg-reports-page.component.html',
  styleUrls: ['./esg-reports-page.component.scss'],
})
export class EsgReportsPageComponent implements OnInit {
  @Input() user: User | null = null;

  /** Open configurator (optionally for a specific reportId). */
  @Output() openConfigurator = new EventEmitter<number | null>();
  /** Open a published task in the full-page snapshot viewer. */
  @Output() openTask = new EventEmitter<{ taskId: number; label: string }>();

  tasks:    TaskSummary[] = [];
  loading   = false;
  errorMsg: string | null = null;
  successMsg: string | null = null;

  filterText   = '';
  filterStatus: StatusFilter = 'Active';
  sortKey:  SortKey = 'reportLabel';
  sortAsc   = true;

  readonly statusFilters: StatusFilter[] = ['All', 'Active', 'Draft', 'Archived'];

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading  = true;
    this.errorMsg = null;
    this.svc.listAllTasks({ domain: 'ESG' }).subscribe({
      next:  (tasks) => { this.tasks = tasks; this.loading = false; },
      error: ()      => { this.errorMsg = 'Impossibile caricare i report.'; this.loading = false; },
    });
  }

  get isAdmin(): boolean {
    if (!this.user) return true;
    return this.user.roles?.includes('ADMIN') ?? false;
  }

  get counts(): Record<StatusFilter, number> {
    return {
      All:      this.tasks.length,
      Active:   this.tasks.filter((t) => t.status === 'Active').length,
      Draft:    this.tasks.filter((t) => t.status === 'Draft').length,
      Archived: this.tasks.filter((t) => t.status === 'Archived').length,
    };
  }

  get filteredTasks(): TaskSummary[] {
    let result = this.tasks;

    if (this.filterStatus !== 'All') {
      result = result.filter((t) => t.status === this.filterStatus);
    }

    const q = this.filterText.trim().toLowerCase();
    if (q) {
      result = result.filter((t) =>
        t.label.toLowerCase().includes(q) ||
        t.taskCode.toLowerCase().includes(q) ||
        (t.reportLabel ?? '').toLowerCase().includes(q) ||
        (t.reportCode ?? '').toLowerCase().includes(q),
      );
    }

    return [...result].sort((a, b) => {
      let av: string;
      let bv: string;
      if (this.sortKey === 'reportLabel') {
        av = a.reportLabel ?? a.label;
        bv = b.reportLabel ?? b.label;
      } else {
        av = String(a[this.sortKey] ?? '');
        bv = String(b[this.sortKey] ?? '');
      }
      const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      return this.sortAsc ? cmp : -cmp;
    });
  }

  sort(key: SortKey): void {
    if (this.sortKey === key) this.sortAsc = !this.sortAsc;
    else { this.sortKey = key; this.sortAsc = true; }
  }

  sortIcon(key: SortKey): string {
    if (this.sortKey !== key) return '↕';
    return this.sortAsc ? '↑' : '↓';
  }

  statusLabel(s: StatusFilter): string {
    const map: Record<StatusFilter, string> = {
      All: 'Tutti', Active: 'Attivi', Draft: 'Bozze', Archived: 'Archiviati',
    };
    return map[s];
  }

  statusBadgeClass(status: TaskSummary['status']): string {
    return status === 'Active'   ? 'rp-badge--active'
         : status === 'Archived' ? 'rp-badge--archived'
         : 'rp-badge--draft';
  }

  // ── Open full-page ──────────────────────────────────────────────────────────

  openReport(t: TaskSummary): void {
    this.openTask.emit({ taskId: t.taskId, label: t.label });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  deleteTask(t: TaskSummary): void {
    if (!confirm(`Eliminare definitivamente "${t.label}"?\n\nQuesta operazione non può essere annullata.`)) return;
    this.errorMsg = null;
    this.svc.deleteTask(t.taskId).subscribe({
      next: () => {
        this.tasks = this.tasks.filter((x) => x.taskId !== t.taskId);
        this.flash('Report eliminato.');
      },
      error: () => { this.errorMsg = 'Impossibile eliminare il report.'; },
    });
  }

  private flash(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = null; }, 3500);
  }

  // ── Activate (Draft → Active) ───────────────────────────────────────────────

  activating: number | null = null;

  activate(t: TaskSummary): void {
    if (!confirm(`Attivare il report "${t.label}"?\n\nIl report sarà visibile a tutti gli utenti.`)) return;
    this.errorMsg  = null;
    this.activating = t.taskId;
    this.svc.activateTask(t.taskId).subscribe({
      next: () => {
        t.status = 'Active';
        this.activating = null;
        this.flash('Report attivato.');
      },
      error: () => {
        this.activating = null;
        this.errorMsg = 'Impossibile attivare il report.';
      },
    });
  }

  // ── Configurator navigation ─────────────────────────────────────────────────

  configure(t: TaskSummary): void { this.openConfigurator.emit(t.reportId); }
  newReport(): void               { this.openConfigurator.emit(null); }

  // ── Track ───────────────────────────────────────────────────────────────────

  trackByTask(_: number, t: TaskSummary): number { return t.taskId; }
}
