/**
 * SnapshotViewerComponent — displays the frozen-layout data entry grid for a published task.
 *
 * Uses the snapshot API endpoints (/snapshots/:id/grid and /snapshots/:id/cell)
 * instead of the live layout endpoints.  Supports:
 *  - Filter selectors
 *  - Inline cell editing (click-to-edit)
 *  - Auto-save on confirm
 *  - Row hierarchy with expand/collapse
 *  - Rollup subtotals for group rows
 *  - Formula rows (ƒ) using client-side formula engine
 *  - Compilation guide popup (🔍)
 *  - Column locking indicator
 *  - Number formatting
 *
 * WCAG: all interactive elements labelled; roles applied.
 */

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnInit, Output, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EsgConfiguratorService } from '../../../../services/esg-configurator.service';
import { evaluateFormula, extractReferences } from '../../../../services/formula-engine';
import {
  DataEntryGridResponse, DataEntryRowOption, SaveCellDto,
  RowApprovalDto, BulkRowApprovalDto,
} from '../../../../models/esg-configurator.models';

interface EditingCell {
  pathKey:         string;
  pathValues:      Record<string, string>;
  colonnaField:    string;
  colonnaValue:    string;
  valoreField:     string;
  current:         string;
  /** Original value when editing started — used to skip no-op saves */
  originalValue:   string;
}

interface GuidaPopup {
  riga: DataEntryRowOption;
}

interface RowCtxMenu {
  x: number; y: number;
  riga: DataEntryRowOption;
}

interface CellCtxMenu {
  x: number; y: number;
  riga:         DataEntryRowOption;
  colonnaField: string;
  colonnaValue: string;
  valoreField:  string;
  valoreLabel:  string;
  currentValue: string;
}

@Component({
  selector: 'snapshot-viewer',
  templateUrl: './snapshot-viewer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnapshotViewerComponent implements OnInit {
  @Input() snapshotId!: number;
  @Input() taskLabel = '';
  /** Breadcrumb segments — each with a label and optional click action. */
  @Input() breadcrumbs: Array<{ label: string; action?: () => void }> = [];
  /** JSON string of default filter values from the task — applied on initial load. */
  @Input() taskDefaultFilters?: string | null;
  /** JSON array of filter field names the admin has hidden from the user. */
  @Input() taskHiddenFilters?: string | null;

  /** Parsed set of hidden filter field names (lazy, from taskHiddenFilters). */
  get hiddenFilterSet(): Set<string> {
    if (!this.taskHiddenFilters) return new Set();
    try { return new Set(JSON.parse(this.taskHiddenFilters) as string[]); } catch { return new Set(); }
  }

  /** Layout filters that are visible to the user (not in hiddenFilterSet). */
  get visibleLayoutFilters(): any[] {
    return this.layoutFilters.filter((f: any) => !this.hiddenFilterSet.has(f.fieldName));
  }

  @Output() closed = new EventEmitter<void>();

  grid:      DataEntryGridResponse | null = null;
  isLoading  = false;
  errorMsg:  string | null = null;
  isSaving   = false;
  saveError: string | null = null;

  selectedFiltri: Record<string, string> = {};
  editing: EditingCell | null = null;

  /** Toggle: hide rows that have no value (direct or rollup) */
  showOnlyWithData = false;

  /** True while rebuildRollupCache is deferred (spinner shown on the grid) */
  isComputingFilter = false;

  /** Collapsible params/filters section */
  paramsCollapsed = false;

  /** Show/hide the SQL debug panel */
  showSqlPanel = false;

  /** Toggle between filtered (true) and raw (false) SQL view */
  sqlShowFiltered = true;

  /**
   * Returns each debug SQL wrapped in a CTE with WHERE conditions
   * that mirror the currently active client-side filters.
   * Example:
   *   WITH _base AS ( <original sql> )
   *   SELECT * FROM _base
   *   WHERE [Anno] = '2025'
   *     AND [StrutturaRefKPI] = 'Acantus'
   */
  get debugSqlFiltered(): string[] {
    const raw = this.grid?.debugSql;
    if (!raw?.length) return [];

    // Build the list of active (non-empty) filter conditions
    const conditions: string[] = [];
    for (const [field, val] of Object.entries(this.selectedFiltri)) {
      if (!val) continue;
      // Escape single quotes in the value
      const escaped = val.replace(/'/g, "''");
      conditions.push(`  [${field}] = '${escaped}'`);
    }

    return raw.map((sql) => {
      if (conditions.length === 0) return sql;
      // Strip comment header (lines starting with --)
      const lines = sql.split('\n');
      const commentLines = lines.filter((l) => l.trimStart().startsWith('--'));
      const sqlBody     = lines.filter((l) => !l.trimStart().startsWith('--')).join('\n').trim();
      const comment     = commentLines.length ? commentLines.join('\n') + '\n' : '';
      return (
        comment +
        `WITH _base AS (\n  ${sqlBody.replace(/\n/g, '\n  ')}\n)\n` +
        `SELECT * FROM _base\nWHERE\n` +
        conditions.join('\n  AND ')
      );
    });
  }

  // ── Excel export / import ────────────────────────────────────────────────────
  /** True while an export HTTP call is in flight */
  isExporting: 'grid' | 'pivot' | null = null;

  /** True while an import HTTP call is in flight */
  isImporting = false;

  /** Result of the last import attempt */
  importResult: { imported: number; errors: string[] } | null = null;

  /** Filter search popup state */
  filterSearchField: string | null = null;
  filterSearchText = '';

  // ── Save mode: auto (immediate) or manual (batch) ──────────────────────────
  saveMode: 'auto' | 'manual' = 'auto';
  isSavingPending = false;

  /** Pending changes in manual mode: key = unique cell key → dto */
  private pendingChanges = new Map<string, {
    pathValues:   Record<string, string>;
    colonnaField: string;
    colonnaValue: string;
    valoreField:  string;
    value:        string;
  }>();

  get pendingCount(): number { return this.pendingChanges.size; }

  setSaveMode(mode: 'auto' | 'manual'): void {
    this.saveMode = mode;
  }

  /** Cells currently being saved (in-flight HTTP): key = pathKey||cf||cv||vf */
  savingCells = new Set<string>();

  /** Cells whose last save attempt failed: shown in amber/yellow */
  failedCells = new Set<string>();

  /** Set of pathKey strings for expanded non-leaf rows */
  expandedGroups = new Set<string>();

  /** Compilation guide popup state */
  guidaPopup: GuidaPopup | null = null;

  /** Row right-click context menu */
  rowCtxMenu: RowCtxMenu | null = null;

  /** Cell right-click context menu */
  cellCtxMenu: CellCtxMenu | null = null;

  // ── Row Approval ─────────────────────────────────────────────────────────────
  /** Set of sorted-JSON dimension keys for approved (locked) rows */
  approvedKeys = new Set<string>();
  approvalLoading = false;

  @ViewChild('svCellInputRef')   private svCellInputRef?:   ElementRef<HTMLInputElement>;
  @ViewChild('svGridRef')        private svGridRef?:        ElementRef<HTMLTableElement>;
  @ViewChild('svExcelImportRef') private svExcelImportRef?: ElementRef<HTMLInputElement>;

  /** Bottom-up rollup sums: key = `pathKey||cf||cv||vf` → numeric sum */
  private rollupCache = new Map<string, number>();

  /** Path keys of nodes that have at least one value (direct leaf or rollup) */
  private nodesWithData = new Set<string>();

  /** Column combo keys (`${fieldName}||${value}`) that have at least one numeric value */
  private colsWithData = new Set<string>();

  /** Debounce handle for rebuildRollupCache */
  private rollupDebounce: ReturnType<typeof setTimeout> | null = null;

  /** Cached result of visibleRows computation; null = needs recompute */
  private _visibleRowsCache: DataEntryRowOption[] | null = null;

  // ── Performance caches ────────────────────────────────────────────────────

  /** WeakMap cache: DataEntryRowOption → pathKey string */
  private rowPathKeyCache = new WeakMap<DataEntryRowOption, string>();

  /** WeakMap cache: DataEntryRowOption → approvalPathKey string */
  private rowApprovalKeyCache = new WeakMap<DataEntryRowOption, string>();

  /** Memo cache for getCellValue; invalidated when writeRows or selectedFiltri change */
  private cellValueCache = new Map<string, string>();

  /** Cached column combinations array; rebuilt on load */
  private _columnCombinations: Array<{ fieldName: string; value: string }> = [];

  /** Pre-built set of row field names for _computeCellValue */
  private _rowFieldNames: Set<string> = new Set();

  constructor(
    private svc: EsgConfiguratorService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.svc.getSnapshotGrid(this.snapshotId).subscribe({
      next: (g) => {
        this.grid      = g;
        this.isLoading = false;
        // Initialise approval keys from response
        this.approvedKeys = new Set(g.approvedRows ?? []);
        const filters = g.layout.filters ?? (g.layout as any).filtri ?? [];
        // Parse task-level default filters (set once at load, not overwriting user selections)
        let taskDefaults: Record<string, string> = {};
        if (this.taskDefaultFilters) {
          try { taskDefaults = JSON.parse(this.taskDefaultFilters); } catch { /* ignore */ }
        }
        filters.forEach((f: any) => {
          if (!(f.fieldName in this.selectedFiltri)) {
            this.selectedFiltri[f.fieldName] = taskDefaults[f.fieldName] ?? '';
          }
        });
        // Auto-expand all non-leaf groups so multi-level row hierarchies are
        // immediately visible.  Fall back to only top-level expansion for very
        // deep trees (> 100 non-leaf nodes) to avoid performance issues.
        const nonLeafGroups = (g.rowOptions ?? []).filter((r) => !r.isLeaf);
        if (nonLeafGroups.length <= 100) {
          nonLeafGroups.forEach((r) => this.expandedGroups.add(this.pathKey(r.pathValues)));
        } else {
          const topGroups = (g.rowOptions ?? []).filter((r) => r.depth === 0 && !r.isLeaf);
          topGroups.forEach((r) => this.expandedGroups.add(this.pathKey(r.pathValues)));
        }
        this.buildColumnCombinations();
        this.buildRowFieldNames();
        this.invalidateCellValueCache();
        // detectChanges() runs synchronously, ensuring the grid renders immediately
        // regardless of whether the subscription runs inside or outside NgZone.
        // Rollup subtotals are intentionally empty on first render; they are computed
        // lazily the first time the user changes a filter or toggles showOnlyWithData.
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMsg = 'Impossibile caricare lo snapshot.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Layout helpers ──────────────────────────────────────────────────────────

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

  get layoutValues(): Array<{ fieldName: string; label: string; aggregation: string }> {
    if (!this.grid) return [];
    return this.grid.layout.values ?? (this.grid.layout as any).valori ?? [];
  }

  get rigaHeaderLabel(): string {
    return this.layoutRows.map((r) => r.label).join(' / ') || 'Row';
  }

  get isMultiLevel(): boolean {
    const rows = this.layoutRows;
    if (rows.length > 1) return true;
    return rows.length === 1 && !!(rows[0] as any).dimTable;
  }

  getFiltriValues(fn: string): string[] {
    return this.grid?.filterOptions?.find((f: any) => f.fieldName === fn)?.values
      ?? (this.grid as any)?.filtriOptions?.find((f: any) => f.fieldName === fn)?.values
      ?? [];
  }

  // ── Row visibility (hierarchy) ──────────────────────────────────────────────

  /** Invalidate the visibleRows cache; call whenever filtri/expand/data changes */
  invalidateVisibleRows(): void { this._visibleRowsCache = null; }

  /**
   * Toggles showOnlyWithData, showing a spinner while the rollup cache
   * (which drives both row and column filtering) is rebuilt.
   * A brief setTimeout(0) lets Angular render the spinner before the CPU work.
   */
  toggleShowOnlyWithData(): void {
    this.isComputingFilter = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.showOnlyWithData = !this.showOnlyWithData;
      this.rebuildRollupCache(); // rebuilds nodesWithData, colsWithData, invalidates caches
      this.isComputingFilter = false;
      this.cdr.markForCheck();
    }, 0);
  }

  /** Select a filter value, rebuild rollup/column data caches and invalidate rows */
  selectFiltro(fieldName: string, value: string): void {
    this.selectedFiltri[fieldName] = value;
    this.invalidateCellValueCache();
    this._visibleRowsCache = null;
    this.cdr.markForCheck();
    // Rebuild rollup asynchronously to avoid blocking the UI on large datasets.
    this.scheduleRollupRebuild();
  }

  get visibleRows(): DataEntryRowOption[] {
    if (this._visibleRowsCache !== null) return this._visibleRowsCache;
    this._visibleRowsCache = this._computeVisibleRows();
    return this._visibleRowsCache;
  }

  private _computeVisibleRows(): DataEntryRowOption[] {
    if (!this.grid) return [];
    const all = this.grid.rowOptions ?? (this.grid as any).righeOptions ?? [];
    const righeLayout = this.layoutRows;

    // Build depth → role map: detail-role levels are auto-expanded (no click needed).
    const depthRoles: ('grouping' | 'detail')[] = righeLayout.map((r: any) => r.role ?? 'grouping');
    const isDetailDepth = (d: number) => depthRoles[d] === 'detail';

    const isDimTableMode = righeLayout.length === 1 && !!(righeLayout[0] as any).dimTable;
    const skipDepths: number = isDimTableMode ? ((righeLayout[0] as any).skipDepths ?? 0) : 0;

    const rowFieldNames = new Set(righeLayout.map((r: any) => r.fieldName));

    // ── Step 1: apply data + selectedFiltri filters WITHOUT expansion check ────
    // We use this to build groupsWithChildren so that depth-0 group headers are
    // only pruned when they truly have no children matching active filters —
    // NOT simply because their children happen to be collapsed right now.
    const applyFilters = (rows: DataEntryRowOption[]): DataEntryRowOption[] => {
      let result = rows.filter((r: DataEntryRowOption) => {
        if (this.showOnlyWithData && !this.nodesWithData.has(this.pathKey(r.pathValues))) return false;
        return true;
      });
      for (const f of this.layoutFilters) {
        const selVal = this.selectedFiltri[f.fieldName];
        if (!selVal) continue;
        if (rowFieldNames.has(f.fieldName)) {
          result = result.filter((r: DataEntryRowOption) => {
            const rowVal = r.pathValues[f.fieldName];
            return rowVal === undefined || rowVal === selVal;
          });
        } else if ((f as any).dimTable && !(f as any).paramTableId) {
          const mapping = this.grid?.filtriDimMapping?.[f.fieldName];
          if (mapping) {
            const validRowKeys = new Set<string>(mapping[selVal] ?? []);
            const primaryRigaField = righeLayout.find((r: any) => !!(r as any).dimTable && !(r as any).paramTableId)?.fieldName;
            if (primaryRigaField) {
              result = result.filter((r: DataEntryRowOption) => {
                const rv = r.pathValues[primaryRigaField];
                return rv === undefined || validRowKeys.has(rv);
              });
            }
          }
        }
      }
      return result;
    };

    const allFiltered = applyFilters(all);

    // ── Step 2: build groupsWithChildren from filter-only set (no expansion) ──
    // A depth-0 header is kept iff at least one child row survives active filters.
    const groupsWithChildren = new Set<string>();
    for (const r of allFiltered) {
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

    // ── Step 3: apply expansion visibility filter ─────────────────────────────
    let visible = allFiltered.filter((r: DataEntryRowOption) => {
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
        return r.ancestorKeys.every((ak: string, idx: number) => {
          if (isDetailDepth(idx)) return true;
          return this.expandedGroups.has(ak);
        });
      }

      for (let d = 0; d < r.depth; d++) {
        if (isDetailDepth(d)) continue; // detail role: always expanded
        const ancestorPath: Record<string, string> = {};
        for (let i = 0; i <= d; i++) {
          const fn = righeLayout[i]?.fieldName;
          if (!fn) return false;
          const val = r.pathValues[fn];
          if (val === undefined) return false;
          ancestorPath[fn] = val;
        }
        if (!this.expandedGroups.has(this.pathKey(ancestorPath))) return false;
      }
      return true;
    });

    // ── Step 4: prune depth-0 group headers whose children were all filtered out ─
    // Only meaningful in multi-level hierarchies (depth > 0 rows exist in the
    // filtered set).  In flat dim-table mode every row IS a leaf at depth 0 —
    // applying the prune would remove every row because groupsWithChildren is empty.
    const hasMultiLevel = allFiltered.some((r: DataEntryRowOption) => r.depth > 0);
    if (hasMultiLevel) {
      visible = visible.filter((r: DataEntryRowOption) => r.depth !== 0 || groupsWithChildren.has(this.pathKey(r.pathValues)));
    }

    return visible;
  }

  isDetailRole(riga: DataEntryRowOption): boolean {
    const item = (this.layoutRows ?? []).find((r: any) => r.fieldName === riga.fieldName);
    return (item as any)?.role === 'detail';
  }

  isExpanded(riga: DataEntryRowOption): boolean {
    return this.expandedGroups.has(this.pathKey(riga.pathValues));
  }

  toggleGroup(riga: DataEntryRowOption): void {
    const key = this.pathKey(riga.pathValues);
    if (this.expandedGroups.has(key)) this.expandedGroups.delete(key);
    else this.expandedGroups.add(key);
    this._visibleRowsCache = null;
  }

  // ── Column locking ──────────────────────────────────────────────────────────

  isColumnMemberLocked(colonnaField: string, colonnaValue: string): boolean {
    if (!this.grid || !colonnaField) return false;
    const col = this.layoutColumns.find((c) => c.fieldName === colonnaField);
    return col?.lockedMembers?.includes(colonnaValue) ?? false;
  }

  // ── Row Approval ─────────────────────────────────────────────────────────────

  /** Sorted-JSON key matching the backend DimensionsJson format; cached per row object */
  approvalPathKey(riga: DataEntryRowOption): string {
    const cached = this.rowApprovalKeyCache.get(riga);
    if (cached !== undefined) return cached;
    const key = JSON.stringify(
      Object.fromEntries(Object.entries(riga.pathValues).sort(([a], [b]) => a.localeCompare(b))),
    );
    this.rowApprovalKeyCache.set(riga, key);
    return key;
  }

  isRowApproved(riga: DataEntryRowOption): boolean {
    return this.approvedKeys.has(this.approvalPathKey(riga));
  }

  toggleRowApproval(riga: DataEntryRowOption): void {
    const key = this.approvalPathKey(riga);
    const newApproved = !this.approvedKeys.has(key);
    this.approvalLoading = true;
    const dto: RowApprovalDto = { dimensionsJson: key, approved: newApproved };
    this.svc.setRowApproval(this.snapshotId, dto).subscribe({
      next: () => {
        if (newApproved) this.approvedKeys.add(key);
        else this.approvedKeys.delete(key);
        this.approvalLoading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.approvalLoading = false; this.cdr.markForCheck(); },
    });
  }

  toggleGroupApproval(riga: DataEntryRowOption): void {
    const all = this.grid?.rowOptions ?? [];
    const groupKey = this.pathKey(riga.pathValues);
    const descendants = all.filter(
      (r) => r !== riga && (r.ancestorKeys ?? []).includes(groupKey),
    );
    const keysToToggle = [riga, ...descendants].map((r) => this.approvalPathKey(r));
    const newApproved = !this.isRowApproved(riga);
    this.approvalLoading = true;
    const dto: BulkRowApprovalDto = { dimensionsJsonArray: keysToToggle, approved: newApproved };
    this.svc.bulkSetRowApproval(this.snapshotId, dto).subscribe({
      next: () => {
        keysToToggle.forEach((k) => {
          if (newApproved) this.approvedKeys.add(k);
          else this.approvedKeys.delete(k);
        });
        this.approvalLoading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.approvalLoading = false; this.cdr.markForCheck(); },
    });
  }

  // ── Column combinations ─────────────────────────────────────────────────────

  private buildColumnCombinations(): void {
    if (!this.grid) { this._columnCombinations = []; return; }
    const cols = this.grid.columnOptions ?? (this.grid as any).colonneOptions ?? [];
    const col = cols[0];
    this._columnCombinations = col ? col.values.map((v: string) => ({ fieldName: col.fieldName, value: v })) : [];
  }

  get columnCombinations(): Array<{ fieldName: string; value: string }> {
    return this._columnCombinations.filter((cc) => {
      // "Solo con dati": hide columns with no numeric data in any row
      if (this.showOnlyWithData && !this.colsWithData.has(`${cc.fieldName}||${cc.value}`)) return false;

      // Direct column-name filter (e.g. Entita is itself in filtri)
      const directSel = this.selectedFiltri[cc.fieldName];
      if (directSel && cc.value !== directSel) return false;

      // Indirect column filter via filtriColonneMapping
      // (e.g. StrutturaRefEntita filters which Entita columns are visible)
      const colMapping = (this.grid as any)?.filtriColonneMapping as
        Record<string, Record<string, string[]>> | undefined;
      if (colMapping) {
        for (const [filtroField, byValue] of Object.entries(colMapping)) {
          const selVal = this.selectedFiltri[filtroField];
          if (!selVal) continue;
          const allowed = byValue[selVal];
          if (allowed && !allowed.includes(cc.value)) return false;
        }
      }

      return true;
    });
  }

  get noColonnaMode(): boolean {
    return this.columnCombinations.length === 0;
  }

  // ── Formula rows ────────────────────────────────────────────────────────────

  isFormulaRow(riga: DataEntryRowOption): boolean {
    return !!(riga.paramRow?.isFormula && riga.paramRow?.formula);
  }

  getFormulaValue(riga: DataEntryRowOption, cf: string, cv: string, vf: string): string {
    const formula = riga.paramRow?.formula;
    if (!formula) return '';
    const refs = extractReferences(formula);
    if (!refs.length) return '';

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
    const vfDef = this.layoutValues.find((v) => v.fieldName === vf);
    return this.formatCellDisplay(String(result), vfDef?.aggregation ?? 'SUM');
  }

  // ── Cell value lookup ───────────────────────────────────────────────────────

  private invalidateCellValueCache(): void { this.cellValueCache.clear(); }

  private buildRowFieldNames(): void {
    this._rowFieldNames = new Set((this.layoutRows ?? []).map((r: any) => r.fieldName));
  }

  getCellValue(
    riga: DataEntryRowOption,
    colonnaField: string, colonnaValue: string,
    valoreField: string,
  ): string {
    const cacheKey = `${this.getRowPathKey(riga)}||${colonnaField}||${colonnaValue}||${valoreField}`;
    if (this.cellValueCache.has(cacheKey)) return this.cellValueCache.get(cacheKey)!;
    const result = this._computeCellValue(riga, colonnaField, colonnaValue, valoreField);
    this.cellValueCache.set(cacheKey, result);
    return result;
  }

  private _computeCellValue(
    riga: DataEntryRowOption,
    colonnaField: string, colonnaValue: string,
    valoreField: string,
  ): string {
    if (!this.grid) return '';

    // Fields that are also in the rows zone are already constrained by riga.pathValues.
    // Skip the filter check for them to avoid conflicts (e.g. a grouping field that is
    // both a row dimension and a filter would zero-out cells for non-matching filter values
    // even though those rows are still visible in the grid).
    const rowFieldNames = this._rowFieldNames;

    const matches = this.grid.writeRows.filter((row) => {
      // Apply active filters: skip fields already constrained by pathValues (row zone).
      // For dimTable fields: apply IF the field exists in the write row's dimensionValues
      // (meaning it was physically stored in the WRITE table after SELECT *).
      for (const f of this.layoutFilters) {
        if (rowFieldNames.has(f.fieldName)) continue; // constrained by pathValues
        const sel = this.selectedFiltri[f.fieldName];
        if (!sel) continue;
        if (f.fieldName in row.dimensionValues && row.dimensionValues[f.fieldName] !== sel) return false;
      }
      // Match row identity via pathValues. Fields not stored in the WRITE table
      // (hierarchy-only lookups) are skipped — they cannot be matched at write-row level.
      for (const [field, val] of Object.entries(riga.pathValues)) {
        if (!(field in row.dimensionValues)) continue;
        if (row.dimensionValues[field] !== val) return false;
      }
      if (!this.noColonnaMode && colonnaField && row.dimensionValues[colonnaField] !== colonnaValue) return false;
      return true;
    });

    if (matches.length === 0) return '';
    if (matches.length === 1) return matches[0].values[valoreField] ?? '';

    // Multiple matches: aggregate according to the value field's aggregation function
    const vfDef = this.layoutValues.find((v) => v.fieldName === valoreField);
    const agg = (vfDef?.aggregation ?? 'SUM').toUpperCase();

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

  // ── Rollup subtotals ────────────────────────────────────────────────────────

  /** Schedule a rebuild; collapses rapid successive saves into one pass */
  scheduleRollupRebuild(): void {
    if (this.rollupDebounce !== null) clearTimeout(this.rollupDebounce);
    this.ngZone.runOutsideAngular(() => {
      this.rollupDebounce = setTimeout(() => {
        this.rollupDebounce = null;
        this.invalidateCellValueCache();
        this.rebuildRollupCache();
        this.ngZone.run(() => this.cdr.markForCheck());
      }, 150);
    });
  }

  rebuildRollupCache(): void {
    this.invalidateCellValueCache();
    this.rollupCache.clear();
    this.nodesWithData.clear();
    this.colsWithData.clear();
    this._visibleRowsCache = null;
    if (!this.grid) return;

    const flat = this.grid.rowOptions ?? [];
    // Read column options directly (not via noColonnaMode getter) to avoid circular
    // dependency: noColonnaMode → columnCombinations → colsWithData (being built here).
    const colOptions = this.grid.columnOptions ?? (this.grid as any).colonneOptions ?? [];
    const cols = colOptions.length === 0
      ? [{ fieldName: '', values: [''] }]
      : colOptions;
    const vals = this.layoutValues;

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
            this.colsWithData.add(`${cfName}||${cv}`);
            for (const ak of (row.ancestorKeys ?? [])) {
              const k = `${ak}||${cfName}||${cv}||${vf.fieldName}`;
              this.rollupCache.set(k, (this.rollupCache.get(k) ?? 0) + num);
            }
          }
        }
      }
      if (leafHasData) this.nodesWithData.add(this.pathKey(row.pathValues));
    }

    // Mark group nodes that have at least one descendant with data
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

  getDisplayValue(riga: DataEntryRowOption, cf: string, cv: string, vf: string): string {
    if (this.isFormulaRow(riga)) return this.getFormulaValue(riga, cf, cv, vf);
    const direct = this.getCellValue(riga, cf, cv, vf);
    if (direct !== '') {
      const vfDef = this.layoutValues.find((v) => v.fieldName === vf);
      return this.formatCellDisplay(direct, vfDef?.aggregation ?? 'SUM', direct);
    }
    if (!riga.isLeaf) {
      const k = `${this.getRowPathKey(riga)}||${cf}||${cv}||${vf}`;
      const rollup = this.rollupCache.get(k);
      if (rollup !== undefined) {
        const vfDef = this.layoutValues.find((v) => v.fieldName === vf);
        return this.formatCellDisplay(String(rollup), vfDef?.aggregation ?? 'SUM');
      }
    }
    return '';
  }

  isRollupValue(riga: DataEntryRowOption, cf: string, cv: string, vf: string): boolean {
    if (riga.isLeaf || this.isFormulaRow(riga)) return false;
    if (this.getCellValue(riga, cf, cv, vf) !== '') return false;
    const k = `${this.getRowPathKey(riga)}||${cf}||${cv}||${vf}`;
    return this.rollupCache.has(k);
  }

  // ── Number formatting ───────────────────────────────────────────────────────

  formatCellDisplay(rawValue: string, aggregation: string, emptyFallback = ''): string {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return emptyFallback;
    const num = parseFloat(rawValue);
    if (isNaN(num)) return rawValue;
    const locale = navigator.language || 'it-IT';
    if (aggregation === 'COUNT') {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(num);
    }
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  }

  // ── Compilation guide popup ─────────────────────────────────────────────────

  openGuida(event: MouseEvent, riga: DataEntryRowOption): void {
    event.preventDefault();
    event.stopPropagation();
    if (!riga.paramRow?.compilationGuide) return;
    this.guidaPopup = { riga };
  }

  closeGuida(): void { this.guidaPopup = null; }

  // ── Right-click context menus ───────────────────────────────────────────────

  onRowRightClick(event: MouseEvent, riga: DataEntryRowOption): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeAllMenus();
    this.rowCtxMenu = { x: event.clientX, y: event.clientY, riga };
  }

  onCellRightClick(event: MouseEvent, riga: DataEntryRowOption, cf: string, cv: string, vf: { fieldName: string; label: string }): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeAllMenus();
    this.cellCtxMenu = {
      x: event.clientX, y: event.clientY, riga,
      colonnaField: cf, colonnaValue: cv,
      valoreField:  vf.fieldName, valoreLabel: vf.label,
      currentValue: this.getDisplayValue(riga, cf, cv, vf.fieldName),
    };
  }

  closeAllMenus(): void {
    this.rowCtxMenu  = null;
    this.cellCtxMenu = null;
    this.guidaPopup  = null;
    this.closeFilterSearch();
  }

  // ── Filter search popup ────────────────────────────────────────────────────

  openFilterSearch(fieldName: string): void {
    if (this.filterSearchField === fieldName) {
      this.closeFilterSearch();
      return;
    }
    this.filterSearchField = fieldName;
    this.filterSearchText = '';
  }

  closeFilterSearch(): void {
    this.filterSearchField = null;
    this.filterSearchText = '';
  }

  get filteredFilterValues(): string[] {
    if (!this.filterSearchField) return [];
    const all = this.getFiltriValues(this.filterSearchField);
    const filtered = this.filterSearchText
      ? all.filter((v) => v.toLowerCase().includes(this.filterSearchText.toLowerCase()))
      : all;
    const field = this.filterSearchField;
    return [...filtered].sort((a, b) =>
      this.getFilterValueRowCount(field, b) - this.getFilterValueRowCount(field, a)
    );
  }

  /** Number of leaf rows in the full dataset that match a given filter value. */
  getFilterValueRowCount(fieldName: string, value: string): number {
    if (!this.grid) return 0;
    const all: DataEntryRowOption[] = this.grid.rowOptions ?? (this.grid as any).righeOptions ?? [];
    const rowFieldNames = new Set(this.layoutRows.map((r: any) => r.fieldName));
    const fDef = this.layoutFilters.find((f: any) => f.fieldName === fieldName);

    if (fDef && (fDef as any).dimTable && !(fDef as any).paramTableId && !rowFieldNames.has(fieldName)) {
      const mapping = this.grid?.filtriDimMapping?.[fieldName];
      const primaryRigaField = this.layoutRows
        .find((r: any) => !!(r as any).dimTable && !(r as any).paramTableId)?.fieldName;
      if (mapping && primaryRigaField) {
        const validKeys = new Set<string>(mapping[value] ?? []);
        return all.filter((r: DataEntryRowOption) => r.isLeaf && validKeys.has(r.pathValues[primaryRigaField] ?? '')).length;
      }
      return 0;
    }

    if (rowFieldNames.has(fieldName)) {
      return all.filter((r: DataEntryRowOption) => r.isLeaf && r.pathValues[fieldName] === value).length;
    }
    return 0;
  }

  sanitizeHtml(html: string | null): SafeHtml {
    if (!html) return '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  stripHtml(html: string | null): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  }

  // ── Excel export / import ────────────────────────────────────────────────────

  /** Exports the current grid to an .xlsx file and triggers a browser download. */
  exportExcel(mode: 'grid' | 'pivot'): void {
    if (this.isExporting) return;
    this.isExporting = mode;
    this.cdr.markForCheck();

    // Build active filters map (only non-empty values)
    const filters: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.selectedFiltri)) {
      if (v) filters[k] = v;
    }

    this.svc.exportSnapshotExcel(this.snapshotId, mode, filters).subscribe({
      next: (blob) => {
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        const safe = this.taskLabel.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40);
        const tag  = mode === 'pivot' ? 'Pivot' : 'Griglia';
        a.download = `ESG_Snap${this.snapshotId}_${safe}_${tag}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.isExporting = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isExporting = null;
        this.cdr.markForCheck();
      },
    });
  }

  /** Opens the hidden file input to trigger the import flow. */
  triggerImportExcel(): void {
    this.svExcelImportRef?.nativeElement.click();
  }

  /** Handles file selection from the hidden import input. */
  importExcel(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    // Reset input so same file can be re-selected
    input.value = '';
    if (!file) return;

    this.isImporting  = true;
    this.importResult = null;
    this.cdr.markForCheck();

    this.svc.importSnapshotExcel(this.snapshotId, file).subscribe({
      next: (result) => {
        this.importResult = result;
        this.isImporting  = false;
        // Reload grid to show imported values
        if (result.imported > 0) {
          this.load();
        } else {
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        this.importResult = {
          imported: 0,
          errors: [err?.error?.error ?? 'Errore durante l\'importazione'],
        };
        this.isImporting = false;
        this.cdr.markForCheck();
      },
    });
  }

  dismissImportResult(): void {
    this.importResult = null;
    this.cdr.markForCheck();
  }

  // ── Document events ─────────────────────────────────────────────────────────

  @HostListener('document:click')
  onDocClick(): void { this.closeAllMenus(); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeAllMenus(); this.editing = null; }

  // ── Cell editing ────────────────────────────────────────────────────────────

  pathKey(pathValues: Record<string, string>): string {
    return Object.entries(pathValues).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`).join('|');
  }

  /** Cached per-row path key; avoids recomputing Object.entries/sort/join on each CD cycle */
  getRowPathKey(riga: DataEntryRowOption): string {
    const cached = this.rowPathKeyCache.get(riga);
    if (cached !== undefined) return cached;
    const key = Object.entries(riga.pathValues).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`).join('|');
    this.rowPathKeyCache.set(riga, key);
    return key;
  }

  isEditing(riga: DataEntryRowOption, cf: string, cv: string, vf: string): boolean {
    return this.editing !== null
      && this.editing.pathKey === this.getRowPathKey(riga)
      && this.editing.colonnaField === cf
      && this.editing.colonnaValue === cv
      && this.editing.valoreField  === vf;
  }

  /** True while an HTTP save is in-flight for this cell. */
  isCellSaving(riga: DataEntryRowOption, cf: string, cv: string, vf: string): boolean {
    return this.savingCells.has(`${this.getRowPathKey(riga)}||${cf}||${cv}||${vf}`);
  }

  /** True when the last save attempt for this cell failed. */
  isCellFailed(riga: DataEntryRowOption, cf: string, cv: string, vf: string): boolean {
    return this.failedCells.has(`${this.getRowPathKey(riga)}||${cf}||${cv}||${vf}`);
  }

  /**
   * Enter edit mode on a cell.
   * @param initialValue  When provided (e.g. user started typing), pre-fill the input with this
   *                      value instead of the current cell value, and place cursor at the end.
   *                      Omit (or pass undefined) to load the existing value and select-all.
   */
  startEdit(riga: DataEntryRowOption, cf: string, cv: string, vf: string, initialValue?: string): void {
    if (!riga.isLeaf) return;
    if (this.isFormulaRow(riga)) return;
    if (this.isColumnMemberLocked(cf, cv)) return;
    if (this.isRowApproved(riga)) return;
    const selectAll    = initialValue === undefined;
    const storedValue  = this.getCellValue(riga, cf, cv, vf);
    this.editing = {
      pathKey:       this.pathKey(riga.pathValues),
      pathValues:    riga.pathValues,
      colonnaField:  cf,
      colonnaValue:  cv,
      valoreField:   vf,
      current:       initialValue !== undefined ? initialValue : storedValue,
      originalValue: storedValue,
    };
    // With OnPush the new editing state must be explicitly scheduled for check
    this.cdr.markForCheck();
    setTimeout(() => {
      const el = this.svCellInputRef?.nativeElement;
      if (!el) return;
      el.focus();
      if (selectAll) {
        el.select();
      } else {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 0);
  }

  /**
   * Handle keydown on a focused (non-editing) cell td.
   *
   * Navigation (no edit mode):
   *   Arrow keys          → move focus to adjacent cell
   *   Tab / Shift+Tab     → native browser tab order (DOM order, left→right then next row)
   *
   * Enter edit mode:
   *   Enter / F2          → edit with existing value, select-all
   *   Backspace / Delete  → edit with empty value
   *   Any printable char  → edit pre-filled with that character
   */
  onCellKeydown(event: KeyboardEvent, riga: DataEntryRowOption, cf: string, cv: string, vf: string): void {
    // Already editing this cell — input handles everything itself
    if (this.isEditing(riga, cf, cv, vf)) return;

    // Ignore Ctrl / Cmd / Alt shortcuts
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // ── Arrow-key navigation ──────────────────────────────────────────────────
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' ||
        event.key === 'ArrowDown'  || event.key === 'ArrowUp') {
      event.preventDefault();
      const { ri, ci } = this.getCellCoords(riga, cf, cv, vf);
      const totalRows = this.visibleRows.length;
      const totalCols = this.noColonnaMode
        ? this.layoutValues.length
        : this.columnCombinations.length * this.layoutValues.length;

      let targetRi = ri;
      let targetCi = ci;

      switch (event.key) {
        case 'ArrowRight': targetCi = Math.min(ci + 1, totalCols - 1); break;
        case 'ArrowLeft':  targetCi = Math.max(ci - 1, 0);             break;
        case 'ArrowDown':  targetRi = Math.min(ri + 1, totalRows - 1); break;
        case 'ArrowUp':    targetRi = Math.max(ri - 1, 0);             break;
      }

      if (targetRi !== ri || targetCi !== ci) this.focusCell(targetRi, targetCi);
      return;
    }

    // ── Enter edit mode ───────────────────────────────────────────────────────
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      this.startEdit(riga, cf, cv, vf);          // existing value, select-all
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      this.startEdit(riga, cf, cv, vf, '');      // clear
      return;
    }

    // Single printable character (digit, letter, symbol…)
    if (event.key.length === 1) {
      event.preventDefault();
      this.startEdit(riga, cf, cv, vf, event.key);
    }
  }

  /**
   * Returns the (row-index, col-index) of a cell inside the visible grid,
   * where col-index runs across columnCombinations × layoutValues (left to right).
   */
  private getCellCoords(riga: DataEntryRowOption, cf: string, cv: string, vf: string): { ri: number; ci: number } {
    const ri = this.visibleRows.findIndex((r) => this.getRowPathKey(r) === this.getRowPathKey(riga));

    let ci: number;
    if (this.noColonnaMode) {
      ci = this.layoutValues.findIndex((v) => v.fieldName === vf);
    } else {
      const ccIdx = this.columnCombinations.findIndex((c) => c.fieldName === cf && c.value === cv);
      const vfIdx = this.layoutValues.findIndex((v) => v.fieldName === vf);
      ci = ccIdx * this.layoutValues.length + vfIdx;
    }

    return { ri: Math.max(ri, 0), ci: Math.max(ci, 0) };
  }

  /**
   * Focus the data cell at position (rowIdx, colIdx) in the rendered grid.
   * Uses the DOM directly so it works without Angular tracking every element.
   */
  private focusCell(rowIdx: number, colIdx: number): void {
    const tbody = this.svGridRef?.nativeElement?.querySelector('tbody');
    if (!tbody) return;
    const row = tbody.querySelectorAll('tr')[rowIdx] as HTMLElement | undefined;
    if (!row) return;
    const cell = row.querySelectorAll('td.cfg-de-td--cell')[colIdx] as HTMLElement | undefined;
    cell?.focus();
  }

  /** Null-safe blur handler — avoids TypeError when editing is already null */
  onInputBlur(): void {
    if (this.editing) this.confirmEdit(this.editing.current);
  }

  confirmEdit(value: string): void {
    if (!this.editing || !this.grid) return;
    const e = this.editing;
    this.editing = null;

    // Skip no-op saves (guards against ghost-edit on OnPush re-render)
    if (value === e.originalValue) {
      this.cdr.markForCheck();
      return;
    }

    const dimValues: Record<string, string> = { ...e.pathValues };
    if (!this.noColonnaMode && e.colonnaField) dimValues[e.colonnaField] = e.colonnaValue;
    for (const f of this.layoutFilters) {
      dimValues[f.fieldName] = this.selectedFiltri[f.fieldName] ?? '';
    }

    if (this.saveMode === 'manual') {
      // Accumulate change locally — optimistic update in memory
      const key = JSON.stringify({ ...dimValues, __vf: e.valoreField });
      this.pendingChanges.set(key, {
        pathValues:   e.pathValues,
        colonnaField: e.colonnaField,
        colonnaValue: e.colonnaValue,
        valoreField:  e.valoreField,
        value,
      });
      // Update in-memory grid immediately so the user sees the new value
      const row = this.grid.writeRows.find((r) => {
        for (const [k, v] of Object.entries(dimValues)) {
          if (!v) continue;
          if (!(k in r.dimensionValues)) continue;
          if (r.dimensionValues[k] !== v) return false;
        }
        return true;
      });
      if (row) row.values[e.valoreField] = value;
      else this.grid.writeRows.push({ dimensionValues: { ...dimValues }, values: { [e.valoreField]: value } });
      this.scheduleRollupRebuild();
      return;
    }

    // Auto mode: save immediately
    const cellKey = `${this.pathKey(e.pathValues)}||${e.colonnaField}||${e.colonnaValue}||${e.valoreField}`;
    this.savingCells.add(cellKey);
    this.failedCells.delete(cellKey);
    const dto: SaveCellDto = { dimensionValues: dimValues, valoreField: e.valoreField, value };
    this.isSaving  = true;
    this.saveError = null;
    this.svc.saveSnapshotCell(this.snapshotId, dto).subscribe({
      next: () => {
        this.savingCells.delete(cellKey);
        this.isSaving = false;
        const row = this.grid!.writeRows.find((r) => {
          for (const [k, v] of Object.entries(dimValues)) {
            if (!v) continue;
            if (!(k in r.dimensionValues)) continue;
            if (r.dimensionValues[k] !== v) return false;
          }
          return true;
        });
        if (row) row.values[e.valoreField] = value;
        else this.grid!.writeRows.push({ dimensionValues: { ...dimValues }, values: { [e.valoreField]: value } });
        this.invalidateCellValueCache();
        this.scheduleRollupRebuild();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.savingCells.delete(cellKey);
        this.failedCells.add(cellKey);
        this.isSaving = false;
        this.saveError = err?.error?.error ?? err?.message ?? 'Errore durante il salvataggio.';
        this.cdr.markForCheck();
      },
    });
  }

  /** Save all pending manual changes to the backend in sequence */
  savePending(): void {
    if (this.pendingChanges.size === 0) return;
    this.isSavingPending = true;
    this.saveError = null;

    const entries = [...this.pendingChanges.entries()];
    const saveNext = (idx: number): void => {
      if (idx >= entries.length) {
        this.pendingChanges.clear();
        this.isSavingPending = false;
        this.scheduleRollupRebuild();
        return;
      }
      const [key, ch] = entries[idx];
      const cellKey = `${this.pathKey(ch.pathValues)}||${ch.colonnaField}||${ch.colonnaValue}||${ch.valoreField}`;
      this.savingCells.add(cellKey);
      this.failedCells.delete(cellKey);
      const dimValues: Record<string, string> = { ...ch.pathValues };
      if (!this.noColonnaMode && ch.colonnaField) dimValues[ch.colonnaField] = ch.colonnaValue;
      for (const f of this.layoutFilters) {
        dimValues[f.fieldName] = this.selectedFiltri[f.fieldName] ?? '';
      }
      const dto: SaveCellDto = { dimensionValues: dimValues, valoreField: ch.valoreField, value: ch.value };
      this.svc.saveSnapshotCell(this.snapshotId, dto).subscribe({
        next:  () => {
          this.savingCells.delete(cellKey);
          this.pendingChanges.delete(key);
          this.invalidateCellValueCache();
          this.cdr.markForCheck();
          saveNext(idx + 1);
        },
        error: (err: any) => {
          this.savingCells.delete(cellKey);
          this.failedCells.add(cellKey);
          this.saveError = err?.error?.error ?? err?.message ?? 'Errore durante il salvataggio batch.';
          this.isSavingPending = false;
          this.cdr.markForCheck();
        },
      });
    };
    saveNext(0);
  }

  cancelEdit(): void { this.editing = null; }

  /**
   * Confirm the current cell edit and move to the adjacent cell.
   * Enter/ArrowDown → next leaf row; Tab → next column cell; Shift+Tab → previous.
   */
  navigateAfterConfirm(direction: 'down' | 'up' | 'right' | 'left'): void {
    if (!this.editing || !this.grid) {
      if (this.editing) this.confirmEdit(this.editing.current);
      return;
    }

    // Capture state BEFORE confirmEdit clears this.editing
    const pathKey  = this.editing.pathKey;
    const cf       = this.editing.colonnaField;
    const cv       = this.editing.colonnaValue;
    const vf       = this.editing.valoreField;
    const value    = this.editing.current;
    const rows     = this.visibleRows;
    const rowIdx   = rows.findIndex((r) => this.pathKey(r.pathValues) === pathKey);
    const vals     = this.layoutValues;
    const colOpts  = this.noColonnaMode
      ? [{ fieldName: '', values: [''] }]
      : (this.grid.columnOptions ?? []);

    this.confirmEdit(value);

    if (rowIdx < 0) return;

    if (direction === 'down' || direction === 'up') {
      const delta = direction === 'down' ? 1 : -1;
      let nextIdx = rowIdx + delta;
      // Skip non-leaf rows
      while (nextIdx >= 0 && nextIdx < rows.length && !rows[nextIdx].isLeaf) {
        nextIdx += delta;
      }
      if (nextIdx >= 0 && nextIdx < rows.length) {
        setTimeout(() => this.startEdit(rows[nextIdx], cf, cv, vf), 0);
      }
      return;
    }

    // Tab / Shift+Tab: move across (colonnaField × colonnaValue × valoreField) matrix
    const cellOrder: Array<{ cf: string; cv: string; vf: string }> = [];
    for (const col of colOpts) {
      const cvs = this.noColonnaMode ? [''] : (col.values.length ? col.values : ['']);
      for (const colonnaValue of cvs) {
        for (const v of vals) {
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

  // ── Track helpers ───────────────────────────────────────────────────────────

  trackByField = (_: number, f: { fieldName: string }): string => f.fieldName;
  trackByRow   = (_: number, r: DataEntryRowOption): string => this.getRowPathKey(r);
  trackByCol   = (_: number, c: { fieldName: string; value: string }): string => `${c.fieldName}=${c.value}`;
  trackByVf    = (_: number, v: { fieldName: string }): string => v.fieldName;
}
