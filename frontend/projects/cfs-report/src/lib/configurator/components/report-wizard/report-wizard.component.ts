/**
 * ReportWizardComponent — 4-step wizard for creating/editing a report.
 * Steps: 1 Basic info | 2 DB Explorer | 3 Structure | 4 Tasks
 */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfiguratorService } from '../../services/configurator.service';
import { ReportDetail, CreateReportDto, UpdateReportDto } from '../../models/configurator.models';

export type WizardStep = 1 | 2 | 3 | 4;

@Component({
  selector: 'cfg-report-wizard',
  templateUrl: './report-wizard.component.html',
})
export class ReportWizardComponent implements OnInit {
  step: WizardStep = 1;
  report: ReportDetail | null = null;
  reportId: number | null = null;
  isNew = false;
  isSaving = false;
  errorMsg: string | null = null;

  readonly steps: { label: string; index: WizardStep }[] = [
    { label: '1. Basic Info',    index: 1 },
    { label: '2. DB Explorer',   index: 2 },
    { label: '3. Structure',     index: 3 },
    { label: '4. Tasks',         index: 4 },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private configuratorSvc: ConfiguratorService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === 'new') {
      this.isNew = true;
    } else {
      this.reportId = Number(id);
      this.loadReport();
    }
  }

  private loadReport(): void {
    if (!this.reportId) return;
    this.configuratorSvc.getReport(this.reportId).subscribe({
      next:  (r) => { this.report = r; },
      error: (err) => { this.errorMsg = 'Could not load report.'; console.error(err); },
    });
  }

  /** Called by step-basic when the form is submitted */
  onBasicSaved(dto: CreateReportDto | UpdateReportDto): void {
    this.isSaving = true;
    this.errorMsg = null;

    if (this.isNew) {
      this.configuratorSvc.createReport(dto as CreateReportDto).subscribe({
        next: (r) => {
          this.report   = r;
          this.reportId = r.reportId;
          this.isNew    = false;
          this.isSaving = false;
          this.goTo(2);
        },
        error: (err) => { this.errorMsg = 'Could not save report.'; this.isSaving = false; console.error(err); },
      });
    } else {
      this.configuratorSvc.updateReport(this.reportId!, dto as UpdateReportDto).subscribe({
        next: (r) => {
          this.report   = r;
          this.isSaving = false;
          this.goTo(2);
        },
        error: (err) => { this.errorMsg = 'Could not save report.'; this.isSaving = false; console.error(err); },
      });
    }
  }

  goTo(s: WizardStep): void {
    if (s < 1 || s > 4) return;
    // Steps 2-4 require a saved report
    if (s > 1 && !this.reportId) return;
    this.step = s;
  }

  goBack(): void  { this.goTo((this.step - 1) as WizardStep); }
  goNext(): void  { this.goTo((this.step + 1) as WizardStep); }

  backToList(): void {
    this.router.navigate(['configurator']);
  }
}
