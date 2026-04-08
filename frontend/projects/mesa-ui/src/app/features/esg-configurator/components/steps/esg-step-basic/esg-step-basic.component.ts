import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ReportDetail, CreateReportDto, UpdateReportDto, WritebackMode } from '../../../models/esg-configurator.models';

@Component({
  selector: 'esg-step-basic',
  templateUrl: './esg-step-basic.component.html',
})
export class EsgStepBasicComponent implements OnChanges {
  @Input() report: ReportDetail | null = null;
  @Input() isSaving = false;
  @Output() saved = new EventEmitter<CreateReportDto | UpdateReportDto>();

  form: FormGroup;

  constructor(private fb: FormBuilder) {
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

  get codeCtrl()  { return this.form.get('reportCode')!; }
  get labelCtrl() { return this.form.get('reportLabel')!; }
}
