import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EsgConfiguratorService } from '../../../../services/esg-configurator.service';
import {
  ParamRow, UpsertParamRowDto, CustomColumnDef, RowKind,
} from '../../../../models/esg-configurator.models';

@Component({
  selector: 'kpi-param-grid',
  templateUrl: './kpi-param-grid.component.html',
})
export class KpiParamGridComponent implements OnInit, OnChanges {
  @Input() paramTableId!: number;
  @Input() customColumnDefs: CustomColumnDef[] = [];

  rows: ParamRow[] = [];
  isLoading  = false;
  isSaving   = false;
  errorMsg: string | null = null;

  // Add-row form
  showAddForm = false;
  addKind: RowKind = 'Indicator';
  addForm: FormGroup;

  // Edit-row
  editingRow: ParamRow | null = null;
  editForm: FormGroup;

  // Metadata lens
  lensRow: ParamRow | null = null;

  // ── Formula Builder overlay ──────────────────────────────────────────────────
  /** 'add' | 'edit' | null — which form the builder is open for */
  formulaBuilderTarget: 'add' | 'edit' | null = null;

  get availableRefs(): string[] {
    return this.rows.map((r) => r.sourceValue);
  }

  openFormulaBuilder(target: 'add' | 'edit'): void {
    this.formulaBuilderTarget = target;
  }

  onFormulaSaved(formula: string): void {
    if (this.formulaBuilderTarget === 'add') {
      this.addForm.patchValue({ formula, isFormula: true });
    } else if (this.formulaBuilderTarget === 'edit') {
      this.editForm.patchValue({ formula, isFormula: true });
    }
    this.formulaBuilderTarget = null;
  }

  onFormulaCancelled(): void {
    this.formulaBuilderTarget = null;
  }

  constructor(private svc: EsgConfiguratorService, private fb: FormBuilder) {
    this.addForm = this.fb.group({
      sourceValue:      ['', Validators.required],
      label:            ['', Validators.required],
      grouping:         [''],
      formula:          [''],
      compilationGuide: [''],
      isEditable:       [true],
      isFormula:        [false],
      isVisible:        [true],
      parentParamId:    [null],
    });

    this.editForm = this.fb.group({
      label:            ['', Validators.required],
      grouping:         [''],
      formula:          [''],
      compilationGuide: [''],
      isEditable:       [true],
      isFormula:        [false],
      isVisible:        [true],
      parentParamId:    [null],
    });
  }

  ngOnInit(): void { this.loadRows(); }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['paramTableId'] && !ch['paramTableId'].firstChange) { this.loadRows(); }
  }

  loadRows(): void {
    this.isLoading = true;
    this.svc.getParamRows(this.paramTableId).subscribe({
      next:  (r) => { this.rows = r; this.isLoading = false; },
      error: ()  => { this.errorMsg = 'Impossibile caricare le righe.'; this.isLoading = false; },
    });
  }

  // ── Add Row ────────────────────────────────────────────────────────────────

  openAddForm(kind: RowKind): void {
    this.addKind = kind;
    this.addForm.reset({
      sourceValue: '',
      label: '',
      grouping: '',
      formula: '',
      compilationGuide: '',
      isEditable: true,
      isFormula: false,
      isVisible: true,
      parentParamId: null,
    });
    if (kind === 'Aggregate') {
      this.addForm.get('isEditable')?.setValue(false);
    }
    this.showAddForm = true;
    this.editingRow = null;
  }

  submitAddForm(): void {
    if (this.addForm.invalid) { this.addForm.markAllAsTouched(); return; }
    const v = this.addForm.value;
    const dto: UpsertParamRowDto = {
      sourceValue:      this.addKind === 'Aggregate' ? `_AGG_${v.label}` : v.sourceValue,
      label:            v.label,
      rowKind:          this.addKind,
      grouping:         v.grouping || null,
      formula:          v.formula || null,
      compilationGuide: v.compilationGuide || null,
      isEditable:       v.isEditable,
      isFormula:        v.isFormula,
      isVisible:        v.isVisible,
      parentParamId:    v.parentParamId ? Number(v.parentParamId) : null,
      sortOrder:        this.rows.length * 10,
    };
    this.isSaving = true;
    this.svc.addParamRow(this.paramTableId, dto).subscribe({
      next: (row) => {
        this.rows.push(row);
        this.showAddForm = false;
        this.isSaving = false;
      },
      error: () => { this.errorMsg = 'Impossibile aggiungere la riga.'; this.isSaving = false; },
    });
  }

  cancelAddForm(): void { this.showAddForm = false; }

  // ── Edit Row ───────────────────────────────────────────────────────────────

  startEdit(row: ParamRow): void {
    this.editingRow = row;
    this.showAddForm = false;
    this.editForm.patchValue({
      label:            row.label,
      grouping:         row.grouping ?? '',
      formula:          row.formula ?? '',
      compilationGuide: row.compilationGuide ?? '',
      isEditable:       row.isEditable,
      isFormula:        row.isFormula,
      isVisible:        row.isVisible,
      parentParamId:    row.parentParamId,
    });
  }

  cancelEdit(): void { this.editingRow = null; }

  submitEdit(): void {
    if (!this.editingRow || this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }
    const v = this.editForm.value;
    const dto: UpsertParamRowDto = {
      sourceValue:      this.editingRow.sourceValue,
      label:            v.label,
      grouping:         v.grouping || null,
      formula:          v.formula || null,
      compilationGuide: v.compilationGuide || null,
      isEditable:       v.isEditable,
      isFormula:        v.isFormula,
      isVisible:        v.isVisible,
      parentParamId:    v.parentParamId ? Number(v.parentParamId) : null,
    };
    this.isSaving = true;
    this.svc.updateParamRow(this.paramTableId, this.editingRow.paramId, dto).subscribe({
      next: (updated) => {
        const idx = this.rows.findIndex((r) => r.paramId === updated.paramId);
        if (idx >= 0) { this.rows[idx] = updated; }
        this.editingRow = null;
        this.isSaving = false;
      },
      error: () => { this.errorMsg = 'Impossibile aggiornare la riga.'; this.isSaving = false; },
    });
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  deleteRow(row: ParamRow): void {
    if (!confirm(`Eliminare la riga "${row.label}"?`)) return;
    this.svc.deleteParamRow(this.paramTableId, row.paramId).subscribe({
      next: () => {
        this.rows = this.rows.filter((r) => r.paramId !== row.paramId);
        if (this.editingRow?.paramId === row.paramId) { this.editingRow = null; }
      },
      error: () => { this.errorMsg = 'Impossibile eliminare la riga.'; },
    });
  }

  // ── Reorder ────────────────────────────────────────────────────────────────

  moveRow(row: ParamRow, direction: 'up' | 'down'): void {
    this.svc.moveParamRow(this.paramTableId, row.paramId, direction).subscribe({
      next: () => { this.loadRows(); },
      error: () => { this.errorMsg = 'Impossibile riordinare la riga.'; },
    });
  }

  // ── Metadata Lens ──────────────────────────────────────────────────────────

  openLens(row: ParamRow): void  { this.lensRow = row; }
  closeLens(): void              { this.lensRow = null; }

  onLensSaved(updated: ParamRow): void {
    const idx = this.rows.findIndex((r) => r.paramId === updated.paramId);
    if (idx >= 0) { this.rows[idx] = updated; }
    if (this.editingRow?.paramId === updated.paramId) { this.editingRow = updated; }
    this.lensRow = null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  get aggregatoRows(): ParamRow[] { return this.rows.filter((r) => r.rowKind === 'Aggregate'); }

  trackByRow(_: number, r: ParamRow): number { return r.paramId; }
}
