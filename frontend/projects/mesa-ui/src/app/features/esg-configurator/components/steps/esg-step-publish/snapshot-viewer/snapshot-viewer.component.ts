/**
 * SnapshotViewerComponent — displays the frozen-layout data entry grid for a published task.
 *
 * Uses the snapshot API endpoints (/snapshots/:id/grid and /snapshots/:id/cell)
 * instead of the live layout endpoints.  Supports:
 *  - Filter selectors
 *  - Inline cell editing (click-to-edit)
 *  - Auto-save on confirm
 *
 * WCAG: all interactive elements labelled; roles applied.
 */

import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../../../services/esg-configurator.service';
import {
  DataEntryGridResponse, DataEntryRowOption, SaveCellDto,
} from '../../../../models/esg-configurator.models';

interface EditingCell {
  pathKey:         string;
  pathValues:      Record<string, string>;
  colonnaField:    string;
  colonnaValue:    string;
  valoreField:     string;
  current:         string;
}

@Component({
  selector: 'snapshot-viewer',
  templateUrl: './snapshot-viewer.component.html',
})
export class SnapshotViewerComponent implements OnInit {
  @Input() snapshotId!: number;
  @Input() taskLabel = '';

  @Output() closed = new EventEmitter<void>();

  grid:      DataEntryGridResponse | null = null;
  isLoading  = false;
  errorMsg:  string | null = null;
  isSaving   = false;
  saveError: string | null = null;

  selectedFiltri: Record<string, string> = {};
  editing: EditingCell | null = null;

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.svc.getSnapshotGrid(this.snapshotId).subscribe({
      next: (g) => {
        this.grid      = g;
        this.isLoading = false;
        const filters = g.layout.filters ?? (g.layout as any).filtri ?? [];
        filters.forEach((f: any) => {
          if (!(f.fieldName in this.selectedFiltri)) this.selectedFiltri[f.fieldName] = '';
        });
      },
      error: () => { this.errorMsg = 'Impossibile caricare lo snapshot.'; this.isLoading = false; },
    });
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  get layoutFilters(): Array<{ fieldName: string; label: string }> {
    if (!this.grid) return [];
    return this.grid.layout.filters ?? (this.grid.layout as any).filtri ?? [];
  }

  get layoutRows(): Array<{ fieldName: string; label: string; paramTableId: number | null }> {
    if (!this.grid) return [];
    return this.grid.layout.rows ?? (this.grid.layout as any).righe ?? [];
  }

  get layoutColumns(): Array<{ fieldName: string; label: string; paramTableId: number | null; lockedMembers?: string[] }> {
    if (!this.grid) return [];
    return this.grid.layout.columns ?? (this.grid.layout as any).colonne ?? [];
  }

  get layoutValues(): Array<{ fieldName: string; label: string }> {
    if (!this.grid) return [];
    return this.grid.layout.values ?? (this.grid.layout as any).valori ?? [];
  }

  getFiltriValues(fn: string): string[] {
    return this.grid?.filterOptions?.find((f: any) => f.fieldName === fn)?.values
      ?? (this.grid as any)?.filtriOptions?.find((f: any) => f.fieldName === fn)?.values
      ?? [];
  }

  get visibleRows(): DataEntryRowOption[] {
    if (!this.grid) return [];
    const options = this.grid.rowOptions ?? (this.grid as any).righeOptions ?? [];
    return options.filter((r: DataEntryRowOption) => r.isLeaf);
  }

  get columnCombinations(): Array<{ fieldName: string; value: string }> {
    if (!this.grid) return [];
    const cols = this.grid.columnOptions ?? (this.grid as any).colonneOptions ?? [];
    const col = cols[0];
    if (!col) return [];
    return col.values.map((v: string) => ({ fieldName: col.fieldName, value: v }));
  }

  get noColonnaMode(): boolean {
    return this.columnCombinations.length === 0;
  }

  // ── Cell value lookup ───────────────────────────────────────────────────────

  getCellValue(
    riga: DataEntryRowOption,
    colonnaField: string, colonnaValue: string,
    valoreField: string,
  ): string {
    if (!this.grid) return '';
    const match = this.grid.writeRows.find((row) => {
      for (const f of this.layoutFilters) {
        const sel = this.selectedFiltri[f.fieldName];
        if (sel && row.dimensionValues[f.fieldName] !== sel) return false;
      }
      for (const [field, val] of Object.entries(riga.pathValues)) {
        // Skip virtual grouping fields (e.g. Descrizione_KPI_Grouping) that are not
        // stored in the write table — they exist in pathValues but not in dimensionValues.
        if (!(field in row.dimensionValues)) continue;
        if (row.dimensionValues[field] !== val) return false;
      }
      if (!this.noColonnaMode && colonnaField && row.dimensionValues[colonnaField] !== colonnaValue) return false;
      return true;
    });
    return match?.values[valoreField] ?? '';
  }

  pathKey(pathValues: Record<string, string>): string {
    return Object.entries(pathValues).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`).join('|');
  }

  isEditing(riga: DataEntryRowOption, cf: string, cv: string, vf: string): boolean {
    return this.editing !== null
      && this.editing.pathKey === this.pathKey(riga.pathValues)
      && this.editing.colonnaField === cf
      && this.editing.colonnaValue === cv
      && this.editing.valoreField  === vf;
  }

  // ── Cell editing ────────────────────────────────────────────────────────────

  startEdit(riga: DataEntryRowOption, cf: string, cv: string, vf: string): void {
    this.editing = {
      pathKey:      this.pathKey(riga.pathValues),
      pathValues:   riga.pathValues,
      colonnaField: cf,
      colonnaValue: cv,
      valoreField:  vf,
      current:      this.getCellValue(riga, cf, cv, vf),
    };
  }

  confirmEdit(value: string): void {
    if (!this.editing || !this.grid) return;
    const e = this.editing;
    this.editing = null;

    const dimValues: Record<string, string> = { ...e.pathValues };
    if (!this.noColonnaMode && e.colonnaField) dimValues[e.colonnaField] = e.colonnaValue;
    for (const f of this.layoutFilters) {
      const sel = this.selectedFiltri[f.fieldName];
      if (sel) dimValues[f.fieldName] = sel;
    }

    const dto: SaveCellDto = {
      dimensionValues: dimValues,
      valoreField:     e.valoreField,
      value,
    };

    this.isSaving   = true;
    this.saveError  = null;
    this.svc.saveSnapshotCell(this.snapshotId, dto).subscribe({
      next: () => {
        this.isSaving = false;
        // Update in-memory grid
        const row = this.grid!.writeRows.find((r) => {
          for (const [k, v] of Object.entries(dimValues)) {
            if (!v) continue;
            if (!(k in r.dimensionValues)) continue; // skip virtual grouping fields
            if (r.dimensionValues[k] !== v) return false;
          }
          return true;
        });
        if (row) row.values[e.valoreField] = value;
        else this.grid!.writeRows.push({ dimensionValues: { ...dimValues }, values: { [e.valoreField]: value } });
      },
      error: () => { this.isSaving = false; this.saveError = 'Errore durante il salvataggio.'; },
    });
  }

  cancelEdit(): void { this.editing = null; }

  // ── Track helpers ───────────────────────────────────────────────────────────

  trackByField(_: number, f: { fieldName: string }): string { return f.fieldName; }
  trackByRow(_: number, r: DataEntryRowOption): string { return this.pathKey(r.pathValues); }
  trackByCol(_: number, c: { fieldName: string; value: string }): string { return `${c.fieldName}=${c.value}`; }
  trackByVf(_: number, v: { fieldName: string }): string { return v.fieldName; }
}
