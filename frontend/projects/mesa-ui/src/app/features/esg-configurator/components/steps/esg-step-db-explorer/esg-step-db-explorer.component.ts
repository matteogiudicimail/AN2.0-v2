import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import {
  DbTableInfo, DbColumnInfo,
  DatasetBinding, UpsertDatasetBindingDto, FieldMapping, JoinConfig, HierarchyDef,
  TaskSummary,
} from '../../../models/esg-configurator.models';
import { SearchableSelectItem } from '../../shared/cfg-searchable-select/cfg-searchable-select.component';

@Component({
  selector: 'esg-step-db-explorer',
  templateUrl: './esg-step-db-explorer.component.html',
})
export class EsgStepDbExplorerComponent implements OnInit {
  @Input() reportId!: number;
  @Output() back = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  // ── State ───────────────────────────────────────────────────────────────────
  tables:  DbTableInfo[]  = [];
  columns: DbColumnInfo[] = [];
  binding: DatasetBinding | null = null;

  isLoadingTables  = false;
  isLoadingColumns = false;
  isSaving         = false;
  errorMsg:   string | null = null;
  successMsg: string | null = null;

  // ── Fact table ──────────────────────────────────────────────────────────────
  selectedFactTable: string | null = null;
  factTableSmartName = '';

  // ── Field Mappings ──────────────────────────────────────────────────────────
  fieldMappings:   FieldMapping[] = [];
  showMappingForm  = false;
  editingMappingIdx: number | null = null;
  mappingForm: FormGroup;

  // ── Join Config ─────────────────────────────────────────────────────────────
  joinConfig:          JoinConfig[]   = [];
  showJoinForm         = false;
  editingJoinIdx:      number | null  = null;
  joinForm:            FormGroup;
  dimColumns:          DbColumnInfo[] = [];
  isLoadingDimColumns  = false;

  // ── Hierarchy Defs ──────────────────────────────────────────────────────────
  hierarchyDefs:       HierarchyDef[] = [];
  showHierarchyForm    = false;
  editingHierarchyIdx: number | null  = null;
  hierarchyForm:       FormGroup;
  hierDimColumns:      DbColumnInfo[] = [];
  isLoadingHierCols    = false;

  // ── Searchable select items ─────────────────────────────────────────────────
  tableSelectItems:    SearchableSelectItem[] = [];
  colSelectItems:      SearchableSelectItem[] = [];   // fact table columns
  dimColSelectItems:   SearchableSelectItem[] = [];   // join dim table columns
  hierColSelectItems:  SearchableSelectItem[] = [];   // hierarchy dim columns

  // ── Master Data modal ───────────────────────────────────────────────────────
  /** The rightTable (schema.table) whose master data modal is open, or null. */
  masterDataModalTable: string | null = null;

  openMasterData(rightTable: string): void  { this.masterDataModalTable = rightTable; }
  closeMasterData(): void                   { this.masterDataModalTable = null; }

  // ── Report Pubblicati drawer ─────────────────────────────────────────────────
  drawerOpen        = false;
  tasks:            TaskSummary[] = [];
  tasksLoading      = false;
  tasksError:       string | null = null;

  /** null = closed, undefined = new task, TaskSummary = edit */
  dialogTask: TaskSummary | null | undefined = null;
  get dialogOpen(): boolean { return this.dialogTask !== null; }

  openDrawer(): void {
    this.drawerOpen = true;
    this.loadTasks();
  }

  closeDrawer(): void { this.drawerOpen = false; }

  private loadTasks(): void {
    this.tasksLoading = true;
    this.tasksError   = null;
    this.svc.listTasks(this.reportId).subscribe({
      next:  (list) => { this.tasks = list; this.tasksLoading = false; },
      error: ()     => { this.tasksError = 'Impossibile caricare i report pubblicati.'; this.tasksLoading = false; },
    });
  }

  openNewTask(): void     { this.dialogTask = undefined; }
  openEditTask(t: TaskSummary): void { this.dialogTask = t; }
  closeDialog(): void     { this.dialogTask = null; }

  onDialogSaved(saved: TaskSummary): void {
    this.closeDialog();
    this.loadTasks();
  }

  trackByTask(_: number, t: TaskSummary): number { return t.taskId; }

  constructor(
    private svc: EsgConfiguratorService,
    private fb: FormBuilder,
  ) {
    this.mappingForm = this.fb.group({
      dbField:       ['', Validators.required],
      businessLabel: ['', Validators.required],
      fieldType:     ['measure', Validators.required],
      editable:      [true],
    });
    this.joinForm = this.fb.group({
      rightTable: ['', Validators.required],
      leftKey:    ['', Validators.required],
      rightKey:   ['', Validators.required],
      joinType:   ['LEFT', Validators.required],
      smartName:  [''],
    });
    this.hierarchyForm = this.fb.group({
      dimTable:    ['', Validators.required],
      childKeyCol: ['', Validators.required],
      parentKeyCol:['', Validators.required],
      labelCol:    ['', Validators.required],
      orderCol:    [''],
      smartName:   [''],
    });
  }

  ngOnInit(): void {
    this.isLoadingTables = true;
    forkJoin({
      tables:  this.svc.listDbTables(),
      binding: this.svc.getBinding(this.reportId),
      hierDefs: this.svc.listHierarchyDefs(this.reportId),
    }).subscribe({
      next: ({ tables, binding, hierDefs }) => {
        this.tables           = tables;
        this.tableSelectItems = this.buildTableSelectItems(tables);
        this.isLoadingTables  = false;
        this.hierarchyDefs    = hierDefs ?? [];

        if (binding) {
          this.binding            = binding;
          this.selectedFactTable  = binding.factTable;
          this.factTableSmartName = binding.factTableSmartName ?? '';
          this.fieldMappings      = [...binding.fieldMappings];
          this.joinConfig         = [...(binding.joinConfig ?? [])];
          const [schema, table]   = this.splitFqn(binding.factTable);
          this.loadColumnsFor(schema, table);
        }
      },
      error: () => { this.errorMsg = 'Impossibile caricare le tabelle.'; this.isLoadingTables = false; },
    });
  }

  // ── Fields Pane ─────────────────────────────────────────────────────────────

  columnSearchText = '';

  get filteredColumns(): DbColumnInfo[] {
    const q = this.columnSearchText.trim().toLowerCase();
    if (!q) return this.columns;
    return this.columns.filter(c => c.columnName.toLowerCase().includes(q));
  }

  getTypeIcon(dataType: string): string {
    const t = (dataType ?? '').toLowerCase();
    if (/int|decimal|float|real|numeric|money|smallmoney|double/.test(t)) return 'Σ';
    if (/date|time/.test(t)) return '📅';
    if (/bit|bool/.test(t)) return '◉';
    return 'Abc';
  }

  isMapped(columnName: string): boolean {
    return this.fieldMappings.some(m => m.dbField === columnName);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private splitFqn(fqn: string): [string, string] {
    return fqn.includes('.') ? (fqn.split('.') as [string, string]) : ['dbo', fqn];
  }

  private buildTableSelectItems(tables: DbTableInfo[]): SearchableSelectItem[] {
    return tables.map(t => ({
      value: `${t.schemaName}.${t.tableName}`,
      label: t.tableName,
      group: t.schemaName,
      badge: t.tableType === 'VIEW' ? 'VIEW' : undefined,
    }));
  }

  private buildColSelectItems(cols: DbColumnInfo[]): SearchableSelectItem[] {
    return cols.map(c => ({
      value: c.columnName,
      label: c.columnName + (c.isPrimaryKey ? ' ★' : ''),
    }));
  }

  displayFqn(fqn: string | null): string {
    if (!fqn) return '';
    const found = this.tables.find(t => `${t.schemaName}.${t.tableName}` === fqn);
    return found ? `${found.schemaName}.${found.tableName}` : fqn;
  }

  dimTableItems(): SearchableSelectItem[] {
    // Only tables that have a JOIN configured
    return this.joinConfig.map(j => ({
      value: j.rightTable,
      label: j.smartName || j.rightTable,
    }));
  }

  // ── Fact table selection ─────────────────────────────────────────────────────

  onFactTableSelect(fqn: string | null): void {
    this.selectedFactTable = fqn;
    this.columns           = [];
    this.colSelectItems    = [];
    if (!fqn) return;
    const [schema, table] = this.splitFqn(fqn);
    this.loadColumnsFor(schema, table);
  }

  private loadColumnsFor(schema: string, table: string): void {
    this.isLoadingColumns = true;
    this.svc.getTableColumns(schema, table).subscribe({
      next: (c) => {
        this.columns        = c;
        this.colSelectItems = this.buildColSelectItems(c);
        this.isLoadingColumns = false;
      },
      error: () => { this.errorMsg = 'Impossibile caricare le colonne.'; this.isLoadingColumns = false; },
    });
  }

  // ── Field Mappings ──────────────────────────────────────────────────────────

  startAddMapping(): void {
    this.editingMappingIdx = null;
    this.mappingForm.reset({ fieldType: 'measure', editable: true });
    this.showMappingForm = true;
  }

  selectColumnForMapping(col: DbColumnInfo): void {
    this.editingMappingIdx = null;
    this.mappingForm.reset({
      dbField:       col.columnName,
      businessLabel: col.columnName,
      fieldType:     'measure',
      editable:      true,
    });
    this.showMappingForm = true;
  }

  editMapping(i: number): void {
    const m = this.fieldMappings[i];
    this.editingMappingIdx = i;
    this.mappingForm.patchValue({
      dbField:       m.dbField,
      businessLabel: m.businessLabel,
      fieldType:     m.fieldType,
      editable:      m.editable,
    });
    this.showMappingForm = true;
  }

  submitMapping(): void {
    if (this.mappingForm.invalid) { this.mappingForm.markAllAsTouched(); return; }
    const v = this.mappingForm.value;
    const mapping: FieldMapping = {
      dbField:       v.dbField,
      businessLabel: v.businessLabel,
      fieldType:     v.fieldType,
      editable:      v.editable,
    };
    if (this.editingMappingIdx !== null) {
      this.fieldMappings[this.editingMappingIdx] = mapping;
    } else {
      this.fieldMappings.push(mapping);
    }
    this.cancelMappingForm();
  }

  cancelMappingForm(): void {
    this.showMappingForm   = false;
    this.editingMappingIdx = null;
    this.mappingForm.reset({ fieldType: 'measure', editable: true });
  }

  removeMapping(i: number): void { this.fieldMappings.splice(i, 1); }

  // ── Join Config ─────────────────────────────────────────────────────────────

  onJoinDimTableSelect(fqn: string | null): void {
    this.dimColumns      = [];
    this.dimColSelectItems = [];
    this.joinForm.patchValue({ rightKey: '' });
    if (!fqn) return;
    const [schema, table] = this.splitFqn(fqn);
    this.isLoadingDimColumns = true;
    this.svc.getTableColumns(schema, table).subscribe({
      next: (c) => {
        this.dimColumns       = c;
        this.dimColSelectItems = this.buildColSelectItems(c);
        this.isLoadingDimColumns = false;
      },
      error: () => { this.errorMsg = 'Impossibile caricare le colonne della tabella dimensione.'; this.isLoadingDimColumns = false; },
    });
  }

  startAddJoin(): void {
    this.editingJoinIdx = null;
    this.dimColumns     = [];
    this.dimColSelectItems = [];
    this.joinForm.reset({ joinType: 'LEFT' });
    this.showJoinForm = true;
  }

  cancelJoinForm(): void {
    this.showJoinForm  = false;
    this.editingJoinIdx = null;
    this.dimColumns    = [];
    this.dimColSelectItems = [];
    this.joinForm.reset({ joinType: 'LEFT' });
  }

  submitJoin(): void {
    if (this.joinForm.invalid || !this.selectedFactTable) {
      this.joinForm.markAllAsTouched();
      return;
    }
    const v = this.joinForm.value;
    const join: JoinConfig = {
      leftTable:  this.selectedFactTable!,
      rightTable: v.rightTable,
      leftKey:    v.leftKey,
      rightKey:   v.rightKey,
      joinType:   v.joinType,
      smartName:  v.smartName?.trim() || undefined,
    };
    if (this.editingJoinIdx !== null) {
      this.joinConfig[this.editingJoinIdx] = join;
    } else {
      this.joinConfig.push(join);
    }
    this.cancelJoinForm();
  }

  editJoin(i: number): void {
    const j = this.joinConfig[i];
    this.editingJoinIdx = i;
    // Do NOT splice here — keep the join in the array so Cancel doesn't lose it.
    // submitJoin() will overwrite at editingJoinIdx on confirm.
    const [schema, tbl] = this.splitFqn(j.rightTable);
    this.showJoinForm = true;
    this.isLoadingDimColumns = true;
    this.dimColumns = [];
    this.svc.getTableColumns(schema, tbl).subscribe({
      next: (c) => {
        this.dimColumns        = c;
        this.dimColSelectItems = this.buildColSelectItems(c);
        this.isLoadingDimColumns = false;
        this.joinForm.patchValue({
          rightTable: j.rightTable,
          leftKey:    j.leftKey,
          rightKey:   j.rightKey,
          joinType:   j.joinType,
          smartName:  j.smartName ?? '',
        });
      },
      error: () => { this.errorMsg = 'Impossibile caricare le colonne dimensione.'; this.isLoadingDimColumns = false; },
    });
  }

  removeJoin(i: number): void {
    const removed = this.joinConfig[i].rightTable;
    this.joinConfig.splice(i, 1);
    // Remove any hierarchy defs that referenced this table
    this.hierarchyDefs = this.hierarchyDefs.filter(h => h.dimTable !== removed);
  }

  // ── Hierarchy Defs ──────────────────────────────────────────────────────────

  onHierDimTableSelect(fqn: string | null): void {
    this.hierDimColumns  = [];
    this.hierColSelectItems = [];
    this.hierarchyForm.patchValue({ childKeyCol: '', parentKeyCol: '', labelCol: '', orderCol: '' });
    if (!fqn) return;
    const [schema, table] = this.splitFqn(fqn);
    this.isLoadingHierCols = true;
    this.svc.getTableColumns(schema, table).subscribe({
      next: (c) => {
        this.hierDimColumns    = c;
        this.hierColSelectItems = this.buildColSelectItems(c);
        this.isLoadingHierCols = false;
      },
      error: () => { this.errorMsg = 'Impossibile caricare le colonne della tabella gerarchia.'; this.isLoadingHierCols = false; },
    });
  }

  startAddHierarchy(): void {
    this.editingHierarchyIdx = null;
    this.hierDimColumns = [];
    this.hierColSelectItems = [];
    this.hierarchyForm.reset();
    this.showHierarchyForm = true;
  }

  editHierarchy(i: number): void {
    const h = this.hierarchyDefs[i];
    this.editingHierarchyIdx = i;
    this.showHierarchyForm = true;
    // Load columns for the selected dim table
    const [schema, table] = this.splitFqn(h.dimTable);
    this.isLoadingHierCols = true;
    this.svc.getTableColumns(schema, table).subscribe({
      next: (c) => {
        this.hierDimColumns    = c;
        this.hierColSelectItems = this.buildColSelectItems(c);
        this.isLoadingHierCols = false;
        this.hierarchyForm.patchValue({
          dimTable:    h.dimTable,
          childKeyCol: h.childKeyCol,
          parentKeyCol: h.parentKeyCol,
          labelCol:    h.labelCol,
          orderCol:    h.orderCol ?? '',
          smartName:   h.smartName ?? '',
        });
      },
      error: () => { this.errorMsg = 'Impossibile caricare le colonne gerarchia dimensione.'; this.isLoadingHierCols = false; },
    });
  }

  cancelHierarchyForm(): void {
    this.showHierarchyForm    = false;
    this.editingHierarchyIdx  = null;
    this.hierDimColumns       = [];
    this.hierColSelectItems   = [];
    this.hierarchyForm.reset();
  }

  submitHierarchy(): void {
    if (this.hierarchyForm.invalid) { this.hierarchyForm.markAllAsTouched(); return; }
    const v = this.hierarchyForm.value;
    const def: HierarchyDef = {
      hierarchyDefId: this.editingHierarchyIdx !== null
        ? this.hierarchyDefs[this.editingHierarchyIdx]?.hierarchyDefId
        : undefined,
      dimTable:    v.dimTable,
      childKeyCol: v.childKeyCol,
      parentKeyCol: v.parentKeyCol,
      labelCol:    v.labelCol,
      orderCol:    v.orderCol?.trim() || null,
      smartName:   v.smartName?.trim() || null,
    };
    // Save to backend (fire & forget local update first)
    if (this.editingHierarchyIdx !== null) {
      this.hierarchyDefs[this.editingHierarchyIdx] = def;
    } else {
      this.hierarchyDefs.push(def);
    }
    // Persist
    this.svc.saveHierarchyDef(this.reportId, def).subscribe({
      next: (saved) => {
        const idx = this.hierarchyDefs.indexOf(def);
        if (idx >= 0) this.hierarchyDefs[idx] = saved;
      },
      error: () => { this.errorMsg = 'Impossibile salvare la definizione della gerarchia.'; },
    });
    this.cancelHierarchyForm();
  }

  removeHierarchy(i: number): void {
    const def = this.hierarchyDefs[i];
    if (def.hierarchyDefId) {
      this.svc.deleteHierarchyDef(def.hierarchyDefId).subscribe({
        error: () => { this.errorMsg = 'Impossibile eliminare la definizione della gerarchia.'; },
      });
    }
    this.hierarchyDefs.splice(i, 1);
  }

  // ── Save Binding ─────────────────────────────────────────────────────────────

  saveBinding(): void {
    if (!this.selectedFactTable) { this.errorMsg = 'Please select a fact table first.'; return; }
    this.isSaving   = true;
    this.errorMsg   = null;
    this.successMsg = null;

    const dto: UpsertDatasetBindingDto = {
      factTable:           this.selectedFactTable!,
      factTableSmartName:  this.factTableSmartName.trim() || undefined,
      fieldMappings:       this.fieldMappings,
      joinConfig:          this.joinConfig,
    };

    this.svc.upsertBinding(this.reportId, dto).subscribe({
      next:  (b) => { this.binding = b; this.isSaving = false; this.successMsg = 'Binding del Data Model salvato.'; },
      error: ()  => { this.errorMsg = 'Impossibile salvare il binding.'; this.isSaving = false; },
    });
  }

  // ── Helpers for searchable select value binding ──────────────────────────────

  getJoinRightTable(i: number): string { return this.joinConfig[i]?.rightTable ?? ''; }
  getHierDimTable(): string { return this.hierarchyForm.get('dimTable')?.value ?? ''; }
  getHierChildKey(): string { return this.hierarchyForm.get('childKeyCol')?.value ?? ''; }
  getHierParentKey(): string { return this.hierarchyForm.get('parentKeyCol')?.value ?? ''; }
  getHierLabelCol(): string { return this.hierarchyForm.get('labelCol')?.value ?? ''; }
  getHierOrderCol(): string { return this.hierarchyForm.get('orderCol')?.value ?? ''; }

  setJoinRightTable(val: string | null): void {
    this.joinForm.patchValue({ rightTable: val ?? '' });
    this.onJoinDimTableSelect(val);
  }
  setJoinLeftKey(val: string | null): void  { this.joinForm.patchValue({ leftKey: val ?? '' }); }
  setJoinRightKey(val: string | null): void { this.joinForm.patchValue({ rightKey: val ?? '' }); }

  setHierDimTable(val: string | null): void    { this.hierarchyForm.patchValue({ dimTable: val ?? '' }); this.onHierDimTableSelect(val); }
  setHierChildKey(val: string | null): void    { this.hierarchyForm.patchValue({ childKeyCol: val ?? '' }); }
  setHierParentKey(val: string | null): void   { this.hierarchyForm.patchValue({ parentKeyCol: val ?? '' }); }
  setHierLabelCol(val: string | null): void    { this.hierarchyForm.patchValue({ labelCol: val ?? '' }); }
  setHierOrderCol(val: string | null): void    { this.hierarchyForm.patchValue({ orderCol: val ?? '' }); }

  trackByIdx(i: number): number { return i; }
  trackByCol(_: number, c: DbColumnInfo): string { return c.columnName; }
}
