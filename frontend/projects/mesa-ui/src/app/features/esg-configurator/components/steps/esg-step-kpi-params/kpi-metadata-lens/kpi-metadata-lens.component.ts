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
      sourceValue:       this.row.sourceValue,
      label:             this.row.label,
      compilationGuide: this.editValue || null,
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
      error: () => { this.errorMsg = 'Could not save the guide.'; this.isSaving = false; },
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('cfg-kpi-modal__backdrop')) {
      this.closed.emit();
    }
  }
}
