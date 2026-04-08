import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../services/esg-configurator.service';
import { DataModelDetail, CreateDataModelDto, UpdateDataModelDto } from '../../models/esg-configurator.models';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

@Component({
  selector: 'esg-report-wizard',
  templateUrl: './esg-report-wizard.component.html',
})
export class EsgReportWizardComponent implements OnInit {
  @Input()  reportId:    number | null = null;
  @Input()  initialStep: WizardStep    = 1;
  @Output() back = new EventEmitter<void>();

  step: WizardStep = 1;
  report: DataModelDetail | null = null;
  isNew    = false;
  isSaving = false;
  errorMsg: string | null = null;

  readonly steps: { label: string; index: WizardStep }[] = [
    { label: '1. Basic Info',       index: 1 },
    { label: '2. Data Model',       index: 2 },
    { label: '3. Parameters',       index: 3 },
    { label: '4. Report Designer',  index: 4 },
    { label: '5. Preview',          index: 5 },
    { label: '6. Publish',          index: 6 },
  ];

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void {
    if (this.reportId) {
      this.loadReport();
      if (this.initialStep > 1) { this.step = this.initialStep; }
    } else {
      this.isNew = true;
    }
  }

  private loadReport(): void {
    this.svc.getReport(this.reportId!).subscribe({
      next:  (r) => { this.report = r; },
      error: ()  => { this.errorMsg = 'Could not load the Data Model.'; },
    });
  }

  onBasicSaved(dto: CreateDataModelDto | UpdateDataModelDto): void {
    this.isSaving = true;
    this.errorMsg = null;

    if (this.isNew) {
      this.svc.createReport(dto as CreateDataModelDto).subscribe({
        next: (r) => {
          this.report   = r;
          this.reportId = r.reportId;
          this.isNew    = false;
          this.isSaving = false;
          this.step     = 2;
        },
        error: () => { this.errorMsg = 'Could not save the Data Model.'; this.isSaving = false; },
      });
    } else {
      this.svc.updateReport(this.reportId!, dto as UpdateDataModelDto).subscribe({
        next: (r) => { this.report = r; this.isSaving = false; this.step = 2; },
        error: () => { this.errorMsg = 'Could not update the Data Model.'; this.isSaving = false; },
      });
    }
  }

  goTo(s: WizardStep): void {
    if (s > 1 && !this.reportId) return;
    this.step = s;
  }

  isStepDisabled(s: WizardStep): boolean {
    return s > 1 && !this.reportId;
  }
}
