/**
 * Step 3 — Report Structure: rows, columns, filters, sections, layout.
 */
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConfiguratorService } from '../../../../services/configurator.service';
import {
  ReportRowDef, UpsertRowDto,
  ReportColumnDef, UpsertColumnDto,
  ReportFilterDef, UpsertFilterDto,
  ReportSectionDef, UpsertSectionDto,
  ReportLayout, UpsertLayoutDto,
} from '../../../../models/configurator.models';

export type StructureTab = 'rows' | 'columns' | 'filters' | 'layout';

@Component({
  selector: 'cfg-step-structure',
  templateUrl: './step-structure.component.html',
})
export class StepStructureComponent implements OnInit {
  @Input() reportId!: number;
  @Output() next = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  activeTab: StructureTab = 'rows';

  rows:    ReportRowDef[]    = [];
  columns: ReportColumnDef[] = [];
  filters: ReportFilterDef[] = [];
  layout:  ReportLayout | null = null;

  isLoading = false;
  isSaving  = false;
  errorMsg:   string | null = null;
  successMsg: string | null = null;

  rowForm:    FormGroup;
  columnForm: FormGroup;
  filterForm: FormGroup;
  layoutForm: FormGroup;

  editingRowId:    number | null = null;
  editingColumnId: number | null = null;
  editingFilterId: number | null = null;

  constructor(private configuratorSvc: ConfiguratorService, private fb: FormBuilder) {
    this.rowForm = this.fb.group({
      rowCode:       ['', [Validators.required, Validators.maxLength(50)]],
      label:         ['', Validators.required],
      unitOfMeasure: [''],
      rowType:       ['Input'],
      indentLevel:   [0, [Validators.min(0), Validators.max(10)]],
      sortOrder:     [0, [Validators.required, Validators.min(0)]],
      isEditable:    [true],
      isVisible:     [true],
    });
    this.columnForm = this.fb.group({
      columnCode:    ['', [Validators.required, Validators.maxLength(50)]],
      label:         ['', Validators.required],
      dimensionName: [''],
      memberKey:     [''],
      isVisible:     [true],
      sortOrder:     [0, [Validators.required, Validators.min(0)]],
    });
    this.filterForm = this.fb.group({
      filterCode:    ['', [Validators.required, Validators.maxLength(50)]],
      label:         ['', Validators.required],
      dimensionName: ['', Validators.required],
      isMultiSelect: [false],
      isMandatory:   [true],
      isVisible:     [true],
      defaultValue:  [''],
      sortOrder:     [0, [Validators.required, Validators.min(0)]],
    });
    this.layoutForm = this.fb.group({
      density:           ['standard'],
      frozenColumnCount: [1, [Validators.required, Validators.min(0)]],
      columnDimension:   ['Process'],
      stickyHeader:      [true],
      hoverHighlight:    [true],
      subtotalHighlight: [true],
      showIndentation:   [true],
      autosaveEnabled:   [false],
      saveOnBlur:        [true],
      allowPivot:        [false],
      pivotConfig:       [''],
    });
  }

  ngOnInit(): void { this.loadAll(); }

  private loadAll(): void {
    this.isLoading = true;
    Promise.all([
      this.configuratorSvc.getRows(this.reportId).toPromise(),
      this.configuratorSvc.getColumns(this.reportId).toPromise(),
      this.configuratorSvc.getFilters(this.reportId).toPromise(),
      this.configuratorSvc.getLayout(this.reportId).toPromise(),
    ]).then(([rows, cols, fltrs, layout]) => {
      this.rows    = rows    ?? [];
      this.columns = cols    ?? [];
      this.filters = fltrs   ?? [];
      this.layout  = layout  ?? null;
      if (layout) {
        const pc = layout.pivotConfig as Record<string, unknown> | null;
        const colDim = (['Process', 'Entity', 'AdjLevel'].includes(pc?.['columnDimension'] as string))
          ? pc!['columnDimension'] as string : 'Process';
        // Rimuove columnDimension dal JSON mostrato nel textarea
        const pcForDisplay = pc ? { ...pc } : null;
        if (pcForDisplay) delete pcForDisplay['columnDimension'];
        this.layoutForm.patchValue({
          density:           layout.density,
          frozenColumnCount: layout.frozenColumnCount,
          columnDimension:   colDim,
          stickyHeader:      layout.stickyHeader,
          hoverHighlight:    layout.hoverHighlight,
          subtotalHighlight: layout.subtotalHighlight,
          showIndentation:   layout.showIndentation,
          autosaveEnabled:   layout.autosaveEnabled,
          saveOnBlur:        layout.saveOnBlur,
          allowPivot:        layout.allowPivot,
          pivotConfig:       pcForDisplay && Object.keys(pcForDisplay).length ? JSON.stringify(pcForDisplay) : '',
        });
      }
      this.isLoading = false;
    }).catch((err) => { this.errorMsg = 'Error loading structure.'; this.isLoading = false; console.error(err); });
  }

  // ── Rows ──────────────────────────────────────────────────────────────────

  editRow(r: ReportRowDef): void {
    this.editingRowId = r.rowId;
    this.rowForm.patchValue({ rowCode: r.rowCode, label: r.label, unitOfMeasure: r.unitOfMeasure ?? '', rowType: r.rowType, indentLevel: r.indentLevel, sortOrder: r.sortOrder, isEditable: r.isEditable, isVisible: r.isVisible });
  }

  saveRow(): void {
    if (this.rowForm.invalid) { this.rowForm.markAllAsTouched(); return; }
    const v = this.rowForm.value;
    const dto: UpsertRowDto = { rowCode: v.rowCode, label: v.label, unitOfMeasure: v.unitOfMeasure || undefined, rowType: v.rowType, indentLevel: v.indentLevel, sortOrder: v.sortOrder, isEditable: v.isEditable, isVisible: v.isVisible };
    this.isSaving = true;
    this.configuratorSvc.upsertRow(this.reportId, this.editingRowId, dto).subscribe({
      next: () => { this.isSaving = false; this.editingRowId = null; this.rowForm.reset({ rowType: 'Input', indentLevel: 0, sortOrder: 0, isEditable: true, isVisible: true }); this.reloadRows(); },
      error: (err) => { this.errorMsg = 'Could not save row.'; this.isSaving = false; console.error(err); },
    });
  }

  deleteRow(rowId: number): void {
    if (!confirm('Delete this row?')) return;
    this.configuratorSvc.deleteRow(this.reportId, rowId).subscribe({ next: () => this.reloadRows(), error: (err) => { this.errorMsg = 'Could not delete row.'; console.error(err); } });
  }

  private reloadRows(): void { this.configuratorSvc.getRows(this.reportId).subscribe(r => this.rows = r); }

  // ── Columns ───────────────────────────────────────────────────────────────

  editColumn(c: ReportColumnDef): void {
    this.editingColumnId = c.columnId;
    this.columnForm.patchValue({ columnCode: c.columnCode, label: c.label, dimensionName: c.dimensionName ?? '', memberKey: c.memberKey ?? '', isVisible: c.isVisible, sortOrder: c.sortOrder });
  }

  saveColumn(): void {
    if (this.columnForm.invalid) { this.columnForm.markAllAsTouched(); return; }
    const v = this.columnForm.value;
    const dto: UpsertColumnDto = { columnCode: v.columnCode, label: v.label, dimensionName: v.dimensionName || undefined, memberKey: v.memberKey || undefined, isVisible: v.isVisible, sortOrder: v.sortOrder };
    this.isSaving = true;
    this.configuratorSvc.upsertColumn(this.reportId, this.editingColumnId, dto).subscribe({
      next: () => { this.isSaving = false; this.editingColumnId = null; this.columnForm.reset({ isVisible: true, sortOrder: 0 }); this.reloadColumns(); },
      error: (err) => { this.errorMsg = 'Could not save column.'; this.isSaving = false; console.error(err); },
    });
  }

  deleteColumn(id: number): void {
    if (!confirm('Delete this column?')) return;
    this.configuratorSvc.deleteColumn(this.reportId, id).subscribe({ next: () => this.reloadColumns(), error: (err) => { this.errorMsg = 'Could not delete column.'; console.error(err); } });
  }

  private reloadColumns(): void { this.configuratorSvc.getColumns(this.reportId).subscribe(c => this.columns = c); }

  // ── Filters ───────────────────────────────────────────────────────────────

  editFilter(f: ReportFilterDef): void {
    this.editingFilterId = f.filterId;
    this.filterForm.patchValue({ filterCode: f.filterCode, label: f.label, dimensionName: f.dimensionName, isMultiSelect: f.isMultiSelect, isMandatory: f.isMandatory, isVisible: f.isVisible, defaultValue: f.defaultValue ?? '', sortOrder: f.sortOrder });
  }

  saveFilter(): void {
    if (this.filterForm.invalid) { this.filterForm.markAllAsTouched(); return; }
    const v = this.filterForm.value;
    const dto: UpsertFilterDto = { filterCode: v.filterCode, label: v.label, dimensionName: v.dimensionName, isMultiSelect: v.isMultiSelect, isMandatory: v.isMandatory, isVisible: v.isVisible, defaultValue: v.defaultValue || undefined, sortOrder: v.sortOrder };
    this.isSaving = true;
    this.configuratorSvc.upsertFilter(this.reportId, this.editingFilterId, dto).subscribe({
      next: () => { this.isSaving = false; this.editingFilterId = null; this.filterForm.reset({ isMultiSelect: false, isMandatory: true, isVisible: true, sortOrder: 0 }); this.reloadFilters(); },
      error: (err) => { this.errorMsg = 'Could not save filter.'; this.isSaving = false; console.error(err); },
    });
  }

  deleteFilter(id: number): void {
    if (!confirm('Delete this filter?')) return;
    this.configuratorSvc.deleteFilter(this.reportId, id).subscribe({ next: () => this.reloadFilters(), error: (err) => { this.errorMsg = 'Could not delete filter.'; console.error(err); } });
  }

  private reloadFilters(): void { this.configuratorSvc.getFilters(this.reportId).subscribe(f => this.filters = f); }

  // ── Layout ────────────────────────────────────────────────────────────────

  saveLayout(): void {
    if (this.layoutForm.invalid) { this.layoutForm.markAllAsTouched(); return; }
    const v = this.layoutForm.value;
    // Merge columnDimension nel pivotConfig JSON
    let pivotBase: Record<string, unknown> = {};
    if (v.pivotConfig) {
      try { pivotBase = JSON.parse(v.pivotConfig); } catch { /* ignora JSON malformato */ }
    }
    const pivotConfig = { ...pivotBase, columnDimension: v.columnDimension ?? 'Process' };
    const dto: UpsertLayoutDto = { density: v.density, frozenColumnCount: v.frozenColumnCount, stickyHeader: v.stickyHeader, hoverHighlight: v.hoverHighlight, subtotalHighlight: v.subtotalHighlight, showIndentation: v.showIndentation, autosaveEnabled: v.autosaveEnabled, saveOnBlur: v.saveOnBlur, allowPivot: v.allowPivot, pivotConfig };
    this.isSaving = true;
    this.configuratorSvc.upsertLayout(this.reportId, dto).subscribe({
      next: (l) => { this.layout = l; this.isSaving = false; this.successMsg = 'Layout saved.'; },
      error: (err) => { this.errorMsg = 'Could not save layout.'; this.isSaving = false; console.error(err); },
    });
  }

  trackById(_: number, item: ReportRowDef | ReportColumnDef | ReportFilterDef | ReportSectionDef): number {
    return (item as ReportRowDef).rowId ?? (item as ReportColumnDef).columnId ?? (item as ReportFilterDef).filterId ?? (item as ReportSectionDef).sectionId;
  }
}
