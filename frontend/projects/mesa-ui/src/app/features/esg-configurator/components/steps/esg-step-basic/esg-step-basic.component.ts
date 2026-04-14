import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ReportDetail, CreateReportDto, UpdateReportDto, WritebackMode } from '../../../models/esg-configurator.models';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';

@Component({
  selector: 'esg-step-basic',
  templateUrl: './esg-step-basic.component.html',
})
export class EsgStepBasicComponent implements OnChanges {
  @Input() report: ReportDetail | null = null;
  @Input() isSaving = false;
  @Output() saved = new EventEmitter<CreateReportDto | UpdateReportDto>();
  @Output() reportChanged = new EventEmitter<ReportDetail>();

  form: FormGroup;

  trackingEnabled = false;
  isSavingTracking = false;
  trackingSaveError: string | null = null;

  constructor(private fb: FormBuilder, private svc: EsgConfiguratorService) {
    this.form = this.fb.group({
      reportCode:    ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-zA-Z0-9_-]+$/)]],
      reportLabel:   ['', [Validators.required, Validators.maxLength(200)]],
      description:   [''],
      writebackMode: ['Delta' as WritebackMode, Validators.required],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['report'] && this.report) {
      this.form.patchValue({
        reportCode:    this.report.reportCode,
        reportLabel:   this.report.reportLabel,
        description:   this.report.description ?? '',
        writebackMode: this.report.writebackMode,
      });
      this.trackingEnabled = this.report.trackingEnabled ?? false;
      if (this.report.reportId) {
        this.form.get('reportCode')!.disable();
      }
    }
  }

  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    if (this.report?.reportId) {
      this.saved.emit({
        reportLabel:   v.reportLabel.trim(),
        description:   v.description?.trim() || undefined,
        writebackMode: v.writebackMode as WritebackMode,
      } as UpdateReportDto);
    } else {
      this.saved.emit({
        reportCode:    v.reportCode.trim(),
        reportLabel:   v.reportLabel.trim(),
        description:   v.description?.trim() || undefined,
        writebackMode: v.writebackMode as WritebackMode,
        domain:        'ESG',
      } as CreateReportDto);
    }
  }

  toggleTracking(enabled: boolean): void {
    if (!this.report?.reportId) return;
    this.isSavingTracking = true;
    this.trackingSaveError = null;
    this.svc.setReportTracking(this.report.reportId, enabled).subscribe({
      next: (updated) => {
        this.trackingEnabled = updated.trackingEnabled ?? enabled;
        this.isSavingTracking = false;
        this.reportChanged.emit(updated);
      },
      error: () => {
        // Revert toggle on error
        this.trackingEnabled = !enabled;
        this.isSavingTracking = false;
        this.trackingSaveError = 'Impossibile salvare la configurazione di tracciatura.';
      },
    });
  }

  get codeCtrl()  { return this.form.get('reportCode')!; }
  get labelCtrl() { return this.form.get('reportLabel')!; }
}
