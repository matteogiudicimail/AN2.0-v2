import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../services/esg-configurator.service';
import { DataModelDetail, CreateDataModelDto, UpdateDataModelDto } from '../../models/esg-configurator.models';

type WizardStep = 1 | 2 | 3 | 4;

export type WizardMode = 'definition' | 'designer';

interface StepDef {
  label:      string;
  index:      WizardStep;  // internal step index (used in *ngIf)
  displayNum: number;      // number shown to the user (always starts from 1)
}

const DEFINITION_STEPS: StepDef[] = [
  { label: 'Info',       index: 1, displayNum: 1 },
  { label: 'Database',   index: 2, displayNum: 2 },
  { label: 'Parameters', index: 3, displayNum: 3 },
];

const DESIGNER_STEPS: StepDef[] = [
  { label: 'Layout + Preview', index: 4, displayNum: 1 },
];

@Component({
  selector: 'esg-report-wizard',
  templateUrl: './esg-report-wizard.component.html',
})
export class EsgReportWizardComponent implements OnInit {
  @Input()  reportId:    number | null = null;
  @Input()  initialStep: WizardStep    = 1;
  @Input()  mode: WizardMode = 'definition';
  @Output() back = new EventEmitter<void>();

  step: WizardStep = 1;
  report: DataModelDetail | null = null;
  isNew    = false;
  isSaving = false;
  errorMsg: string | null = null;

  constructor(private svc: EsgConfiguratorService) {}

  get visibleSteps(): StepDef[] {
    return this.mode === 'definition' ? DEFINITION_STEPS : DESIGNER_STEPS;
  }

  get modeTitle(): string {
    return this.mode === 'definition' ? 'Data Model' : 'Report Designer';
  }

  get modeIcon(): string {
    return this.mode === 'definition' ? '⬡' : '▦';
  }

  ngOnInit(): void {
    this.step = this.mode === 'designer' ? 4 : 1;

    if (this.reportId) {
      this.loadReport();
      const valid = this.visibleSteps.map(s => s.index);
      if (valid.includes(this.initialStep)) {
        this.step = this.initialStep;
      }
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
