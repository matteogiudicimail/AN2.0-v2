import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EsgConfiguratorService } from '../../../../services/esg-configurator.service';
import { ParamRow, UpsertParamRowDto } from '../../../../models/esg-configurator.models';

@Component({
  selector: 'kpi-metadata-lens',
  templateUrl: './kpi-metadata-lens.component.html',
})
export class KpiMetadataLensComponent implements OnInit {
  @Input() row!: ParamRow;
  @Input() paramTableId!: number;
  @Output() closed = new EventEmitter<void>();
  @Output() saved  = new EventEmitter<ParamRow>();

  safeHtml: SafeHtml = '';
  isEditing  = false;
  isSaving   = false;
  editValue  = '';
  errorMsg: string | null = null;

  constructor(
    private sanitizer: DomSanitizer,
    private svc: EsgConfiguratorService,
  ) {}

  ngOnInit(): void {
    this.renderHtml(this.row.compilationGuide);
  }

  private renderHtml(html: string | null): void {
    const content = html?.trim() || '<em>No compilation guide available.</em>';
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(content);
  }

  startEdit(): void {
    this.editValue = this.row.compilationGuide ?? '';
    this.isEditing = true;
  }

  cancelEdit(): void { this.isEditing = false; }

  saveEdit(): void {
    const dto: UpsertParamRowDto = {
      sourceValue:      this.row.sourceValue,
      label:            this.row.label,
      rowKind:          this.row.rowKind,
      parentParamId:    this.row.parentParamId,
      grouping:         this.row.grouping,
      formula:          this.row.formula,
      compilationGuide: this.editValue || null,
      isEditable:       this.row.isEditable,
      isFormula:        this.row.isFormula,
      isVisible:        this.row.isVisible,
    };
    this.isSaving  = true;
    this.errorMsg  = null;
    this.svc.updateParamRow(this.paramTableId, this.row.paramId, dto).subscribe({
      next: (updated) => {
        this.row = updated;
        this.renderHtml(updated.compilationGuide);
        this.isEditing = false;
        this.isSaving  = false;
        this.saved.emit(updated);
      },
      error: () => { this.errorMsg = 'Impossibile salvare la guida.'; this.isSaving = false; },
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('cfg-kpi-modal__backdrop')) {
      this.closed.emit();
    }
  }
}
