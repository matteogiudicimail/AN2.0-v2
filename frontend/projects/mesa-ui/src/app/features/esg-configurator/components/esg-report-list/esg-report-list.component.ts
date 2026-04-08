import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../services/esg-configurator.service';
import { DataModelSummary } from '../../models/esg-configurator.models';

type SortCol = 'reportCode' | 'reportLabel' | 'writebackMode' | 'status' | 'version' | 'updatedAt';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'esg-report-list',
  templateUrl: './esg-report-list.component.html',
})
export class EsgReportListComponent implements OnInit {
  @Output() openWizard = new EventEmitter<number | null>();

  reports: DataModelSummary[] = [];
  isLoading = false;
  errorMsg: string | null = null;

  /** Text search across code + name */
  searchText = '';

  sortCol: SortCol = 'updatedAt';
  sortDir: SortDir = 'desc';

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.svc.listReports().subscribe({
      next:  (all) => {
        this.reports   = all.filter(r => r.domain === 'ESG');
        this.isLoading = false;
      },
      error: () => { this.errorMsg = 'Could not load Data Models.'; this.isLoading = false; },
    });
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
        case 'reportCode':    va = a.reportCode;    vb = b.reportCode;    break;
        case 'reportLabel':   va = a.reportLabel;   vb = b.reportLabel;   break;
        case 'writebackMode': va = a.writebackMode ?? ''; vb = b.writebackMode ?? ''; break;
        case 'status':        va = a.status ?? '';  vb = b.status ?? '';  break;
        case 'version':       va = a.version ?? 0;  vb = b.version ?? 0;  break;
        case 'updatedAt':     va = a.updatedAt ?? ''; vb = b.updatedAt ?? ''; break;
      }
      if (va < vb) return this.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return this.sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return rows;
  }

  sortBy(col: SortCol): void {
    if (this.sortCol === col) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = col;
      this.sortDir = 'asc';
    }
  }

  sortIcon(col: SortCol): string {
    if (this.sortCol !== col) return '⇅';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  trackById(_: number, r: DataModelSummary): number { return r.reportId; }
}
