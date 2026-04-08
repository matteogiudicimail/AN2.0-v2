/**
 * MasterDataManagerComponent — CRUD UI for registered dimension/lookup tables.
 *
 * Left panel: list of registered master-data tables + register form.
 * Right panel: inline-editable rows for the selected table.
 *
 * Security: all writes go through the backend which enforces registry-as-whitelist
 * (only tables registered in cfg_MasterDataTable can be accessed).
 *
 * WCAG: form fields labelled; confirmation dialogs use role="alertdialog".
 */

import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import {
  MasterDataTableDef, MasterDataRow, RegisterMasterDataDto, UpsertMasterDataRowDto,
} from '../../../models/esg-configurator.models';

interface EditingRow {
  pkValue:  string;
  values:   Record<string, string | null>;
  isNew:    boolean;
}

@Component({
  selector: 'esg-master-data-manager',
  templateUrl: './master-data-manager.component.html',
})
export class MasterDataManagerComponent implements OnInit, OnChanges {
  @Input() reportId!: number;
  /** When set, auto-select the table matching "schema.tableName" after load. */
  @Input() preSelectTable?: string;

  // ── Table list ───────────────────────────────────────────────────────────────
  tables:        MasterDataTableDef[] = [];
  tablesLoading  = false;
  tablesError:   string | null = null;
  selectedTable: MasterDataTableDef | null = null;

  // ── Row grid ──────────────────────────────────────────────────────────────────
  rows:        MasterDataRow[] = [];
  rowsLoading  = false;
  rowsError:   string | null = null;
  editingRow:  EditingRow | null = null;
  savingRow    = false;
  saveRowError: string | null = null;

  // ── Row sort / filter ─────────────────────────────────────────────────────────
  rowSearch   = '';
  rowSortCol  = '';
  rowSortDir: 'asc' | 'desc' = 'asc';

  // ── Delete confirmation ──────────────────────────────────────────────────────
  deleteConfirmPk: string | null = null;
  deleting         = false;

  // ── Register form ─────────────────────────────────────────────────────────────
  showRegisterForm  = false;
  registerLoading   = false;
  registerError:    string | null = null;
  registerDto: RegisterMasterDataDto = {
    schemaName: '', tableName: '', label: '', primaryKeyCol: '', editableCols: [],
  };
  editableColsInput = '';   // comma-separated string for the form input

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void { this.loadTables(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reportId'] && !changes['reportId'].firstChange) {
      this.selectedTable = null;
      this.rows          = [];
      this.loadTables();
    }
  }

  // ── Tables ────────────────────────────────────────────────────────────────────

  loadTables(): void {
    this.tablesLoading = true;
    this.tablesError   = null;
    this.svc.listMasterDataTables(this.reportId).subscribe({
      next: (t) => {
        this.tables = t;
        this.tablesLoading = false;
        // Auto-select if preSelectTable was provided (e.g. opened from a JOIN row)
        if (this.preSelectTable) {
          const target = this.preSelectTable.toLowerCase();
          const match = t.find((td) =>
            `${td.schemaName}.${td.tableName}`.toLowerCase() === target ||
            td.tableName.toLowerCase() === target.split('.').pop(),
          );
          if (match) this.selectTable(match);
        }
      },
      error: () => { this.tablesError = 'Unable to load master data tables.'; this.tablesLoading = false; },
    });
  }

  selectTable(table: MasterDataTableDef): void {
    this.selectedTable = table;
    this.editingRow    = null;
    this.saveRowError  = null;
    this.deleteConfirmPk = null;
    this.rowSearch     = '';
    this.rowSortCol    = '';
    this.rowSortDir    = 'asc';
    this.loadRows();
  }

  // ── Rows ──────────────────────────────────────────────────────────────────────

  loadRows(): void {
    if (!this.selectedTable) return;
    this.rowsLoading = true;
    this.rowsError   = null;
    this.svc.getMasterDataRows(this.reportId, this.selectedTable.masterDataId).subscribe({
      next:  (r) => { this.rows = r; this.rowsLoading = false; },
      error: ()  => { this.rowsError = 'Unable to load rows.'; this.rowsLoading = false; },
    });
  }

  get columnDefs(): string[] {
    if (!this.selectedTable) return [];
    const { primaryKeyCol, editableCols } = this.selectedTable;
    return [primaryKeyCol, ...editableCols.filter((c) => c !== primaryKeyCol)];
  }

  get filteredRows(): MasterDataRow[] {
    const q = this.rowSearch.toLowerCase().trim();
    let result = q
      ? this.rows.filter((r) =>
          Object.values(r.columns).some((v) => String(v ?? '').toLowerCase().includes(q)))
      : [...this.rows];

    if (this.rowSortCol) {
      result.sort((a, b) => {
        const va = String(a.columns[this.rowSortCol] ?? '');
        const vb = String(b.columns[this.rowSortCol] ?? '');
        if (va < vb) return this.rowSortDir === 'asc' ? -1 : 1;
        if (va > vb) return this.rowSortDir === 'asc' ?  1 : -1;
        return 0;
      });
    }
    return result;
  }

  sortRows(col: string): void {
    if (this.rowSortCol === col) {
      this.rowSortDir = this.rowSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.rowSortCol = col;
      this.rowSortDir = 'asc';
    }
  }

  rowSortIcon(col: string): string {
    if (this.rowSortCol !== col) return '⇅';
    return this.rowSortDir === 'asc' ? '↑' : '↓';
  }

  // ── Edit row ──────────────────────────────────────────────────────────────────

  startEditRow(row: MasterDataRow): void {
    this.editingRow = {
      pkValue: row.pkValue,
      values:  { ...row.columns },
      isNew:   false,
    };
    this.saveRowError = null;
  }

  startNewRow(): void {
    if (!this.selectedTable) return;
    const values: Record<string, string | null> = {};
    this.columnDefs.forEach((c) => values[c] = null);
    this.editingRow  = { pkValue: '', values, isNew: true };
    this.saveRowError = null;
  }

  cancelEdit(): void { this.editingRow = null; this.saveRowError = null; }

  saveRow(): void {
    if (!this.editingRow || !this.selectedTable) return;
    this.savingRow    = true;
    this.saveRowError = null;
    const dto: UpsertMasterDataRowDto = { values: { ...this.editingRow.values } };

    if (this.editingRow.isNew) {
      this.svc.insertMasterDataRow(this.reportId, this.selectedTable.masterDataId, dto).subscribe({
        next:  () => { this.savingRow = false; this.editingRow = null; this.loadRows(); },
        error: () => { this.savingRow = false; this.saveRowError = 'Failed to insert row.'; },
      });
    } else {
      this.svc.updateMasterDataRow(this.reportId, this.selectedTable.masterDataId, this.editingRow.pkValue, dto).subscribe({
        next:  () => { this.savingRow = false; this.editingRow = null; this.loadRows(); },
        error: () => { this.savingRow = false; this.saveRowError = 'Failed to update row.'; },
      });
    }
  }

  // ── Delete row ────────────────────────────────────────────────────────────────

  requestDeleteRow(pkValue: string): void {
    this.deleteConfirmPk = pkValue;
  }

  cancelDelete(): void { this.deleteConfirmPk = null; }

  confirmDeleteRow(): void {
    if (!this.deleteConfirmPk || !this.selectedTable) return;
    this.deleting = true;
    this.svc.deleteMasterDataRow(this.reportId, this.selectedTable.masterDataId, this.deleteConfirmPk).subscribe({
      next:  () => { this.deleting = false; this.deleteConfirmPk = null; this.loadRows(); },
      error: () => { this.deleting = false; this.rowsError = 'Failed to delete row.'; this.deleteConfirmPk = null; },
    });
  }

  // ── Register table ────────────────────────────────────────────────────────────

  openRegisterForm(): void {
    this.showRegisterForm = true;
    this.registerError    = null;
    this.registerDto      = { schemaName: 'dbo', tableName: '', label: '', primaryKeyCol: '', editableCols: [] };
    this.editableColsInput = '';
  }

  cancelRegister(): void { this.showRegisterForm = false; this.registerError = null; }

  submitRegister(): void {
    this.registerError  = null;
    this.registerDto.editableCols = this.editableColsInput
      .split(',').map((s) => s.trim()).filter(Boolean);

    if (!this.registerDto.schemaName || !this.registerDto.tableName ||
        !this.registerDto.label || !this.registerDto.primaryKeyCol) {
      this.registerError = 'All fields are required.';
      return;
    }

    this.registerLoading = true;
    this.svc.registerMasterDataTable(this.reportId, this.registerDto).subscribe({
      next: () => {
        this.registerLoading  = false;
        this.showRegisterForm = false;
        this.loadTables();
      },
      error: () => {
        this.registerLoading = false;
        this.registerError   = 'Failed to register table. Check that the table and columns exist.';
      },
    });
  }

  // ── Unregister table ──────────────────────────────────────────────────────────

  unregisterTable(table: MasterDataTableDef): void {
    if (!confirm(`Unregister "${table.label}"? The actual database table is not affected.`)) return;
    this.svc.unregisterMasterDataTable(this.reportId, table.masterDataId).subscribe({
      next: () => {
        if (this.selectedTable?.masterDataId === table.masterDataId) {
          this.selectedTable = null;
          this.rows          = [];
        }
        this.loadTables();
      },
      error: (err: HttpErrorResponse) => {
        // 404 = already gone; treat as success silently.
        // For all other errors, show a message.
        if (err.status !== 404) {
          this.tablesError = 'Failed to unregister table.';
        }
        // Always reload — the server may have deleted the row despite returning an error.
        if (this.selectedTable?.masterDataId === table.masterDataId) {
          this.selectedTable = null;
          this.rows          = [];
        }
        this.loadTables();
      },
    });
  }

  trackByMd(_: number, t: MasterDataTableDef): number { return t.masterDataId; }
  trackByPk(_: number, r: MasterDataRow): string { return r.pkValue; }
  trackByCol(_: number, c: string): string { return c; }
}
