import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ConfiguratorService } from '../../services/configurator.service';
import { ReportSummary } from '../../models/configurator.models';

@Component({
  selector: 'cfg-report-list',
  templateUrl: './report-list.component.html',
})
export class ReportListComponent implements OnInit {
  reports: ReportSummary[] = [];
  isLoading = false;
  errorMsg: string | null = null;

  constructor(
    private configuratorSvc: ConfiguratorService,
    private router: Router,
  ) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.configuratorSvc.listReports().subscribe({
      next:  (data) => { this.reports = data; this.isLoading = false; },
      error: (err)  => { this.errorMsg = 'Error loading reports.'; this.isLoading = false; console.error(err); },
    });
  }

  openWizard(reportId?: number): void {
    this.router.navigate(['configurator', 'wizard', reportId ?? 'new']);
  }

  publish(r: ReportSummary, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Publish "${r.reportLabel}"?`)) return;
    this.configuratorSvc.publishReport(r.reportId).subscribe({
      next:  () => this.load(),
      error: (err) => { this.errorMsg = 'Could not publish report.'; console.error(err); },
    });
  }

  archive(r: ReportSummary, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Archive "${r.reportLabel}"?`)) return;
    this.configuratorSvc.archiveReport(r.reportId).subscribe({
      next:  () => this.load(),
      error: (err) => { this.errorMsg = 'Could not archive report.'; console.error(err); },
    });
  }

  trackById(_: number, r: ReportSummary): number { return r.reportId; }
}
