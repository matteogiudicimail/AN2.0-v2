import {
  Component, EventEmitter, Input, OnInit, OnDestroy, Output,
  HostListener, ElementRef, ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import { evaluateFormula, extractReferences } from '../../../services/formula-engine';
import {
  DataEntryGridResponse, DataEntryRigaOption, SaveCellDto, CellHistoryEntry,
} from '../../../models/esg-configurator.models';

// ── Internal interfaces ───────────────────────────────────────────────────────

interface EditingCell {
  rigaPathKey:    string;
  rigaPathValues: Record<string, string>;
  colonnaField:   string;
  colonnaValue:   string;
  valoreField:    string;
  current:        string;
  originalValue:  string;
}

interface RowCtxMenu {
  x: number; y: number;
  riga: DataEntryRigaOption;
}

interface CellCtxMenu {
  x: number; y: number;
  riga: DataEntryRigaOption;
  colonnaField: string;
  colonnaValue: string;
  valoreField:  string;
  valoreLabel:  string;
}

interface GuidaPopup {
  x: number; y: number;
  riga: DataEntryRigaOption;
}

interface PendingCell {
  dimensionValues: Record<string, string>;
  valoreField:     string;
  value:           string;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'esg-data-entry-sheet',
  templateUrl: './esg-data-entry-sheet.component.html',
})
export class EsgDataEntrySheetComponent implements OnInit, OnDestroy {
  @Input()  reportId!: number;
  @Output() back = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  @ViewChild('cellInputRef') cellInputRef?: ElementRef<HTMLInputElement>;

  grid:      DataEntryGridResponse | null = null;
  isLoading  = false;
  errorMsg:  string | null = null;
  isSaving   = false;
  saveError: string | null = null;

  selectedFiltri: Record<string, string> = {};

  /** Toggle: hide rows that have no value (direct or rollup) */
  showOnlyWithData = false;
  /** Bottom-up rollup sums: key = `pathKey||cf||cv||vf` → numeric sum */
  private rollupCache = new Map<string, number>();
  /** Path keys of nodes that have at least one value (direct leaf or rollup) */
  private nodesWithData = new Set<string>();

  editing: EditingCell | null = null;

  /** Set of pathKey strings for expanded non-leaf rows */
  expandedGroups = new Set<string>();

  // ── Context menus ──────────────────────────────────────────────────────────
  rowCtxMenu:  RowCtxMenu  | null = null;
  cellCtxMenu: CellCtxMenu | null = null;
  historyLoading = false;
  historyEntries: CellHistoryEntry[] = [];
  historyError:  string | null = null;

  // ── Guida popup ────────────────────────────────────────────────────────────
  guidaPopup: GuidaPopup | null = null;

  // ── Save mode ──────────────────────────────────────────────────────────────
  saveMode: 'auto' | 'manual' = 'auto';
  pendingChanges = new Map<string, PendingCell>();
  isSavingPending = false;

  // ── Row Approval ───────────────────────────────────────────────────────────
  /** Set of sorted-JSON dimension keys for approved (locked) rows */
  approvedKeys = new Set<string>();
  approvalLoading = false;

  // ── Column Search Filters ──────────────────────────────────────────────────
  /** Map of search text per column slot; '__riga' is the row-label search */
  columnSearchFilters: Record<string, string> = {};
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Insert Row Dialog ──────────────────────────────────────────────────────
  showInsertRowDialog = false;

  constructor(
    private svc: EsgConfiguratorService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.restoreLocalState();
    this.load();
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
  }

  // ── Local state persistence ────────────────────────────────────────────────

  private lsKey(suffix: string): string { return `de-${suffix}-${this.reportId}`; }

  private restoreLocalState(): void {
    const mode = localStorage.getItem(this.lsKey('save-mode'));
    if (mode === 'auto' || mode === 'manual') this.saveMode = mode;

    const stored = localStorage.getItem(this.lsKey('pending'));
    if (stored) {
      try {
        const entries: [string, PendingCell][] = JSON.parse(stored);
        this.pendingChanges = new Map(entries);
      } catch { /* ignore corrupt data */ }
    }
  }

  private persistPending(): void {
    localStorage.setItem(this.lsKey('pending'), JSON.stringify([...this.pendingChanges.entries()]));
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  load(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.svc.getDataEntryGrid(this.reportId).subscribe({
      next: (g) => {
        this.grid      = g;
        this.isLoading = false;
        // Initialise approval keys from response
        this.approvedKeys = new Set(g.approvedRows ?? []);
        // Init filtri selectors
        g.filterOptions.forEach((f) => {
          if (!(f.fieldName in this.selectedFiltri)) this.selectedFiltri[f.fieldName] = '';
        });
        // Expand top-level groups if only 1-3 → better UX
        const topGroups = g.rowOptions.filter((r) => r.depth === 0 && !r.isLeaf);
        if (topGroups.length <= 3) topGroups.forEach((r) => this.expandedGroups.add(this.pathKey(r.pathValues)));
        // Build rollup cache for subtotals and "only with data" filter
        this.rebuildRollupCache();
      },
      error: () => { this.errorMsg = 'Impossibile caricare la scheda di data entry.'; this.isLoading = false; },
    });
  }

  // ── Filtri ────────────────────────────────────────────────────────────────

  getFiltriValues(fn: string): string[] {
    return this.grid?.filterOptions.find((f) => f.fieldName === fn)?.values ?? [];
  }

  /**
   * True when a filter field is a P&C hierarchy dim-table field that is also
   * present in the rows zone.  In this case a labelled subtree-filter dropdown
   * should be rendered instead of a raw-value dropdown.
   */
  isHierarchyFilter(fieldName: string): boolean {
    if (!this.grid) return false;
    const isFilterWithDim = (this.grid.layout.filters ?? [])
      .some((f) => f.fieldName === fieldName && !!(f as any).dimTable);
    const isInRows = (this.grid.layout.rows ?? [])
      .some((r) => r.fieldName === fieldName);
    return isFilterWithDim && isInRows;
  }

  /**
   * Returns labelled options for a hierarchy filter dropdown.
   * Sources nodes from rowOptions (which already have depth + label).
   * Shows ALL hierarchy levels (no skip-depth or max-depth constraint) so the
   * user can filter to any node regardless of the rows-zone skip level setting.
   * Indentation reflects absolute depth for visual clarity.
   */
  getHierarchyFilterOptions(fieldName: string): Array<{ value: string; label: string }> {
    if (!this.grid) return [];
    return (this.grid.rowOptions ?? [])
      .filter((r) => r.fieldName === fieldName)
      .map((r) => ({
        value: r.value,
        label: '\u00a0\u00a0'.repeat(Math.max(0, r.depth)) + (r.label || r.value),
      }));
  }

  /**
   * For a hierarchy filter field, returns the friendly label from the rows zone
   * (e.g. "Reclassification P&C") instead of the raw field name.
   */
  getHierarchyFilterLabel(fieldName: string): string {
    if (!this.grid) return fieldName;
    const rowItem = (this.grid.layout.rows ?? []).find((r) => r.fieldName === fieldName);
    return rowItem?.label || fieldName;
  }

  // ── Drilldown state ───────────────────────────────────────────────────────

  /** Stable key for a pathValues object (sorted field names) */
  pathKey(values: Record<string, string>): string {
    return Object.keys(values).sort().map((k) => `${k}=${values[k]}`).join('|');
  }

  /** Sorted-JSON key matching the backend DimensionsJson format */
  approvalPathKey(values: Record<string, string>): string {
    return JSON.stringify(
      Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))),
    );
  }

  isExpanded(riga: DataEntryRigaOption): boolean {
    return this.expandedGroups.has(this.pathKey(riga.pathValues));
  }

  toggleGroup(riga: DataEntryRigaOption): void {
    const key = this.pathKey(riga.pathValues);
    if (this.expandedGroups.has(key)) this.expandedGroups.delete(key);
    else this.expandedGroups.add(key);
  }

  /**
   * Rows visible in the grid: depth-0 always shown; deeper levels shown only
   * when all ancestor groups are expanded.
   */
  get visibleRighe(): DataEntryRigaOption[] {
    const all = this.grid?.rowOptions ?? [];
    const righeLayout = this.grid?.layout.rows ?? [];

    const isDimTableMode = righeLayout.length === 1 && !!(righeLayout[0] as any).dimTable;
    const skipDepths: number = isDimTableMode ? ((righeLayout[0] as any).skipDepths ?? 0) : 0;

    let visible = all.filter((r) => {
      if (isDimTableMode) {
        if (r.depth < skipDepths) return false;
        if (r.depth === skipDepths) return true;
        const relevantAncestors = (r.ancestorKeys ?? []).slice(skipDepths);
        return relevantAncestors.every((ak) => this.expandedGroups.has(ak));
      }

      if (r.depth === 0) return true;

      if (r.ancestorKeys && r.ancestorKeys.length > 0) {
        return r.ancestorKeys.every((ak) => this.expandedGroups.has(ak));
      }

      for (let d = 0; d < r.depth; d++) {
        const ancestorPath: Record<string, string> = {};
        for (let i = 0; i <= d; i++) ancestorPath[righeLayout[i].fieldName] = r.pathValues[righeLayout[i].fieldName];
        if (!this.expandedGroups.has(this.pathKey(ancestorPath))) return false;
      }
      return true;
    });

    if (this.showOnlyWithData) {
      visible = visible.filter((r) => this.nodesWithData.has(this.pathKey(r.pathValues)));
    }

    // Apply P&C hierarchy filters: when a filter field is also in rows with a dimTable,
    // restrict visible rows to the selected node + all its descendants.
    if (this.grid) {
      for (const f of (this.grid.layout.filters ?? [])) {
        if (!(f as any).dimTable) continue;
        const selVal = this.selectedFiltri[f.fieldName];
        if (!selVal) continue;
        // Build the pathKey that would appear in a descendant's ancestorKeys
        const ancestorPathKey = `${f.fieldName}=${selVal}`;
        visible = visible.filter((r) =>
          r.pathValues[f.fieldName] === selVal ||
          (r.ancestorKeys ?? []).includes(ancestorPathKey),
        );
      }
    }

    // Apply column search filter (row-label based, case-insensitive)
    return this.applyColumnSearchFilter(visible);
  }

  /**
   * Filters rows by the `__riga` text search.
   *
   * Searches only within the currently visible `rows` (not the full hidden tree),
   * so collapsed group nodes are matched only on their own label — not on hidden
   * descendants.  This gives predictable UX: "mana" shows only nodes whose label
   * contains "mana"; once a group is expanded its matching children also appear.
   *
   * Parents of directly-matching visible rows are kept so tree structure is intact.
   */
  private applyColumnSearchFilter(rows: DataEntryRigaOption[]): DataEntryRigaOption[] {
    const q = (this.columnSearchFilters['__riga'] ?? '').trim().toLowerCase();
    if (!q) return rows;

    const matches = (r: DataEntryRigaOption) =>
      (r.label ?? '').toLowerCase().includes(q) || (r.value ?? '').toLowerCase().includes(q);

    // Direct matches among visible rows
    const matchingPathKeys = new Set(rows.filter(matches).map((r) => this.pathKey(r.pathValues)));

    // Keep ancestors of directly-matching visible rows (so tree stays navigable)
    const keepPathKeys = new Set<string>(matchingPathKeys);
    for (const r of rows) {
      if (matchingPathKeys.has(this.pathKey(r.pathValues))) {
        (r.ancestorKeys ?? []).forEach((ak) => keepPathKeys.add(ak));
      }
    }

    return rows.filter((r) => keepPathKeys.has(this.pathKey(r.pathValues)));
  }

  /** Debounced handler for search input changes */
  onSearchChange(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => { /* visibleRighe is a getter — auto-refreshes */ }, 200);
  }

  /** True when there are multiple righe levels OR a single dim-table hierarchy field */
  get isMultiLevel(): boolean {
    const righe = this.grid?.layout.rows ?? [];
    if (righe.length > 1) return true;
    return righe.length === 1 && !!(righe[0] as any).dimTable;
  }

  // ── Colonne helpers ───────────────────────────────────────────────────────

  getColonneValues(fn: string): string[] {
    return this.grid?.columnOptions.find((c) => c.fieldName === fn)?.values ?? [];
  }

  get effectiveColonne(): Array<{ fieldName: string; values: string[] }> {
    if (!this.grid) return [];
    if (this.grid.layout.columns.length > 0) return this.grid.columnOptions;
    return [{ fieldName: '', values: [''] }];
  }

  get noColonnaMode(): boolean { return (this.grid?.layout.columns.length ?? 0) === 0; }

  // ── Lock column members ───────────────────────────────────────────────────

  /** Returns true if the colonna value is listed in lockedMembers for that field */
  isColumnMemberLocked(colonnaField: string, colonnaValue: string): boolean {
    if (!this.grid || !colonnaField) return false;
    const col = this.grid.layout.columns.find((c) => c.fieldName === colonnaField);
    return (col as any)?.lockedMembers?.includes(colonnaValue) ?? false;
  }

  // ── Row Approval ─────────────────────────────────────────────────────────

  isRowApproved(riga: DataEntryRigaOption): boolean {
    return this.approvedKeys.has(this.approvalPathKey(riga.pathValues));
  }

  toggleRowApproval(riga: DataEntryRigaOption): void {
    const key = this.approvalPathKey(riga.pathValues);
    const newApproved = !this.approvedKeys.has(key);
    this.approvalLoading = true;
    this.svc.setRowApproval(this.reportId, { dimensionsJson: key, approved: newApproved }).subscribe({
      next: () => {
        if (newApproved) this.approvedKeys.add(key);
        else this.approvedKeys.delete(key);
        this.approvalLoading = false;
      },
      error: () => { this.approvalLoading = false; },
    });
  }

  toggleGroupApproval(riga: DataEntryRigaOption): void {
    const all = this.grid?.rowOptions ?? [];
    const groupKey = this.pathKey(riga.pathValues);
    // Collect all descendants (rows whose ancestorKeys includes this group's pathKey)
    const descendants = all.filter(
      (r) => r !== riga && (r.ancestorKeys ?? []).includes(groupKey),
    );
    const keysToToggle = [riga, ...descendants].map((r) => this.approvalPathKey(r.pathValues));
    const newApproved = !this.isRowApproved(riga);
    this.approvalLoading = true;
    this.svc.bulkSetRowApproval(this.reportId, { dimensionsJsonArray: keysToToggle, approved: newApproved }).subscribe({
      next: () => {
        keysToToggle.forEach((k) => {
          if (newApproved) this.approvedKeys.add(k);
          else this.approvedKeys.delete(k);
        });
        this.approvalLoading = false;
      },
      error: () => { this.approvalLoading = false; },
    });
  }

  // ── Formula evaluation ─────────────────────────────────────────────────────

  /** True when this riga uses a client-side formula */
  isFormulaRow(riga: DataEntryRigaOption): boolean {
    return !!(riga.paramRow?.isFormula && riga.paramRow?.formula);
  }

  /**
   * Evaluates the formula for a riga by building a context of sibling row values.
   * Returns the formatted result or '' if formula cannot be evaluated.
   */
  getFormulaValue(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): string {
    const formula = riga.paramRow?.formula;
    if (!formula) return '';
    const refs = extractReferences(formula);
    if (!refs.length) return '';

    // Build context: find siblings sharing the same parent path and map value → number.
    // Parent path = all pathValues of the formula row EXCEPT its own field, so that
    // in a multi-level hierarchy (e.g. STAKEHOLDER > Descrizione_KPI) we only match
    // siblings that belong to the same parent (same STAKEHOLDER).
    const all = this.grid?.rowOptions ?? [];
    const parentPath = Object.fromEntries(
      Object.entries(riga.pathValues).filter(([k]) => k !== riga.fieldName),
    );
    const context: Record<string, number> = {};
    for (const ref of refs) {
      const sibling = all.find(
        (r) => r.value === ref
          && r.fieldName === riga.fieldName
          && r.depth === riga.depth
          && r !== riga
          && Object.entries(parentPath).every(([k, v]) => r.pathValues[k] === v),
      );
      if (sibling) {
        const raw = this.getCellValue(sibling, cf, cv, vf);
        context[ref] = raw !== '' ? (parseFloat(raw) || 0) : 0;
      }
    }

    const result = evaluateFormula(formula, context);
    if (result === null) return '';
    const vfDef = this.grid?.layout.values.find((v) => v.fieldName === vf);
    return this.formatCellDisplay(String(result), vfDef?.aggregation ?? 'SUM');
  }

  // ── Write data lookup ─────────────────────────────────────────────────────

  getCellValue(riga: DataEntryRigaOption, colonnaField: string, colonnaValue: string, valoreField: string): string {
    if (!this.grid) return '';
    if (this.saveMode === 'manual') {
      const pk = this.pendingKey(riga, colonnaField, colonnaValue, valoreField);
      const pending = this.pendingChanges.get(pk);
      if (pending !== undefined) return pending.value;
    }
    const match = this.grid.writeRows.find((row) => {
      for (const f of this.grid!.layout.filters) {
        if ((f as any).dimTable) continue;
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

  hasWrittenValue(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): boolean {
    const v = this.getCellValue(riga, cf, cv, vf);
    return v !== '' && v !== null;
  }

  // ── Pending helpers ───────────────────────────────────────────────────────

  private pendingKey(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): string {
    const dim = this.buildDimValues(riga.pathValues, cf, cv);
    return this.sortedJson(dim) + '|' + vf;
  }

  isPending(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): boolean {
    if (this.saveMode !== 'manual') return false;
    return this.pendingChanges.has(this.pendingKey(riga, cf, cv, vf));
  }

  get pendingCount(): number { return this.pendingChanges.size; }

  private sortedJson(obj: Record<string, string>): string {
    return JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))));
  }

  // ── Reload with discard ────────────────────────────────────────────────────

  reloadConfirmVisible = false;

  requestReloadDiscard(): void {
    if (this.pendingChanges.size === 0) { this.load(); return; }
    this.reloadConfirmVisible = true;
  }

  confirmReloadDiscard(): void {
    this.pendingChanges.clear();
    localStorage.removeItem(this.lsKey('pending'));
    this.reloadConfirmVisible = false;
    this.load();
  }

  cancelReloadDiscard(): void { this.reloadConfirmVisible = false; }

  // ── Save mode toggle ──────────────────────────────────────────────────────

  setSaveMode(mode: 'auto' | 'manual'): void {
    this.saveMode = mode;
    localStorage.setItem(this.lsKey('save-mode'), mode);
  }

  savePending(): void {
    if (this.pendingChanges.size === 0) return;
    const entries = [...this.pendingChanges.entries()];
    this.isSavingPending = true;
    let remaining = entries.length;
    let hasError = false;

    entries.forEach(([key, cell]) => {
      const dto: SaveCellDto = { dimensionValues: cell.dimensionValues, valoreField: cell.valoreField, value: cell.value };
      this.svc.saveDataEntryCell(this.reportId, dto).subscribe({
        next: () => {
          this.updateCache(cell.dimensionValues, cell.valoreField, cell.value);
          this.pendingChanges.delete(key);
          remaining--;
          if (remaining === 0) { this.isSavingPending = false; this.persistPending(); }
        },
        error: () => {
          hasError = true;
          remaining--;
          if (remaining === 0) {
            this.isSavingPending = false;
            if (hasError) this.saveError = 'Alcuni valori non sono stati salvati. Riprovare.';
          }
        },
      });
    });
  }

  // ── Cell editing ──────────────────────────────────────────────────────────

  startEdit(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): void {
    // Block: approved rows
    if (this.isRowApproved(riga)) return;
    // Block: locked column members
    if (this.isColumnMemberLocked(cf, cv)) return;
    // Block: formula rows
    if (this.isFormulaRow(riga)) return;

    if (riga.paramRow?.rowKind === 'Aggregato') {
      this.onAggregateClick(riga, cf, cv, vf);
      return;
    }
    if (this.editing) this.commitEdit();
    this.closeAllMenus();
    const initialValue = this.getCellValue(riga, cf, cv, vf);
    this.editing = {
      rigaPathKey:    this.pathKey(riga.pathValues),
      rigaPathValues: { ...riga.pathValues },
      colonnaField: cf, colonnaValue: cv,
      valoreField: vf,
      current:       initialValue,
      originalValue: initialValue,
    };
    this.saveError = null;
    setTimeout(() => this.cellInputRef?.nativeElement?.focus(), 0);
  }

  isEditing(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): boolean {
    return !!(
      this.editing &&
      this.editing.rigaPathKey  === this.pathKey(riga.pathValues) &&
      this.editing.colonnaField === cf &&
      this.editing.colonnaValue === cv &&
      this.editing.valoreField  === vf
    );
  }

  cancelEdit(): void { this.editing = null; this.saveError = null; }

  commitEdit(): void {
    if (!this.editing || !this.grid) { this.editing = null; return; }
    const { rigaPathValues, colonnaField, colonnaValue, valoreField, current, originalValue } = this.editing;
    if (current.trim() === originalValue.trim()) { this.editing = null; return; }
    const dim = this.buildDimValues(rigaPathValues, colonnaField, colonnaValue);
    const dto: SaveCellDto = { dimensionValues: dim, valoreField, value: current };
    this.editing = null;

    if (this.saveMode === 'manual') {
      const pk = this.sortedJson(dim) + '|' + valoreField;
      this.pendingChanges.set(pk, { dimensionValues: dim, valoreField, value: current });
      this.persistPending();
      return;
    }

    this.isSaving = true;
    this.svc.saveDataEntryCell(this.reportId, dto).subscribe({
      next: () => { this.isSaving = false; this.updateCache(dim, valoreField, current); },
      error: () => { this.isSaving = false; this.saveError = 'Failed to save cell value.'; },
    });
  }

  private buildDimValues(
    rigaPathValues: Record<string, string>, colonnaField: string, colonnaValue: string,
  ): Record<string, string> {
    if (!this.grid) return {};
    const dim: Record<string, string> = {};
    for (const f of this.grid.layout.filters) {
      if ((f as any).dimTable) continue;
      dim[f.fieldName] = this.selectedFiltri[f.fieldName] ?? '';
    }
    for (const f of this.grid.layout.rows) dim[f.fieldName] = '';
    for (const f of this.grid.layout.columns) dim[f.fieldName] = '';
    Object.assign(dim, rigaPathValues);
    if (!this.noColonnaMode && colonnaField) dim[colonnaField] = colonnaValue;
    return dim;
  }

  private updateCache(dim: Record<string, string>, vf: string, value: string): void {
    if (!this.grid) return;
    // Use the same matching logic as getCellValue to correctly identify the row.
    // buildDimValues() initialises ancestor row fields to '' and overwrites only with
    // rigaPathValues, so a strict allDimFields comparison would miss the existing row.
    const existing = this.grid.writeRows.find((row) => {
      for (const f of this.grid!.layout.filters) {
        if ((f as any).dimTable) continue;
        const sel = this.selectedFiltri[f.fieldName];
        if (sel && row.dimensionValues[f.fieldName] !== sel) return false;
      }
      for (const [field, val] of Object.entries(dim)) {
        if (!val) continue; // skip empty ancestor fields
        if (!(field in row.dimensionValues)) continue; // skip virtual fields not in write table
        if (row.dimensionValues[field] !== val) return false;
      }
      return true;
    });
    if (existing) existing.values[vf] = value;
    else this.grid.writeRows.push({ dimensionValues: { ...dim }, values: { [vf]: value } });
    this.rebuildRollupCache();
  }

  // ── Aggregate → Manual Adj ────────────────────────────────────────────────

  adjLoading = false;

  onAggregateClick(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): void {
    if (riga.paramRow?.rowKind !== 'Aggregato') return;

    const righeLayout = this.grid?.layout.rows ?? [];
    const righeItem   = righeLayout.find((r) => r.fieldName === riga.fieldName);
    const hasParam    = !!(righeItem?.paramTableId);

    if (!hasParam) {
      this._openEditorDirectly(riga, cf, cv, vf);
      return;
    }

    this.adjLoading = true;
    this.saveError  = null;
    this.svc.ensureManualAdj(this.reportId, {
      rigaFieldName:     riga.fieldName,
      parentSourceValue: riga.value,
    }).subscribe({
      next:  () => { this.adjLoading = false; this.load(); },
      error: () => { this.adjLoading = false; this._openEditorDirectly(riga, cf, cv, vf); },
    });
  }

  private _openEditorDirectly(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): void {
    this.closeAllMenus();
    const initialValue = this.getCellValue(riga, cf, cv, vf);
    this.editing = {
      rigaPathKey:    this.pathKey(riga.pathValues),
      rigaPathValues: { ...riga.pathValues },
      colonnaField: cf, colonnaValue: cv,
      valoreField: vf,
      current:       initialValue,
      originalValue: initialValue,
    };
    this.saveError = null;
    setTimeout(() => this.cellInputRef?.nativeElement?.focus(), 0);
  }

  onGroupCellClick(event: MouseEvent, riga: DataEntryRigaOption, cf: string, cv: string, vf: string): void {
    event.stopPropagation();
    if (this.isRowApproved(riga)) return;
    if (this.isColumnMemberLocked(cf, cv)) return;
    this._openEditorDirectly(riga, cf, cv, vf);
  }

  // ── Row right-click (param details) ──────────────────────────────────────

  onRowRightClick(event: MouseEvent, riga: DataEntryRigaOption): void {
    event.preventDefault(); event.stopPropagation();
    this.closeAllMenus();
    this.rowCtxMenu = { x: event.clientX, y: event.clientY, riga };
  }

  // ── Cell right-click (history) ────────────────────────────────────────────

  onCellRightClick(
    event: MouseEvent, riga: DataEntryRigaOption,
    cf: string, cv: string, vf: { fieldName: string; label: string },
  ): void {
    event.preventDefault(); event.stopPropagation();
    if (this.editing) this.cancelEdit();
    this.closeAllMenus();
    this.cellCtxMenu = {
      x: event.clientX, y: event.clientY, riga,
      colonnaField: cf, colonnaValue: cv,
      valoreField: vf.fieldName, valoreLabel: vf.label,
    };
    this.historyLoading = true;
    this.historyEntries = [];
    this.historyError   = null;
    const dim = this.buildDimValues({ ...riga.pathValues }, cf, cv);
    this.svc.getCellHistory(this.reportId, { dimensionValues: dim, valoreField: vf.fieldName }).subscribe({
      next:  (e) => { this.historyEntries = e; this.historyLoading = false; },
      error: ()  => { this.historyError = 'Impossibile caricare la storia.'; this.historyLoading = false; },
    });
  }

  // ── Guida popup ────────────────────────────────────────────────────────────

  openGuida(event: MouseEvent, riga: DataEntryRigaOption): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeAllMenus();
    if (!riga.paramRow?.compilationGuide) return;
    this.guidaPopup = { x: event.clientX, y: event.clientY, riga };
  }

  closeGuida(): void { this.guidaPopup = null; }

  sanitizeHtml(html: string | null): SafeHtml {
    if (!html) return '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // ── Menu helpers ───────────────────────────────────────────────────────────

  closeAllMenus(): void {
    this.rowCtxMenu  = null;
    this.cellCtxMenu = null;
    this.guidaPopup  = null;
  }

  @HostListener('document:click')   onDocClick(): void { this.closeAllMenus(); }
  @HostListener('document:keydown.escape') onEscape(): void { this.closeAllMenus(); this.cancelEdit(); }

  // ── Number display formatting ─────────────────────────────────────────────

  formatCellDisplay(rawValue: string, aggregation: string, emptyFallback = '—'): string {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return emptyFallback;
    const num = parseFloat(rawValue);
    if (isNaN(num)) return rawValue;
    const locale = navigator.language || 'it-IT';
    if (aggregation === 'COUNT') {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(num);
    }
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  }

  // ── Rollup cache ─────────────────────────────────────────────────────────

  rebuildRollupCache(): void {
    this.rollupCache.clear();
    this.nodesWithData.clear();
    if (!this.grid) return;

    const flat = this.grid.rowOptions;
    const cols = this.effectiveColonne;
    const vals = this.grid.layout.values;

    for (const row of flat) {
      if (!row.isLeaf) continue;
      let leafHasData = false;
      for (const c of cols) {
        const cfName = c.fieldName;
        const cvList = c.values.length ? c.values : [''];
        for (const cv of cvList) {
          for (const vf of vals) {
            const raw = this.getCellValue(row, cfName, cv, vf.fieldName);
            if (!raw) continue;
            const num = parseFloat(raw);
            if (isNaN(num)) continue;
            leafHasData = true;
            for (const ak of (row.ancestorKeys ?? [])) {
              const k = `${ak}||${cfName}||${cv}||${vf.fieldName}`;
              this.rollupCache.set(k, (this.rollupCache.get(k) ?? 0) + num);
            }
          }
        }
      }
      if (leafHasData) this.nodesWithData.add(this.pathKey(row.pathValues));
    }

    for (const row of flat) {
      if (row.isLeaf) continue;
      const pk = this.pathKey(row.pathValues);
      const hasRollup = cols.some((c) =>
        (c.values.length ? c.values : ['']).some((cv) =>
          vals.some((vf) => this.rollupCache.has(`${pk}||${c.fieldName}||${cv}||${vf.fieldName}`)),
        ),
      );
      if (hasRollup) this.nodesWithData.add(pk);
    }
  }

  getDisplayValue(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): string {
    const direct = this.getCellValue(riga, cf, cv, vf);
    if (direct !== '') return direct;
    if (!riga.isLeaf) {
      const k = `${this.pathKey(riga.pathValues)}||${cf}||${cv}||${vf}`;
      const rollup = this.rollupCache.get(k);
      if (rollup !== undefined) return String(rollup);
    }
    return '';
  }

  isRollupValue(riga: DataEntryRigaOption, cf: string, cv: string, vf: string): boolean {
    if (riga.isLeaf) return false;
    if (this.getCellValue(riga, cf, cv, vf) !== '') return false;
    const k = `${this.pathKey(riga.pathValues)}||${cf}||${cv}||${vf}`;
    return this.rollupCache.has(k);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  stripHtml(html: string | null): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  }

  get rigaHeaderLabel(): string {
    return this.grid?.layout.rows.map((r) => r.label).join(' / ') ?? 'Row';
  }

  get totalDataColumns(): number {
    if (!this.grid) return 1;
    const vc = this.grid.layout.values.length || 1;
    if (this.noColonnaMode) return vc;
    return this.grid.layout.columns.reduce((s, cf) => s + this.getColonneValues(cf.fieldName).length * vc, 0);
  }

  /** Total column span for the empty row (approval col + riga label col + data cols) */
  get totalColspan(): number { return 2 + this.totalDataColumns; }

  trackByRiga(_: number, r: DataEntryRigaOption): string {
    return r.depth + ':' + r.value + ':' + Object.values(r.pathValues).join('|');
  }
  trackByColonna(_: number, v: string): string { return v; }
  trackByValore(_: number, v: { fieldName: string }): string { return v.fieldName; }
  trackByFiltri(_: number, f: { fieldName: string }): string { return f.fieldName; }
  trackByLogId(_: number, e: CellHistoryEntry): number { return e.logId; }
}
