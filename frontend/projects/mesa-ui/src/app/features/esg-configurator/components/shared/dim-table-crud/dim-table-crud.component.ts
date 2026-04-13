/**
 * DimTableCrudComponent — direct CRUD grid for a joined dimension table.
 *
 * Opened from the "Gestisci" button on each JOIN row in Step 2.
 * Does NOT require prior registration in cfg_MasterDataTable — it accesses
 * the table directly via the /configurator/dim-table API.
 *
 * Security: all SQL identifiers are validated server-side (OWASP A03).
 * WCAG: table columns have scope, editing inputs are labelled, confirmations
 * use role="alertdialog".
 */

import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import { DbColumnInfo } from '../../../models/esg-configurator.models';

interface EditingRow {
  isNew:    boolean;
  origPk:   string;
  values:   Record<string, string | null>;
}

@Component({
  selector:    'cfg-dim-table-crud',
  templateUrl: './dim-table-crud.component.html',
})
export class DimTableCrudComponent implements OnInit {
  /** Full table reference, e.g. "dbo.ISP_Stakeholder_Distinct" */
  @Input() rightTable!: string;
  @Output() closed = new EventEmitter<void>();

  // ── Derived table info ───────────────────────────────────────────────────────
  schema   = '';
  table    = '';
  pkCol    = '';

  // ── State ────────────────────────────────────────────────────────────────────
  columns:     DbColumnInfo[]              = [];
  rows:        Record<string, unknown>[]   = [];
  isLoading    = false;
  errorMsg:    string | null = null;
  successMsg:  string | null = null;

  searchText   = '';
  editingRow:  EditingRow | null = null;
  isSaving     = false;
  saveError:   string | null = null;
  deleteConfirmPk: string | null = null;
  isDeleting   = false;

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void {
    this.parseTable();
    this.load();
  }

  private parseTable(): void {
    const parts = this.rightTable.split('.');
    if (parts.length >= 2) {
      this.schema = parts[0]!;
      this.table  = parts.slice(1).join('.');
    } else {
      this.schema = 'dbo';
      this.table  = this.rightTable;
    }
  }

  load(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.svc.getTableColumns(this.schema, this.table).subscribe({
      next: (cols) => {
        this.columns = cols;
        this.pkCol   = cols.find((c) => c.isPrimaryKey)?.columnName ?? (cols[0]?.columnName ?? '');
        this.loadRows();
      },
      error: () => {
        this.errorMsg  = 'Impossibile caricare le colonne della tabella.';
        this.isLoading = false;
      },
    });
  }

  private loadRows(): void {
    this.svc.getDimTableRows(this.schema, this.table).subscribe({
      next:  (r) => { this.rows = r; this.isLoading = false; },
      error: ()  => { this.errorMsg = 'Impossibile caricare le righe.'; this.isLoading = false; },
    });
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  get colNames(): string[] { return this.columns.map((c) => c.columnName); }

  get filteredRows(): Record<string, unknown>[] {
    const q = this.searchText.toLowerCase().trim();
    if (!q) return this.rows;
    return this.rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }

  cellDisplay(row: Record<string, unknown>, col: string): string {
    const v = row[col];
    return v === null || v === undefined ? '' : String(v);
  }

  pkOf(row: Record<string, unknown>): string {
    return String(row[this.pkCol] ?? '');
  }

  // ── Edit ──────────────────────────────────────────────────────────────────────

  startEdit(row: Record<string, unknown>): void {
    const values: Record<string, string | null> = {};
    for (const c of this.colNames) {
      const v = row[c];
      values[c] = v === null || v === undefined ? null : String(v);
    }
    this.editingRow = { isNew: false, origPk: this.pkOf(row), values };
    this.saveError  = null;
  }

  startNew(): void {
    const values: Record<string, string | null> = {};
    for (const c of this.colNames) values[c] = null;
    this.editingRow = { isNew: true, origPk: '', values };
    this.saveError  = null;
  }

  cancelEdit(): void { this.editingRow = null; this.saveError = null; }

  saveRow(): void {
    if (!this.editingRow) return;
    this.isSaving  = true;
    this.saveError = null;

    const { isNew, origPk, values } = this.editingRow;
    const call$ = isNew
      ? this.svc.insertDimTableRow(this.schema, this.table, values)
      : this.svc.updateDimTableRow(this.schema, this.table, this.pkCol, origPk, values);

    call$.subscribe({
      next: () => {
        this.isSaving  = false;
        this.editingRow = null;
        this.flash('Salvato.');
        this.loadRows();
      },
      error: () => { this.isSaving = false; this.saveError = 'Errore durante il salvataggio.'; },
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  requestDelete(row: Record<string, unknown>): void {
    this.deleteConfirmPk = this.pkOf(row);
  }

  cancelDelete(): void { this.deleteConfirmPk = null; }

  confirmDelete(): void {
    if (!this.deleteConfirmPk) return;
    this.isDeleting = true;
    this.svc.deleteDimTableRow(this.schema, this.table, this.pkCol, this.deleteConfirmPk).subscribe({
      next: () => {
        this.isDeleting      = false;
        this.deleteConfirmPk = null;
        this.flash('Riga eliminata.');
        this.loadRows();
      },
      error: () => { this.isDeleting = false; this.errorMsg = 'Errore durante l\'eliminazione.'; },
    });
  }

  private flash(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = null; }, 3000);
  }

  // Arrow functions preserve component `this` when used as trackBy callbacks.
  trackByPk = (_: number, row: Record<string, unknown>): string => String(row[this.pkCol] ?? '');
  trackByCol = (_: number, c: string): string => c;
}
