import {
  Component, EventEmitter, Input, OnInit, Output,
} from '@angular/core';
import { EsgConfiguratorService } from '../../../../services/esg-configurator.service';
import { DataEntryGridResponse } from '../../../../models/esg-configurator.models';

export type InsertRowTab = 'param' | 'manual';

@Component({
  selector: 'insert-row-dialog',
  templateUrl: './insert-row-dialog.component.html',
})
export class InsertRowDialogComponent implements OnInit {
  @Input() grid!: DataEntryGridResponse;
  @Input() reportId!: number;
  @Input() selectedFiltri: Record<string, string> = {};

  @Output() rowInserted = new EventEmitter<void>();
  @Output() cancelled   = new EventEmitter<void>();

  activeTab: InsertRowTab = 'param';

  // ── Tab 1: Nuovo indicatore (PARAM) ─────────────────────────────────────
  /** Row fields that have an associated param table */
  paramRowFields: Array<{ fieldName: string; label: string; paramTableId: number }> = [];
  selectedParamFieldName = '';
  paramSourceValue = '';
  paramLabel = '';
  paramIsLoading = false;
  paramError: string | null = null;
  paramSuccess = false;

  // ── Tab 2: Riga manuale (WRITE) ──────────────────────────────────────────
  /** Dimension fields that appear in the WRITE table PK (fact dims only) */
  manualDimFields: Array<{ fieldName: string; label: string }> = [];
  manualValues: Record<string, string> = {};
  manualIsLoading = false;
  manualError: string | null = null;
  manualSuccess = false;

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void {
    this.buildParamFields();
    this.buildManualDimFields();
  }

  // ── Build helpers ──────────────────────────────────────────────────────

  private isGroupingField(f: { fieldName: string; paramTableId: number | null }): boolean {
    return !!(f.paramTableId) && f.fieldName.endsWith('_Grouping');
  }

  private isFactDim(f: { fieldName: string; paramTableId: number | null; dimTable?: string | null }): boolean {
    return !this.isGroupingField(f) && (!f.dimTable || !!(f.paramTableId));
  }

  private buildParamFields(): void {
    const rows = this.grid.layout.rows ?? (this.grid.layout as any).righe ?? [];
    this.paramRowFields = rows
      .filter((f: any) => f.paramTableId && !this.isGroupingField(f))
      .map((f: any) => ({ fieldName: f.fieldName, label: f.label, paramTableId: f.paramTableId as number }));
    if (this.paramRowFields.length > 0) {
      this.selectedParamFieldName = this.paramRowFields[0].fieldName;
    }
  }

  private buildManualDimFields(): void {
    const filters = this.grid.layout.filters ?? (this.grid.layout as any).filtri ?? [];
    const rows    = this.grid.layout.rows    ?? (this.grid.layout as any).righe ?? [];
    const columns = this.grid.layout.columns ?? (this.grid.layout as any).colonne ?? [];

    const factFilters  = filters.filter((f: any) => this.isFactDim(f));
    const factRows     = rows.filter((f: any) => this.isFactDim(f));
    const factColumns  = columns;

    this.manualDimFields = [
      ...factFilters.map((f: any) => ({ fieldName: f.fieldName, label: f.label })),
      ...factRows.map((f: any) => ({ fieldName: f.fieldName, label: f.label })),
      ...factColumns.map((f: any) => ({ fieldName: f.fieldName, label: f.label })),
    ];

    // Pre-fill from currently selected filters
    this.manualDimFields.forEach((f) => {
      this.manualValues[f.fieldName] = this.selectedFiltri[f.fieldName] ?? '';
    });
  }

  // ── Tab 1 actions ─────────────────────────────────────────────────────

  get selectedParamField(): { fieldName: string; label: string; paramTableId: number } | undefined {
    return this.paramRowFields.find((f) => f.fieldName === this.selectedParamFieldName);
  }

  saveNewIndicator(): void {
    const pf = this.selectedParamField;
    if (!pf) return;
    const sv = this.paramSourceValue.trim();
    const lb = this.paramLabel.trim();
    if (!sv || !lb) {
      this.paramError = 'Compilare tutti i campi obbligatori.';
      return;
    }
    this.paramIsLoading = true;
    this.paramError = null;
    this.svc.addParamRow(pf.paramTableId, {
      sourceValue: sv,
      label: lb,
      rowKind: 'Indicator',
      isEditable: true,
      isFormula: false,
      isVisible: true,
    }).subscribe({
      next: () => {
        this.paramIsLoading = false;
        this.paramSuccess = true;
        this.paramSourceValue = '';
        this.paramLabel = '';
        setTimeout(() => {
          this.paramSuccess = false;
          this.rowInserted.emit();
        }, 1000);
      },
      error: () => {
        this.paramIsLoading = false;
        this.paramError = 'Errore durante la creazione dell\'indicatore.';
      },
    });
  }

  // ── Tab 2 actions ─────────────────────────────────────────────────────

  saveManualRow(): void {
    // Validate all required fields
    const missing = this.manualDimFields.filter((f) => !this.manualValues[f.fieldName]?.trim());
    if (missing.length > 0) {
      this.manualError = `Campo obbligatorio: ${missing.map((f) => f.label).join(', ')}`;
      return;
    }
    const dimValues: Record<string, string> = {};
    this.manualDimFields.forEach((f) => { dimValues[f.fieldName] = this.manualValues[f.fieldName].trim(); });

    this.manualIsLoading = true;
    this.manualError = null;
    this.svc.insertManualRow(this.reportId, dimValues).subscribe({
      next: () => {
        this.manualIsLoading = false;
        this.manualSuccess = true;
        setTimeout(() => {
          this.manualSuccess = false;
          this.rowInserted.emit();
        }, 1000);
      },
      error: () => {
        this.manualIsLoading = false;
        this.manualError = 'Errore durante l\'inserimento della riga.';
      },
    });
  }
}
