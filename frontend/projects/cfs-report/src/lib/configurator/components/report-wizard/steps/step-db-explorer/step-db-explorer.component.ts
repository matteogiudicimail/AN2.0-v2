/**
 * Step 2 — DB Explorer: browse tables and bind one to this report.
 * Binding model: factTable + fieldMappings[] + joinConfig[].
 */
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConfiguratorService } from '../../../../services/configurator.service';
import {
  DbTableInfo, DbColumnInfo,
  DatasetBinding, UpsertDatasetBindingDto, FieldMapping, JoinConfig,
} from '../../../../models/configurator.models';

@Component({
  selector: 'cfg-step-db-explorer',
  templateUrl: './step-db-explorer.component.html',
})
export class StepDbExplorerComponent implements OnInit {
  @Input() reportId!: number;
  @Output() next = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  tables:  DbTableInfo[]  = [];
  columns: DbColumnInfo[] = [];
  binding: DatasetBinding | null = null;

  isLoadingTables  = false;
  isLoadingColumns = false;
  isSaving         = false;
  errorMsg:   string | null = null;
  successMsg: string | null = null;

  selectedTable: DbTableInfo | null = null;

  // ── Field Mapping form row ─────────────────────────────────────────────────
  mappingForm: FormGroup;
  fieldMappings: FieldMapping[] = [];
  joinConfigs: JoinConfig[] = [];
  showMappingForm = false;

  factTableForm: FormGroup;

  constructor(
    private configuratorSvc: ConfiguratorService,
    private fb: FormBuilder,
  ) {
    this.factTableForm = this.fb.group({
      factTable: ['', Validators.required],
    });
    this.mappingForm = this.fb.group({
      dbField:       ['', Validators.required],
      businessLabel: ['', Validators.required],
      fieldType:     ['measure', Validators.required],
      role:          ['value'],
      required:      [false],
      editable:      [true],
      visible:       [true],
      notes:         [''],
    });
  }

  ngOnInit(): void {
    this.loadTables();
    this.loadBinding();
  }

  private loadTables(): void {
    this.isLoadingTables = true;
    this.configuratorSvc.listDbTables().subscribe({
      next:  (t) => { this.tables = t; this.isLoadingTables = false; },
      error: (err) => { this.errorMsg = 'Could not load tables.'; this.isLoadingTables = false; console.error(err); },
    });
  }

  private loadBinding(): void {
    this.configuratorSvc.getBinding(this.reportId).subscribe({
      next: (b) => {
        this.binding = b;
        if (b) {
          this.factTableForm.patchValue({ factTable: b.factTable });
          this.fieldMappings = [...b.fieldMappings];
          this.joinConfigs   = [...b.joinConfig];
          // Pre-select the table in the browser
          const [schema, table] = b.factTable.includes('.') ? b.factTable.split('.') : ['dbo', b.factTable];
          this.loadColumnsFor(schema, table);
        }
      },
      error: () => {},
    });
  }

  selectTable(t: DbTableInfo): void {
    this.selectedTable = t;
    const fullName = `${t.schemaName}.${t.tableName}`;
    this.factTableForm.patchValue({ factTable: fullName });
    this.loadColumnsFor(t.schemaName, t.tableName);
  }

  private loadColumnsFor(schema: string, table: string): void {
    this.isLoadingColumns = true;
    this.columns = [];
    this.configuratorSvc.getTableColumns(schema, table).subscribe({
      next:  (c) => { this.columns = c; this.isLoadingColumns = false; },
      error: (err) => { this.errorMsg = 'Could not load columns.'; this.isLoadingColumns = false; console.error(err); },
    });
  }

  addMapping(): void {
    if (this.mappingForm.invalid) { this.mappingForm.markAllAsTouched(); return; }
    const v = this.mappingForm.value;
    this.fieldMappings.push({
      dbField:       v.dbField,
      businessLabel: v.businessLabel,
      fieldType:     v.fieldType,
      role:          v.role || 'value',
      required:      v.required,
      editable:      v.editable,
      visible:       v.visible,
      notes:         v.notes || undefined,
    });
    this.mappingForm.reset({ fieldType: 'measure', role: 'value', required: false, editable: true, visible: true });
    this.showMappingForm = false;
  }

  removeMapping(i: number): void { this.fieldMappings.splice(i, 1); }

  selectColumnForMapping(col: DbColumnInfo): void {
    this.mappingForm.patchValue({ dbField: col.columnName, businessLabel: col.columnName });
    this.showMappingForm = true;
  }

  saveBinding(): void {
    if (this.factTableForm.invalid) { this.factTableForm.markAllAsTouched(); return; }
    this.isSaving   = true;
    this.errorMsg   = null;
    this.successMsg = null;

    const dto: UpsertDatasetBindingDto = {
      factTable:     this.factTableForm.value.factTable,
      fieldMappings: this.fieldMappings,
      joinConfig:    this.joinConfigs,
    };

    this.configuratorSvc.upsertBinding(this.reportId, dto).subscribe({
      next: (b) => { this.binding = b; this.isSaving = false; this.successMsg = 'Binding saved.'; },
      error: (err) => { this.errorMsg = 'Could not save binding.'; this.isSaving = false; console.error(err); },
    });
  }

  trackByTable(_: number, t: DbTableInfo): string { return `${t.schemaName}.${t.tableName}`; }
  trackByCol(_: number, c: DbColumnInfo): string   { return c.columnName; }
  trackByIdx(i: number): number                    { return i; }
}
