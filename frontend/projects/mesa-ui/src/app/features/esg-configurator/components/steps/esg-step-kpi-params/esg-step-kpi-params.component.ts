import {
  AfterViewChecked, Component, ElementRef, EventEmitter,
  Input, OnInit, Output, QueryList, ViewChildren,
} from '@angular/core';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import {
  CustomColumnDef, DatasetBinding, DbColumnInfo,
  ParamRow, ParamTableInfo, CreateParamTableDto, UpsertParamRowDto,
} from '../../../models/esg-configurator.models';
import { SearchableSelectItem } from '../../shared/cfg-searchable-select/cfg-searchable-select.component';

/** Single row in the inline-editable parameter matrix. */
interface ParamMatrixRow {
  sourceValue:      string;
  paramId:          number | null;
  grouping:         string;
  formula:          string;
  compilationGuide: string;
  customColumns:    Record<string, string>;
  isSaving:         boolean;
}

@Component({
  selector: 'esg-step-kpi-params',
  templateUrl: './esg-step-kpi-params.component.html',
})
export class EsgStepKpiParamsComponent implements OnInit, AfterViewChecked {
  @Input() reportId!: number;
  @Output() back = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  /** All rendered cell <input>s — at most one exists at a time (via *ngIf). */
  @ViewChildren('activeInput') activeInputs!: QueryList<ElementRef<HTMLInputElement>>;

  binding:    DatasetBinding | null = null;
  selectedColumn = '';

  paramTables:      ParamTableInfo[] = [];
  activeParamTable: ParamTableInfo | null = null;

  /** Backend ParamRow[] — source of truth for paramIds and guide HTML. */
  paramRows:  ParamRow[]       = [];
  /** Merged DISTINCT + param-row data displayed in the matrix table. */
  matrixRows: ParamMatrixRow[] = [];
  distinctTotal = 0;

  /** Client-side text filter applied to the Value column of the matrix. */
  matrixFilter = '';

  /** Pagination state — resets to page 1 whenever the filter changes. */
  currentPage = 1;
  readonly pageSize = 100;

  get filteredMatrixRows(): ParamMatrixRow[] {
    const q = this.matrixFilter.trim().toLowerCase();
    if (!q) return this.matrixRows;
    return this.matrixRows.filter((r) => r.sourceValue.toLowerCase().includes(q));
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredMatrixRows.length / this.pageSize));
  }

  get pagedMatrixRows(): ParamMatrixRow[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredMatrixRows.slice(start, start + this.pageSize);
  }

  onMatrixFilterChange(value: string): void {
    this.matrixFilter = value;
    this.currentPage = 1;
  }

  setPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  editingCell:  { rowIdx: number; field: string } | null = null;
  pendingValue  = '';
  lensParamRow: ParamRow | null = null;

  showCustomColumns = false;
  isLoadingBinding  = false;
  isLoadingMatrix   = false;
  isCreating        = false;
  isSeeding         = false;
  needsFocus        = false;

  errorMsg:   string | null = null;
  successMsg: string | null = null;

  /** Searchable select items — all columns from fact + dim tables, grouped by table. */
  columnSelectItems: SearchableSelectItem[] = [];

  /** Optional filter: only show matrix for columns from this table group. */
  filterTable = '';
  /** Available table groups for the filter dropdown. */
  tableGroups: string[] = [];

  // ── Left-panel column list ──────────────────────────────────────────────────
  columnListFilter = '';

  get filteredColumnList(): SearchableSelectItem[] {
    const q = this.columnListFilter.trim().toLowerCase();
    if (!q) return this.columnSelectItems;
    return this.columnSelectItems.filter(i =>
      i.label.toLowerCase().includes(q) || (i.group ?? '').toLowerCase().includes(q)
    );
  }

  get groupedColumns(): { name: string; items: SearchableSelectItem[] }[] {
    const map = new Map<string, SearchableSelectItem[]>();
    for (const item of this.filteredColumnList) {
      const g = item.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }

  hasParamForColumn(colValue: string): boolean {
    const bare = colValue.includes('.') ? colValue.split('.').pop()! : colValue;
    return this.paramTables.some(p => p.columnName === bare);
  }

  get customCols(): CustomColumnDef[] {
    return this.activeParamTable?.customColumnDefs ?? [];
  }

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void {
    this.loadBinding();
    this.loadParamTables();
  }

  ngAfterViewChecked(): void {
    if (this.needsFocus && this.activeInputs?.first) {
      this.activeInputs.first.nativeElement.focus();
      this.needsFocus = false;
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  private loadBinding(): void {
    this.isLoadingBinding = true;
    this.svc.getBinding(this.reportId).subscribe({
      next: (b) => {
        this.binding = b;
        this.isLoadingBinding = false;
        if (b) { this.buildColumnSelectItems(b); }
      },
      error: () => { this.errorMsg = 'Could not load binding.'; this.isLoadingBinding = false; },
    });
  }

  private buildColumnSelectItems(binding: DatasetBinding): void {
    const items: SearchableSelectItem[] = [];
    const groups = new Set<string>();

    // Fact table columns from field mappings
    const factLabel = binding.factTableSmartName || binding.factTable;
    for (const m of (binding.fieldMappings ?? [])) {
      items.push({ value: m.dbField, label: m.businessLabel || m.dbField, group: factLabel });
    }
    if ((binding.fieldMappings ?? []).length > 0) groups.add(factLabel);

    // Fallback: when no field mappings are defined, load raw columns from the fact table
    if ((binding.fieldMappings ?? []).length === 0) {
      const [fSchema, fTable] = this.splitFact(binding.factTable);
      this.svc.getTableColumns(fSchema, fTable).subscribe({
        next: (cols) => {
          for (const c of cols) {
            items.push({ value: c.columnName, label: c.columnName, group: factLabel });
          }
          groups.add(factLabel);
          this.columnSelectItems = [...items];
          this.tableGroups = [...groups];
        },
      });
    }

    // P&C Hierarchy definitions — add at the TOP so they're easy to find.
    // Value uses "schema.table.labelCol" so PARAM SourceValues are readable labels (not opaque keys).
    // The data-entry hierarchy builder falls back to label-col matching when it can't find by childKeyCol.
    const hierGroup = 'Hierarchies (P&C)';
    for (const h of (binding.hierarchyDefs ?? [])) {
      const label = h.smartName || h.childKeyCol;
      items.unshift({ value: `${h.dimTable}.${h.labelCol}`, label: `🌳 ${label}`, group: hierGroup });
    }
    if ((binding.hierarchyDefs ?? []).length > 0) groups.add(hierGroup);

    // Load dim table columns
    for (const j of (binding.joinConfig ?? [])) {
      const dimLabel = j.smartName || j.rightTable;
      const [schema, table] = this.splitFact(j.rightTable);
      this.svc.getTableColumns(schema, table).subscribe({
        next: (cols) => {
          for (const c of cols) {
            items.push({ value: `${j.rightTable}.${c.columnName}`, label: c.columnName, group: dimLabel });
          }
          groups.add(dimLabel);
          this.columnSelectItems = [...items];
          this.tableGroups = [...groups];
        },
      });
    }

    this.columnSelectItems = [...items];
    this.tableGroups = [...groups];
  }

  private loadParamTables(): void {
    this.svc.listParamTables(this.reportId).subscribe({
      next: (t) => {
        this.paramTables = t;
        if (this.selectedColumn) {
          const bareColumn = this.selectedColumn.includes('.')
            ? this.selectedColumn.split('.').pop() ?? this.selectedColumn
            : this.selectedColumn;
          this.activeParamTable = t.find((p) => p.columnName === bareColumn) ?? null;
        }
      },
      error: () => {},
    });
  }

  // ── Dimension progress panel ───────────────────────────────────────────────

  /** Summary of param table status per dimension. */
  get dimensionProgress(): { label: string; column: string; status: 'missing' | 'created' | 'seeded'; rowCount: number }[] {
    if (!this.binding) return [];
    const result = [];
    for (const m of (this.binding.fieldMappings ?? [])) {
      if (m.fieldType === 'dimension') {
        const pt = this.paramTables.find((p) => p.columnName === m.dbField);
        result.push({
          label:    m.businessLabel || m.dbField,
          column:   m.dbField,
          status:   pt ? 'created' as const : 'missing' as const,
          rowCount: 0,
        });
      }
    }
    return result;
  }

  // ── Column selection & matrix ──────────────────────────────────────────────

  onColumnChange(value: string | null): void {
    this.editingCell    = null;
    this.lensParamRow   = null;
    this.matrixFilter   = '';
    this.selectedColumn = value ?? '';
    this.matrixRows     = [];
    this.paramRows      = [];
    this.distinctTotal  = 0;
    // Strip dim-table prefix if it was added (dim columns stored as "schema.table.column")
    const bareColumn = this.selectedColumn.includes('.')
      ? this.selectedColumn.split('.').pop() ?? this.selectedColumn
      : this.selectedColumn;
    this.activeParamTable = this.selectedColumn
      ? (this.paramTables.find((p) => p.columnName === bareColumn) ?? null)
      : null;
    if (this.selectedColumn && this.binding) { this.loadMatrix(); }
  }

  /** Resolve schema, table, and bare column name from selectedColumn.
   *  Fact columns: "ColumnName"  → uses binding.factTable
   *  Dim columns:  "schema.table.column" → uses dim table directly */
  private resolveColumnLocation(): { schema: string; table: string; column: string } {
    const parts = this.selectedColumn.split('.');
    if (parts.length >= 3) {
      // Dim column stored as "schema.table.column"
      return { schema: parts[0], table: parts[1], column: parts[parts.length - 1] };
    }
    const [schema, table] = this.splitFact(this.binding!.factTable);
    return { schema, table, column: parts[parts.length - 1] };
  }

  /** True when the currently selected column is a hierarchy labelCol (e.g. Folder). */
  private isHierarchyLabelColSelected(): boolean {
    if (!this.binding || !this.selectedColumn) return false;
    return (this.binding.hierarchyDefs ?? []).some(
      (h) => this.selectedColumn === `${h.dimTable}.${h.labelCol}`,
    );
  }

  private loadMatrix(): void {
    if (!this.binding || !this.selectedColumn) return;
    const { schema, table, column: bareColumn } = this.resolveColumnLocation();
    this.isLoadingMatrix = true;
    this.errorMsg = null;
    // For hierarchy label columns fetch up to 10 000 distinct labels so that
    // all P&C nodes (leaves + groups) are available in the PARAM grid.
    const valueLimit = this.isHierarchyLabelColSelected() ? 10000 : 500;

    this.svc.getDistinctValues(schema, table, bareColumn, valueLimit).subscribe({
      next: (r) => {
        this.distinctTotal = r.total;
        if (this.activeParamTable) {
          this.svc.getParamRows(this.activeParamTable.paramTableId).subscribe({
            next:  (rows) => { this.paramRows = rows; this.buildMatrix(r.values); this.isLoadingMatrix = false; },
            error: ()     => { this.paramRows = [];   this.buildMatrix(r.values); this.isLoadingMatrix = false; },
          });
        } else {
          this.paramRows = [];
          this.buildMatrix(r.values);
          this.isLoadingMatrix = false;
        }
      },
      error: () => { this.errorMsg = 'Could not load values.'; this.isLoadingMatrix = false; },
    });
  }

  private buildMatrix(distinctVals: string[]): void {
    this.currentPage = 1;
    this.matrixRows = distinctVals.map((v) => {
      const sv = String(v);  // normalise: DB may return numeric types (e.g. INT columns)
      const row = this.paramRows.find((r) => r.sourceValue === sv);
      const custom: Record<string, string> = {};
      if (row?.customColumns) {
        for (const k of Object.keys(row.customColumns)) {
          custom[k] = String(row.customColumns[k] ?? '');
        }
      }
      return {
        sourceValue:      sv,
        paramId:          row?.paramId           ?? null,
        grouping:         row?.grouping          ?? '',
        formula:          row?.formula           ?? '',
        compilationGuide: row?.compilationGuide  ?? '',
        customColumns:    custom,
        isSaving:         false,
      };
    });
  }

  // ── Param table creation ──────────────────────────────────────────────────

  private ensureParamTable(): Promise<ParamTableInfo> {
    if (this.activeParamTable) return Promise.resolve(this.activeParamTable);
    if (!this.binding || !this.selectedColumn) return Promise.reject(new Error('Missing binding'));
    const { schema, table: factTable, column: bareColumn } = this.resolveColumnLocation();
    const dto: CreateParamTableDto = { schema, factTable, column: bareColumn };
    return new Promise((resolve, reject) => {
      this.isCreating = true;
      this.svc.createParamTable(this.reportId, dto).subscribe({
        next: (info) => {
          const idx = this.paramTables.findIndex((p) => p.paramTableId === info.paramTableId);
          if (idx >= 0) { this.paramTables[idx] = info; } else { this.paramTables.push(info); }
          this.activeParamTable = info;
          this.isCreating = false;
          resolve(info);
        },
        error: (err) => { this.isCreating = false; reject(err); },
      });
    });
  }

  seedTable(): void {
    if (!this.activeParamTable) return;
    this.isSeeding  = true;
    this.errorMsg   = null;
    this.successMsg = null;
    this.svc.seedParamTable(this.activeParamTable.paramTableId).subscribe({
      next: (r) => {
        this.isSeeding  = false;
        this.successMsg = `Seed complete: ${r.inserted} rows inserted.`;
        setTimeout(() => { this.successMsg = null; }, 5000);
        this.loadMatrix();
      },
      error: () => { this.errorMsg = 'Could not run seed.'; this.isSeeding = false; },
    });
  }

  onCustomColumnsUpdated(info: ParamTableInfo): void {
    const idx = this.paramTables.findIndex((p) => p.paramTableId === info.paramTableId);
    if (idx >= 0) { this.paramTables[idx] = info; }
    this.activeParamTable = info;
    this.showCustomColumns = false;
    this.buildMatrix(this.matrixRows.map((r) => r.sourceValue));
  }

  // ── Inline cell editing ────────────────────────────────────────────────────

  startEdit(rowIdx: number, field: string): void {
    if (this.isEditing(rowIdx, field)) return;
    if (this.editingCell) { this.commitEdit(); }
    const row = this.matrixRows[rowIdx];
    if (!row) return;
    this.editingCell  = { rowIdx, field };
    this.pendingValue = field === 'grouping' ? row.grouping
                      : field === 'formula'  ? row.formula
                      : String(row.customColumns[field] ?? '');
    this.needsFocus   = true;
  }

  cancelEdit(): void {
    this.editingCell  = null;
    this.pendingValue = '';
  }

  commitEdit(): void {
    if (!this.editingCell) return;
    const { rowIdx, field } = this.editingCell;
    const row = this.matrixRows[rowIdx];
    if (!row) { this.cancelEdit(); return; }

    const newValue     = this.pendingValue;
    const currentValue = field === 'grouping' ? row.grouping
                        : field === 'formula'  ? row.formula
                        : String(row.customColumns[field] ?? '');

    this.editingCell  = null;
    this.pendingValue = '';
    if (newValue === currentValue) return;

    if      (field === 'grouping') { row.grouping = newValue; }
    else if (field === 'formula')  { row.formula  = newValue; }
    else                           { row.customColumns[field] = newValue; }
    row.isSaving = true;

    this.ensureParamTable().then((pt) => {
      this.persistCell(pt, row, rowIdx);
    }).catch(() => {
      this.errorMsg = 'Could not create the PARAM table.';
      row.isSaving  = false;
    });
  }

  private persistCell(pt: ParamTableInfo, row: ParamMatrixRow, rowIdx: number): void {
    const dto: UpsertParamRowDto = {
      sourceValue:      row.sourceValue,
      label:            row.sourceValue,
      grouping:         row.grouping         || null,
      formula:          row.formula          || null,
      compilationGuide: row.compilationGuide || null,
      customColumns:    Object.keys(row.customColumns).length ? row.customColumns : null,
    };

    if (row.paramId === null) {
      this.svc.addParamRow(pt.paramTableId, dto).subscribe({
        next: (saved) => {
          this.matrixRows[rowIdx].paramId = saved.paramId;
          this.paramRows.push(saved);
          row.isSaving = false;
        },
        error: () => { this.errorMsg = 'Could not save cell.'; row.isSaving = false; },
      });
    } else {
      const paramId = row.paramId;
      this.svc.updateParamRow(pt.paramTableId, paramId, dto).subscribe({
        next: (saved) => {
          const idx = this.paramRows.findIndex((r) => r.paramId === saved.paramId);
          if (idx >= 0) { this.paramRows[idx] = saved; }
          row.isSaving = false;
        },
        error: () => { this.errorMsg = 'Could not save cell.'; row.isSaving = false; },
      });
    }
  }

  // ── Lens: compilation guide HTML editor ───────────────────────────────────

  openLens(rowIdx: number): void {
    if (this.editingCell) { this.cancelEdit(); }
    const row = this.matrixRows[rowIdx];
    if (!row) return;

    this.ensureParamTable().then((pt) => {
      if (row.paramId !== null) {
        const pr = this.paramRows.find((r) => r.paramId === row.paramId);
        if (pr) { this.lensParamRow = pr; return; }
      }
      const dto: UpsertParamRowDto = { sourceValue: row.sourceValue, label: row.sourceValue };
      row.isSaving = true;
      this.svc.addParamRow(pt.paramTableId, dto).subscribe({
        next: (saved) => {
          row.paramId  = saved.paramId;
          row.isSaving = false;
          this.paramRows.push(saved);
          this.lensParamRow = saved;
        },
        error: () => { this.errorMsg = 'Could not open guide editor.'; row.isSaving = false; },
      });
    }).catch(() => { this.errorMsg = 'Could not create the PARAM table.'; });
  }

  onLensSaved(updated: ParamRow): void {
    const mRow = this.matrixRows.find((r) => r.paramId === updated.paramId);
    if (mRow) { mRow.compilationGuide = updated.compilationGuide ?? ''; }
    const idx = this.paramRows.findIndex((r) => r.paramId === updated.paramId);
    if (idx >= 0) { this.paramRows[idx] = updated; }
    this.lensParamRow = updated;
  }

  onLensClosed(): void { this.lensParamRow = null; }

  // ── Formula Builder ───────────────────────────────────────────────────────

  formulaBuilderRow: ParamMatrixRow | null = null;

  get availableRefs(): string[] {
    return this.matrixRows.map((r) => r.sourceValue).filter(Boolean);
  }

  openFormulaBuilder(row: ParamMatrixRow): void {
    if (this.editingCell) { this.cancelEdit(); }
    this.formulaBuilderRow = row;
  }

  onFormulaSaved(formula: string): void {
    if (!this.formulaBuilderRow) return;
    this.formulaBuilderRow.formula = formula;
    const row = this.formulaBuilderRow;
    this.formulaBuilderRow = null;
    // Persist immediately via ensureParamTable + update/add
    this.ensureParamTable().then((pt) => {
      const dto: UpsertParamRowDto = {
        sourceValue: row.sourceValue,
        label:       row.sourceValue,
        grouping:    row.grouping || null,
        formula:     formula,
        compilationGuide: row.compilationGuide || null,
        isEditable:  false,
        isFormula:   true,
        isVisible:   true,
        parentParamId: null,
      };
      if (row.paramId !== null) {
        this.svc.updateParamRow(pt.paramTableId, row.paramId, dto).subscribe({
          next: (saved) => {
            row.formula = saved.formula ?? formula;
            const idx = this.paramRows.findIndex((r) => r.paramId === saved.paramId);
            if (idx >= 0) { this.paramRows[idx] = saved; }
          },
          error: () => { this.errorMsg = 'Could not save formula.'; },
        });
      } else {
        this.svc.addParamRow(pt.paramTableId, dto).subscribe({
          next: (saved) => {
            row.paramId = saved.paramId;
            row.formula = saved.formula ?? formula;
            this.paramRows.push(saved);
          },
          error: () => { this.errorMsg = 'Could not save formula.'; },
        });
      }
    }).catch(() => { this.errorMsg = 'Could not create the PARAM table.'; });
  }

  onFormulaCancelled(): void { this.formulaBuilderRow = null; }

  // ── Template helpers ──────────────────────────────────────────────────────

  isEditing(rowIdx: number, field: string): boolean {
    return this.editingCell?.rowIdx === rowIdx && this.editingCell?.field === field;
  }

  hasGuide(row: ParamMatrixRow): boolean { return !!row.compilationGuide?.trim(); }

  /** Returns plain-text preview (max 55 chars) from a HTML string. */
  stripHtml(html: string): string {
    return html ? html.replace(/<[^>]*>/g, '').trim().slice(0, 55) : '';
  }

  private splitFact(fullName: string): [string, string] {
    return fullName.includes('.') ? (fullName.split('.') as [string, string]) : ['dbo', fullName];
  }

  trackByCol(_: number, c: DbColumnInfo): string    { return c.columnName; }
  trackByRow(_: number, r: ParamMatrixRow): string  { return r.sourceValue; }
  trackByDef(_: number, d: CustomColumnDef): string { return d.name; }
}
