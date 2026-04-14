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
  /** When true, hides footer nav and adapts toolbar for embedded split-pane. */
  @Input()  embedded = false;
  @Output() back = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  @ViewChild('cellInputRef') cellInputRef?: ElementRef<HTMLInputElement>;

  grid:      DataEntryGridResponse | null = null;
  /** Phase 1: filter options are loading from the API */
  isLoadingFilters = false;
  /** Phase 2: grid table is being prepared (brief tick after filters render) */
  isLoadingGrid    = false;
  /** True once the grid table is ready to be displayed */
  gridReady        = false;
  /** True when the raw cell count exceeds the 3 000-cell threshold */
  gridTooLarge     = false;
  /** Estimated cell count shown in the too-large warning */
  gridCellCount    = 0;
  errorMsg:  string | null = null;
  isSaving   = false;
  saveError: string | null = null;

  selectedFiltri: Record<string, string> = {};

  /** Toggle: hide rows that have no value (direct or rollup) */
  showOnlyWithData = true;
  /** True while the grid is re-filtering after showOnlyWithData changes */
  isRefiltering = false;
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

  // ── Column Search Filters ──────────────────────────────────────────────────
  /** Map of search text per column slot; '__riga' is the row-label search */
  columnSearchFilters: Record<string, string> = {};
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Insert Row Dialog ──────────────────────────────────────────────────────
  showInsertRowDialog = false;

  // ── Collapsible params section ─────────────────────────────────────────────
  paramsCollapsed = false;

  // ── Filter search popup ────────────────────────────────────────────────────
  filterSearchField: string | null = null;
  filterSearchText = '';

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
    // Reset all state
    this.isLoadingFilters = true;
    this.isLoadingGrid    = false;
    this.gridReady        = false;
    this.gridTooLarge     = false;
    this.gridCellCount    = 0;
    this.errorMsg         = null;
    this.grid             = null;

    this.svc.getDataEntryGrid(this.reportId).subscribe({
      next: (g) => {
        // ── Phase 1: expose filter data immediately ────────────────────────
        this.grid             = g;
        this.isLoadingFilters = false;

        // Init filtri selectors; apply defaultValue from layout config if present
        g.filterOptions.forEach((f) => {
          if (!(f.fieldName in this.selectedFiltri)) {
            const layoutFilter = (g.layout.filters ?? g.layout.filtri ?? [])
              .find((lf) => lf.fieldName === f.fieldName);
            this.selectedFiltri[f.fieldName] = layoutFilter?.defaultValue ?? '';
          }
        });

        this.initExpandedGroups(g);

        // ── Phase 2: quick cell count estimate (leaf rows × data columns) ──
        // rebuildRollupCache() is deferred to avoid blocking the main thread
        // with a synchronous scan of all rows × cols × writeRows before the
        // spinner is cleared.  Using raw leaf count avoids needing nodesWithData.
        const leafCount = g.rowOptions.filter((r) => r.isLeaf).length;
        this.gridCellCount = leafCount * Math.max(1, this.totalDataColumns);
        if (this.gridCellCount > 3000) {
          this.gridTooLarge = true;
          // Do NOT build the rollup cache here — dataset is too large.
          // onFiltroChange() will call rebuildRollupCache() when the user applies a filter,
          // and checkAndAutoLoadGrid() will re-evaluate the threshold at that point.
        } else {
          // Brief tick lets Angular render the filter bar first, then show grid
          this.isLoadingGrid = true;
          setTimeout(() => {
            this.rebuildRollupCache();
            this.gridReady     = true;
            this.isLoadingGrid = false;
          }, 0);
        }
      },
      error: () => {
        this.errorMsg         = 'Impossibile caricare la scheda di data entry.';
        this.isLoadingFilters = false;
        this.isLoadingGrid    = false;
      },
    });
  }

  /** Force-display the grid table even when the dataset exceeds the threshold. */
  forceLoadGrid(): void {
    this.gridTooLarge  = false;
    this.isLoadingGrid = true;
    setTimeout(() => {
      this.rebuildRollupCache();
      this.gridReady     = true;
      this.isLoadingGrid = false;
    }, 0);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Auto-expand non-leaf groups after load.
   * Expands all when ≤ 100 non-leaf nodes; only top-level otherwise.
   */
  private initExpandedGroups(g: DataEntryGridResponse): void {
    const nonLeafGroups = g.rowOptions.filter((r) => !r.isLeaf);
    if (nonLeafGroups.length <= 100) {
      nonLeafGroups.forEach((r) => this.expandedGroups.add(this.pathKey(r.pathValues)));
    } else {
      const topGroups = g.rowOptions.filter((r) => r.depth === 0 && !r.isLeaf);
      topGroups.forEach((r) => this.expandedGroups.add(this.pathKey(r.pathValues)));
    }
  }

  /**
   * Estimated number of renderable cells (leaf rows × data columns).
   * Uses the *visible* row set so filter selections reduce the count.
   */
  private computeVisibleCellCount(): number {
    if (!this.grid) return 0;
    const leafRows = this.visibleRighe.filter((r) => r.isLeaf).length;
    return leafRows * Math.max(1, this.totalDataColumns);
  }

  /**
   * Called after every filter change: if we are in the "too large" state and the
   * filtered cell count has dropped to ≤ 3 000, automatically activate the grid.
   */
  private checkAndAutoLoadGrid(): void {
    if (!this.gridTooLarge) return;
    const count = this.computeVisibleCellCount();
    this.gridCellCount = count;
    if (count <= 3000) {
      this.gridTooLarge  = false;
      this.isLoadingGrid = true;
      setTimeout(() => {
        this.gridReady     = true;
        this.isLoadingGrid = false;
      }, 0);
    }
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

    // Build depth → role map: detail-role levels are auto-expanded (no click needed).
    const depthRoles: ('grouping' | 'detail')[] = righeLayout.map((r) => r.role ?? 'grouping');
    const isDetailDepth = (d: number) => depthRoles[d] === 'detail';

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
        // ancestorKeys[i] corresponds to the ancestor at depth i.
        // Detail-role ancestors are always-expanded: skip the expandedGroups check.
        return r.ancestorKeys.every((ak, idx) => {
          if (isDetailDepth(idx)) return true; // detail role: always visible
          return this.expandedGroups.has(ak);
        });
      }

      for (let d = 0; d < r.depth; d++) {
        if (isDetailDepth(d)) continue; // detail role: always expanded
        const ancestorPath: Record<string, string> = {};
        for (let i = 0; i <= d; i++) {
          const fn = righeLayout[i]?.fieldName;
          if (!fn) return false; // safety: layout mismatch
          const val = r.pathValues[fn];
          if (val === undefined) return false; // safety: missing key in pathValues
          ancestorPath[fn] = val;
        }
        if (!this.expandedGroups.has(this.pathKey(ancestorPath))) return false;
      }
      return true;
    });

    if (this.showOnlyWithData) {
      visible = visible.filter((r) => this.nodesWithData.has(this.pathKey(r.pathValues)));
    }

    // Apply row-level filters.
    if (this.grid) {
      const rowFieldNames = new Set((this.grid.layout.rows ?? []).map((r) => r.fieldName));
      // All non-grouping row fields from a dimTable — needed for multi-level
      // hierarchies where the mapping may target a deeper field than the first.
      const dimTableRigaFields = (this.grid.layout.rows ?? [])
        .filter((r) => !!(r as any).dimTable && !(r as any).paramTableId)
        .map((r) => r.fieldName);

      for (const f of (this.grid.layout.filters ?? [])) {
        const selVal = this.selectedFiltri[f.fieldName];
        if (!selVal) continue;

        if (rowFieldNames.has(f.fieldName)) {
          // Field is also a row dim: filter by pathValues
          if ((f as any).dimTable) {
            // P&C hierarchy: filter to selected node + descendants
            const ancestorPathKey = `${f.fieldName}=${selVal}`;
            visible = visible.filter((r) =>
              r.pathValues[f.fieldName] === selVal ||
              (r.ancestorKeys ?? []).includes(ancestorPathKey),
            );
          } else {
            visible = visible.filter((r) => {
              const rowVal = r.pathValues[f.fieldName];
              return rowVal === undefined || rowVal === selVal;
            });
          }
        } else if ((f as any).dimTable && !(f as any).paramTableId) {
          // Pure dim-table-only filtri field NOT in rows zone (e.g. Stakeholder, SDGs).
          // Use filtriDimMapping if available to filter by which primary-row values belong
          // to this filter value.
          const mapping = (this.grid as any).filtriDimMapping?.[f.fieldName];
          if (mapping && dimTableRigaFields.length > 0) {
            const validRowKeys = new Set<string>(mapping[selVal] ?? []);
            visible = visible.filter((r) =>
              dimTableRigaFields.some((fn) => {
                const rv = r.pathValues[fn];
                return rv === undefined || validRowKeys.has(rv);
              }),
            );
          }
        }
      }
    }

    // Prune depth-0 group headers that have no visible children after filtering.
    // Leaf nodes at depth 0 (flat layouts with no sub-levels) are always kept.
    const groupsWithChildren = new Set<string>();
    for (const r of visible) {
      if (r.depth > 0) {
        if (r.ancestorKeys && r.ancestorKeys.length > 0) {
          groupsWithChildren.add(r.ancestorKeys[0]);
        } else if (r.depth === 1) {
          const groupField = righeLayout[0]?.fieldName;
          if (groupField && r.pathValues[groupField] !== undefined) {
            groupsWithChildren.add(this.pathKey({ [groupField]: r.pathValues[groupField] }));
          }
        }
      }
    }
    visible = visible.filter((r) => r.depth !== 0 || r.isLeaf || groupsWithChildren.has(this.pathKey(r.pathValues)));

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

  /**
   * Handles the "Only with data" checkbox change.
   * Shows a brief spinner while Angular re-renders the filtered rows.
   */
  onShowOnlyWithDataChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.isRefiltering    = true;
    this.showOnlyWithData = checked;
    // One tick: lets the spinner appear before the (potentially expensive) DOM update
    setTimeout(() => { this.isRefiltering = false; }, 0);
  }

  /**
   * Called whenever a filter select changes (both embedded and non-embedded).
   * Shows a spinner while the rollup cache is rebuilt and the grid re-renders.
   * `selectedFiltri` is already updated by [(ngModel)] before this fires.
   */
  onFiltroChange(): void {
    this.isRefiltering = true;
    setTimeout(() => {
      this.rebuildRollupCache();
      this.isRefiltering = false;
    }, 0);
  }

  /**
   * Returns true when the row node belongs to a layout field with role='detail'.
   * Detail rows are always-visible (non-collapsible) sub-rows, like OLAP pivot detail rows.
   */
  isDetailRole(riga: DataEntryRigaOption): boolean {
    const item = (this.grid?.layout.rows ?? []).find((r) => r.fieldName === riga.fieldName);
    return item?.role === 'detail';
  }

  /** True when there are multiple righe levels OR a single dim-table hierarchy field */
  get isMultiLevel(): boolean {
    const righe = this.grid?.layout.rows ?? [];
    if (righe.length > 1) return true;
    return righe.length === 1 && !!(righe[0] as any).dimTable;
  }

  // ── Colonne helpers ───────────────────────────────────────────────────────

  getColonneValues(fn: string): string[] {
    const all = this.grid?.columnOptions.find((c) => c.fieldName === fn)?.values ?? [];
    const sel = this.selectedFiltri[fn];
    if (sel) return all.includes(sel) ? [sel] : [];
    return all;
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

    // Fields that are also in the rows zone are already constrained by riga.pathValues.
    // Applying the filter check on them too would cause a conflict: e.g. if
    // Descrizione_KPI_Grouping is both a row dimension AND a filter field, a filter
    // selection of 'Num' would empty all 'Perc' cells even though their rows are visible.
    const rowFieldNames = new Set((this.grid.layout.rows ?? []).map((r) => r.fieldName));

    const matches = this.grid.writeRows.filter((row) => {
      // 1. Apply filter fields that are NOT also row dimensions.
      //    Apply if the field is stored in the write row (present in dimensionValues),
      //    regardless of dimTable — dimTable-only filters not in the WRITE table are skipped.
      for (const f of this.grid!.layout.filters) {
        if (rowFieldNames.has(f.fieldName)) continue; // already constrained by pathValues
        const sel = this.selectedFiltri[f.fieldName];
        if (sel && f.fieldName in row.dimensionValues && row.dimensionValues[f.fieldName] !== sel) return false;
      }
      // 2. Match row path dimensions
      for (const [field, val] of Object.entries(riga.pathValues)) {
        // Skip virtual grouping fields not stored in the write table
        if (!(field in row.dimensionValues)) continue;
        if (row.dimensionValues[field] !== val) return false;
      }
      // 3. Match column dimension
      if (!this.noColonnaMode && colonnaField && row.dimensionValues[colonnaField] !== colonnaValue) return false;
      return true;
    });

    if (matches.length === 0) return '';
    if (matches.length === 1) return matches[0].values[valoreField] ?? '';

    // Multiple matches (no filter selected, or filter fields not fully constrained):
    // aggregate according to the value field's aggregation function.
    const vfDef = this.grid.layout.values.find((v) => v.fieldName === valoreField);
    const agg = vfDef?.aggregation ?? 'SUM';

    if (agg === 'NONE') return matches[0].values[valoreField] ?? '';
    if (agg === 'COUNT') {
      return String(matches.filter((m) => m.values[valoreField] !== null && m.values[valoreField] !== '').length);
    }

    const nums = matches
      .map((m) => parseFloat(m.values[valoreField] ?? ''))
      .filter((n) => !isNaN(n));

    if (nums.length === 0) return '';
    if (agg === 'MAX') return String(Math.max(...nums));
    if (agg === 'MIN') return String(Math.min(...nums));
    if (agg === 'AVG') return String(nums.reduce((a, b) => a + b, 0) / nums.length);
    // SUM (default)
    return String(nums.reduce((a, b) => a + b, 0));
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
    // Block: embedded preview mode is read-only
    if (this.embedded) return;
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
    setTimeout(() => {
      const el = this.cellInputRef?.nativeElement;
      if (el) { el.focus(); el.select(); }
    }, 0);
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

  /**
   * Commit the current cell and move focus to the adjacent cell in the given direction.
   * Enter/ArrowDown → next row; Tab → next column cell; Shift+Tab → prev column cell; ArrowUp → prev row.
   */
  navigateAfterCommit(direction: 'down' | 'up' | 'right' | 'left'): void {
    if (!this.editing || !this.grid) { this.commitEdit(); return; }

    // Capture state BEFORE commit clears this.editing
    const pathKey  = this.editing.rigaPathKey;
    const cf       = this.editing.colonnaField;
    const cv       = this.editing.colonnaValue;
    const vf       = this.editing.valoreField;
    const rows     = this.visibleRighe;
    const rowIdx   = rows.findIndex((r) => this.pathKey(r.pathValues) === pathKey);
    const values   = this.grid.layout.values ?? [];
    const effCols  = this.effectiveColonne;

    this.commitEdit();

    if (rowIdx < 0) return;

    if (direction === 'down' || direction === 'up') {
      const delta = direction === 'down' ? 1 : -1;
      const nextIdx = rowIdx + delta;
      if (nextIdx >= 0 && nextIdx < rows.length) {
        setTimeout(() => this.startEdit(rows[nextIdx], cf, cv, vf), 0);
      }
      return;
    }

    // Tab / Shift+Tab: move across the flat (colonnaField × colonnaValue × valoreField) matrix
    const cellOrder: Array<{ cf: string; cv: string; vf: string }> = [];
    for (const col of effCols) {
      const cvs = this.noColonnaMode ? [''] : this.getColonneValues(col.fieldName);
      for (const colonnaValue of (cvs.length ? cvs : [''])) {
        for (const v of values) {
          cellOrder.push({ cf: col.fieldName, cv: colonnaValue, vf: v.fieldName });
        }
      }
    }

    const pos = cellOrder.findIndex((c) => c.cf === cf && c.cv === cv && c.vf === vf);
    if (pos < 0) return;

    const nextPos = direction === 'right'
      ? (pos + 1) % cellOrder.length
      : (pos - 1 + cellOrder.length) % cellOrder.length;

    const next = cellOrder[nextPos];
    setTimeout(() => this.startEdit(rows[rowIdx], next.cf, next.cv, next.vf), 0);
  }

  private buildDimValues(
    rigaPathValues: Record<string, string>, colonnaField: string, colonnaValue: string,
  ): Record<string, string> {
    if (!this.grid) return {};
    const dim: Record<string, string> = {};
    for (const f of this.grid.layout.filters) {
      // Include filter field in dim values if it's stored in the WRITE table:
      // - plain fields (no dimTable): always included
      // - paramTableId fields (even with dimTable): included (they are fact-level dims)
      // - pure dimTable-only fields (dimTable set, no paramTableId): excluded (not in WRITE table)
      if ((f as any).dimTable && !(f as any).paramTableId) continue;
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
    // Find the exact matching write row (strict match on all non-empty dim fields).
    // buildDimValues() includes filter field values in dim, so this correctly identifies
    // the specific row combination that was saved.
    const existing = this.grid.writeRows.find((row) => {
      for (const [field, val] of Object.entries(dim)) {
        if (!val) continue; // skip empty ancestor fields
        if (!(field in row.dimensionValues)) continue; // skip virtual fields
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
    setTimeout(() => {
      const el = this.cellInputRef?.nativeElement;
      if (el) { el.focus(); el.select(); }
    }, 0);
  }

  onGroupCellClick(event: MouseEvent, riga: DataEntryRigaOption, cf: string, cv: string, vf: string): void {
    event.stopPropagation();
    if (this.embedded) return;
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
    this.guidaPopup = { riga };
  }

  closeGuida(): void { this.guidaPopup = null; }

  sanitizeHtml(html: string | null): SafeHtml {
    if (!html) return '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // ── Filter search popup ────────────────────────────────────────────────────

  openFilterSearch(fieldName: string): void {
    this.filterSearchField = fieldName;
    this.filterSearchText = '';
  }

  closeFilterSearch(): void {
    this.filterSearchField = null;
    this.filterSearchText = '';
  }

  selectFilterValue(fieldName: string, value: string): void {
    this.selectedFiltri[fieldName] = value;
    this.closeFilterSearch();
    this.isRefiltering = true;
    setTimeout(() => {
      this.rebuildRollupCache();
      this.isRefiltering = false;
    }, 0);
  }

  get filteredFilterValues(): string[] {
    if (!this.filterSearchField) return [];
    const all = this.isHierarchyFilter(this.filterSearchField)
      ? this.getHierarchyFilterOptions(this.filterSearchField).map((o) => o.value)
      : this.getFiltriValues(this.filterSearchField);
    if (!this.filterSearchText.trim()) return all;
    const q = this.filterSearchText.trim().toLowerCase();
    if (this.isHierarchyFilter(this.filterSearchField)) {
      const opts = this.getHierarchyFilterOptions(this.filterSearchField);
      return opts.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)).map((o) => o.value);
    }
    return all.filter((v) => v.toLowerCase().includes(q));
  }

  getFilterValueLabel(fieldName: string, value: string): string {
    if (this.isHierarchyFilter(fieldName)) {
      const opt = this.getHierarchyFilterOptions(fieldName).find((o) => o.value === value);
      return opt?.label ?? value;
    }
    return value;
  }

  /** Number of leaf rows in the full dataset that match a given filter value. */
  getFilterValueRowCount(fieldName: string, value: string): number {
    if (!this.grid) return 0;
    const all = this.grid.rowOptions ?? [];
    const rowFieldNames = new Set((this.grid.layout.rows ?? []).map((r) => r.fieldName));
    const fDef = (this.grid.layout.filters ?? []).find((f: any) => f.fieldName === fieldName);

    if (fDef && (fDef as any).dimTable && !(fDef as any).paramTableId && !rowFieldNames.has(fieldName)) {
      // Dim-table-only filter (e.g. STAKEHOLDER): use filtriDimMapping
      const mapping = (this.grid as any).filtriDimMapping?.[fieldName];
      const primaryRigaField = (this.grid.layout.rows ?? [])
        .find((r: any) => !!(r as any).dimTable && !(r as any).paramTableId)?.fieldName;
      if (mapping && primaryRigaField) {
        const validKeys = new Set<string>(mapping[value] ?? []);
        return all.filter((r) => r.isLeaf && validKeys.has(r.pathValues[primaryRigaField] ?? '')).length;
      }
      return 0;
    }

    if (rowFieldNames.has(fieldName)) {
      return all.filter((r) => r.isLeaf && r.pathValues[fieldName] === value).length;
    }
    return 0;
  }

  // ── Menu helpers ───────────────────────────────────────────────────────────

  closeAllMenus(): void {
    this.rowCtxMenu  = null;
    this.cellCtxMenu = null;
    this.guidaPopup  = null;
    this.closeFilterSearch();
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
    const rowFieldNames = new Set((this.grid.layout.rows ?? []).map((r) => r.fieldName));

    // ── Build a pre-filtered write-row index for O(1) lookups ────────────────
    // 1. Determine which row-dim and colonna fields are actually stored in writeRows
    //    (virtual grouping fields like Foo_Grouping are not in dimensionValues).
    const colonnaFields = new Set(cols.map((c) => c.fieldName).filter(Boolean));
    const storedRowDimFields = new Set<string>();
    const storedColFields    = new Set<string>();
    for (const wr of this.grid.writeRows) {
      for (const k of Object.keys(wr.dimensionValues)) {
        if (rowFieldNames.has(k)) storedRowDimFields.add(k);
        if (colonnaFields.has(k)) storedColFields.add(k);
      }
    }

    // 2. Filter writeRows once by current filtri selections (skip row-dim fields).
    const activeFiltri = (this.grid.layout.filters ?? [])
      .filter((f) => !rowFieldNames.has(f.fieldName) && !!this.selectedFiltri[f.fieldName]);

    const preFiltered = this.grid.writeRows.filter((wr) => {
      for (const f of activeFiltri) {
        if (f.fieldName in wr.dimensionValues && wr.dimensionValues[f.fieldName] !== this.selectedFiltri[f.fieldName]) {
          return false;
        }
      }
      return true;
    });

    // 3. Build index: sorted-key of (storedRowDims + storedColFields) → aggregated values.
    //    Each write row contributes exactly one key (its own dimension combination).
    const idx = new Map<string, Record<string, number>>();
    const keyFields = [...storedRowDimFields, ...storedColFields].sort();

    const makeKey = (dimVals: Record<string, string>, extraColField?: string, extraColVal?: string): string =>
      keyFields
        .map((f) => {
          if (f === extraColField) return `${f}=${extraColVal ?? ''}`;
          return f in dimVals ? `${f}=${dimVals[f]}` : null;
        })
        .filter((s): s is string => s !== null)
        .join('|');

    for (const wr of preFiltered) {
      const key = makeKey(wr.dimensionValues);
      let agg = idx.get(key);
      if (!agg) { agg = {}; idx.set(key, agg); }
      for (const vf of vals) {
        const raw = wr.values[vf.fieldName];
        if (raw === null || raw === '' || raw === undefined) continue;
        const num = parseFloat(raw);
        if (!isNaN(num)) agg[vf.fieldName] = (agg[vf.fieldName] ?? 0) + num;
      }
    }

    // ── Scan leaf rows using the index ───────────────────────────────────────
    for (const row of flat) {
      if (!row.isLeaf) continue;
      let leafHasData = false;
      for (const c of cols) {
        const cfName = c.fieldName;
        const cvList = c.values.length ? c.values : [''];
        for (const cv of cvList) {
          const key = makeKey(row.pathValues, cfName || undefined, cfName ? cv : undefined);
          const agg = idx.get(key);
          if (!agg) continue;
          for (const vf of vals) {
            const num = agg[vf.fieldName];
            if (num === undefined || isNaN(num)) continue;
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

    // When in "too large" state, check if the new visible count is within threshold
    this.checkAndAutoLoadGrid();
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

  /** Total column span for the empty row (riga label col + data cols) */
  get totalColspan(): number { return 1 + this.totalDataColumns; }

  trackByRiga(_: number, r: DataEntryRigaOption): string {
    return r.depth + ':' + r.value + ':' + Object.values(r.pathValues).join('|');
  }
  trackByColonna(_: number, v: string): string { return v; }
  trackByValore(_: number, v: { fieldName: string }): string { return v.fieldName; }
  trackByFiltri(_: number, f: { fieldName: string }): string { return f.fieldName; }
  trackByLogId(_: number, e: CellHistoryEntry): number { return e.logId; }
}
