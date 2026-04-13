import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';
import {
  DatasetBinding, FieldMapping, DbColumnInfo, ParamTableInfo,
  EntryAxisItem, EntryValueItem, EntryLayoutConfig, AggregationFn, HierarchyDef,
} from '../../../models/esg-configurator.models';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

export type ZoneKey = 'filters' | 'rows' | 'columns' | 'values';

export interface FieldInfo {
  fieldName:   string;
  label:       string;
  fieldType:   string;
  sourceTable?: string;
  groupLabel?:  string;   // smart name or schema.table for display grouping
}

const ZONE_META: Record<ZoneKey, { title: string; hint: string; icon: string }> = {
  filters: { title: 'Filtri',   icon: '🔽', hint: 'Contesto: anno, scenario, entità.' },
  columns: { title: 'Colonne',  icon: '↔',  hint: 'Dimensioni nelle colonne della griglia.' },
  rows:    { title: 'Righe',    icon: '↕',  hint: 'Dimensioni nelle righe della griglia.' },
  values:  { title: 'Valori',   icon: '✏',  hint: 'Campi misura da compilare.' },
};

@Component({
  selector: 'esg-step-entry-layout',
  templateUrl: './esg-step-entry-layout.component.html',
})
export class EsgStepEntryLayoutComponent implements OnInit {
  @Input() reportId!: number;
  /** When true, hides footer nav (used inside split-pane layout+preview). */
  @Input() embedded = false;
  @Output() back = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() layoutChanged = new EventEmitter<void>();

  binding:     DatasetBinding | null = null;
  paramTables: ParamTableInfo[]      = [];

  layout:   EntryLayoutConfig = { filters: [], rows: [], columns: [], values: [] };
  layoutId: number | null     = null;

  /** Raw DB columns — populated as fallback when fieldMappings is empty. */
  private dbColumns: DbColumnInfo[] = [];
  /** Columns from each joined dim table, keyed by "schema.table" string. */
  private dimTableColumnsMap = new Map<string, DbColumnInfo[]>();
  /** Parent-Child hierarchy definitions for this report. */
  private hierarchyDefs: HierarchyDef[] = [];

  addPending: Record<ZoneKey, string> = { filters: '', rows: '', columns: '', values: '' };

  isLoading = false;
  isSaving  = false;
  errorMsg:   string | null = null;
  successMsg: string | null = null;

  /** Tracks if layout has been modified since last save */
  layoutDirty = false;

  /** Which zone's field picker popup is open, null if closed */
  fieldPickerZone: ZoneKey | null = null;
  fieldPickerSearch = '';

  // ── Left field-panel state ─────────────────────────────────────────────────
  /** Search text in the persistent left field panel */
  fieldPanelSearch = '';
  /** Which field in the left panel has its inline zone-picker expanded */
  activePanelField: string | null = null;
  /** Collapsed state of source-table groups in the left panel */
  fieldGroupCollapsed: Record<string, boolean> = {};

  /** Which field's settings popup is open, null if closed */
  settingsPopupField: string | null = null;
  settingsPopupZone: ZoneKey | null = null;

  // ── Inline lock-members state (embedded in settings popup for columns zone) ──
  lockInlineLoading  = false;
  lockInlineValues:  string[] = [];
  lockInlineChecked  = new Set<string>();
  lockInlineSearch   = '';
  lockInlineError:   string | null = null;

  // ── Filter default-value dropdown state ───────────────────────────────────
  filterDefaultOptions: string[]     = [];
  filterDefaultLoading  = false;
  filterDefaultError:   string | null = null;

  /** Collapsible zone state — all expanded by default */
  zoneCollapsed: Record<ZoneKey, boolean> = {
    filters: false, rows: false, columns: false, values: false,
  };

  /** Zone order: Filtri -> Colonne -> Righe -> Valori (vertical stack right panel). */
  readonly zones: ZoneKey[]           = ['filters', 'columns', 'rows', 'values'];
  readonly zoneMeta: typeof ZONE_META = ZONE_META;

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void { this.loadAll(); }

  // ── Data loading ───────────────────────────────────────────────────────────

  private loadAll(): void {
    this.isLoading = true;
    this.errorMsg  = null;

    forkJoin({
      binding:       this.svc.getBinding(this.reportId).pipe(catchError(() => of(null))),
      paramTables:   this.svc.listParamTables(this.reportId).pipe(catchError(() => of([]))),
      layout:        this.svc.getEntryLayout(this.reportId).pipe(catchError(() => of(null))),
      hierarchyDefs: this.svc.listHierarchyDefs(this.reportId).pipe(catchError(() => of([]))),
    }).pipe(
      switchMap(({ binding, paramTables, layout, hierarchyDefs }) => {
        this.binding       = binding;
        this.paramTables   = paramTables ?? [];
        this.hierarchyDefs = hierarchyDefs ?? [];
        if (layout) {
          this.layoutId = layout.layoutId;
          this.layout   = layout.config;
          const identRe = /^[A-Za-z0-9_]+$/;
          const axisZones: Array<EntryAxisItem[]> = [
            this.layout.filters, this.layout.rows, this.layout.columns,
          ];
          for (const zone of axisZones) {
            for (const item of zone) {
              if (!identRe.test(item.fieldName)) {
                const hd = (hierarchyDefs ?? []).find((h) =>
                  (item.hierarchyDefId && h.hierarchyDefId === item.hierarchyDefId) ||
                  (item.dimTable && h.dimTable === item.dimTable),
                );
                if (hd) {
                  item.fieldName      = hd.childKeyCol;
                  item.hierarchyDefId = hd.hierarchyDefId;
                }
              }
            }
          }
        }

        const colCalls: Record<string, Observable<DbColumnInfo[]>> = {};

        if (binding && (!binding.fieldMappings || binding.fieldMappings.length === 0)) {
          const [schema, table] = this.splitFact(binding.factTable);
          colCalls['__fact'] = this.svc.getTableColumns(schema, table).pipe(catchError(() => of([])));
        }

        for (const jc of (binding?.joinConfig ?? [])) {
          if (!colCalls[jc.rightTable]) {
            const [schema, table] = this.splitFact(jc.rightTable);
            colCalls[jc.rightTable] = this.svc.getTableColumns(schema, table).pipe(catchError(() => of([])));
          }
        }

        if (Object.keys(colCalls).length === 0) return of({} as Record<string, DbColumnInfo[]>);
        return forkJoin(colCalls);
      }),
    ).subscribe({
      next: (colsMap: Record<string, DbColumnInfo[]>) => {
        this.dbColumns = colsMap['__fact'] ?? [];
        this.dimTableColumnsMap.clear();
        for (const [key, cols] of Object.entries(colsMap)) {
          if (key !== '__fact') this.dimTableColumnsMap.set(key, cols);
        }
        this.isLoading = false;
      },
      error: () => { this.errorMsg = 'Impossibile caricare la configurazione.'; this.isLoading = false; },
    });
  }

  // ── Smart name resolution ─────────────────────────────────────────────────

  private getSmartNameForTable(fqn: string): string {
    if (!this.binding) return fqn;
    if (fqn === this.binding.factTable) {
      return this.binding.factTableSmartName || fqn;
    }
    const join = (this.binding.joinConfig ?? []).find((j) => j.rightTable === fqn);
    return join?.smartName || fqn;
  }

  // ── Field pool ─────────────────────────────────────────────────────────────

  get allFields(): FieldInfo[] {
    const mappings = this.binding?.fieldMappings ?? [];
    const factLabel = this.binding ? this.getSmartNameForTable(this.binding.factTable) : '';

    const existingFieldNames = new Set([
      ...mappings.map((m: FieldMapping) => m.dbField),
      ...this.dbColumns.map((c: DbColumnInfo) => c.columnName),
    ]);
    const addedDimNames = new Set<string>();
    const dimFields: FieldInfo[] = [];
    for (const [tableKey, cols] of this.dimTableColumnsMap.entries()) {
      const groupLabel = this.getSmartNameForTable(tableKey);
      for (const col of cols) {
        if (!existingFieldNames.has(col.columnName) && !addedDimNames.has(col.columnName)) {
          addedDimNames.add(col.columnName);
          dimFields.push({
            fieldName:   col.columnName,
            label:       col.columnName,
            fieldType:   'dim-column',
            sourceTable: tableKey,
            groupLabel,
          });
        }
      }
    }

    const hierarchyFields: FieldInfo[] = this.hierarchyDefs.map((h) => ({
      fieldName:   h.childKeyCol,
      label:       h.smartName || h.childKeyCol,
      fieldType:   'hierarchy',
      sourceTable: h.dimTable,
      groupLabel:  'Gerarchie (P&C)',
    }));

    let baseFields: FieldInfo[];
    if (mappings.length > 0) {
      const factFields = mappings.map((m: FieldMapping) => ({
        fieldName:   m.dbField,
        label:       m.businessLabel || m.dbField,
        fieldType:   m.fieldType,
        sourceTable: undefined as string | undefined,
        groupLabel:  factLabel,
      }));
      baseFields = [...factFields, ...dimFields, ...hierarchyFields];
    } else {
      const factCols = this.dbColumns.map((c: DbColumnInfo) => ({
        fieldName:   c.columnName,
        label:       c.columnName,
        fieldType:   'column' as string,
        sourceTable: undefined as string | undefined,
        groupLabel:  factLabel,
      }));
      baseFields = [...factCols, ...dimFields, ...hierarchyFields];
    }

    const poolNames = new Set(baseFields.map((f) => f.fieldName));
    const paramFields: FieldInfo[] = this.paramTables
      .filter((pt) => !poolNames.has(pt.columnName))
      .map((pt) => ({
        fieldName:   pt.columnName,
        label:       pt.columnName,
        fieldType:   'param-dimension',
        sourceTable: undefined as string | undefined,
        groupLabel:  'Parametri',
      }));

    const groupingFields: FieldInfo[] = this.paramTables.map((pt) => ({
      fieldName:   `${pt.columnName}_Grouping`,
      label:       `${pt.columnName} — Raggruppamento`,
      fieldType:   'param-grouping',
      sourceTable: undefined as string | undefined,
      groupLabel:  'Parametri',
    }));

    return [...baseFields, ...paramFields, ...groupingFields];
  }

  get usingDbFallback(): boolean {
    return (this.binding?.fieldMappings?.length ?? 0) === 0 && this.dbColumns.length > 0;
  }

  /** Unique group labels for the field pool, in display order. */
  get fieldGroups(): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const f of this.allFields) {
      const g = f.groupLabel ?? '';
      if (g && !seen.has(g)) { seen.add(g); result.push(g); }
    }
    return result;
  }

  fieldsInGroup(group: string): FieldInfo[] {
    return this.allFields.filter((f) => (f.groupLabel ?? '') === group);
  }

  private get assignedNames(): Set<string> {
    const s = new Set<string>();
    [...this.layout.filters, ...this.layout.rows, ...this.layout.columns]
      .forEach((i) => s.add(i.fieldName));
    this.layout.values.forEach((i) => s.add(i.fieldName));
    return s;
  }

  availableForZone(zone: ZoneKey): FieldInfo[] {
    // Filters can share fields with rows/columns (like Excel pivot slicers).
    // All other zones use the full "assigned anywhere" exclusion.
    const isUsed = (fieldName: string): boolean => {
      if (zone === 'filters') {
        return this.layout.filters.some((i) => i.fieldName === fieldName);
      }
      return this.assignedNames.has(fieldName);
    };

    const unassigned = this.allFields.filter((f) => {
      if (f.fieldType === 'hierarchy' && zone !== 'values') {
        const zoneItems = this.layout[zone] as EntryAxisItem[];
        return !zoneItems.some((i) => i.fieldName === f.fieldName);
      }
      return !isUsed(f.fieldName);
    });
    if (this.usingDbFallback) return unassigned;

    if (zone === 'values') {
      return unassigned.filter(
        (f) => f.fieldType === 'measure' || f.fieldType === 'note' || f.fieldType === 'audit',
      );
    }
    return unassigned.filter(
      (f) => f.fieldType === 'dimension' || f.fieldType === 'period' ||
             f.fieldType === 'scenario'  || f.fieldType === 'key'    ||
             f.fieldType === 'dim-column' || f.fieldType === 'hierarchy' ||
             f.fieldType === 'param-dimension' || f.fieldType === 'param-grouping',
    );
  }

  // ── Dirty tracking ────────────────────────────────────────────────────────

  markDirty(): void {
    this.layoutDirty = true;
    this.layoutChanged.emit();
  }

  // ── Zone collapse toggle ──────────────────────────────────────────────────

  toggleZoneCollapse(zone: ZoneKey): void {
    this.zoneCollapsed[zone] = !this.zoneCollapsed[zone];
  }

  // ── Field Picker Popup ────────────────────────────────────────────────────

  openFieldPicker(zone: ZoneKey): void {
    this.fieldPickerZone   = zone;
    this.fieldPickerSearch = '';
  }

  closeFieldPicker(): void {
    this.fieldPickerZone   = null;
    this.fieldPickerSearch = '';
  }

  addFieldFromPicker(zone: ZoneKey, fieldName: string): void {
    const field = this.allFields.find((f) => f.fieldName === fieldName);
    if (!field) return;

    if (zone === 'values') {
      if (this.layout.values.some((i) => i.fieldName === fieldName)) return;
      this.layout.values.push({ fieldName: field.fieldName, label: field.label, aggregation: 'SUM' });
    } else {
      const axisZone = this.layout[zone] as EntryAxisItem[];
      if (axisZone.some((i) => i.fieldName === fieldName)) return;
      const hierDef = field.fieldType === 'hierarchy'
        ? this.hierarchyDefs.find((h) => h.childKeyCol === fieldName)
        : undefined;
      const autoParamTable = (field.fieldType === 'param-dimension' || field.fieldType === 'param-grouping')
        ? (this.getParamTableForField(fieldName)?.paramTableId ?? null)
        : null;
      axisZone.push({
        fieldName:      field.fieldName,
        label:          field.label,
        paramTableId:   autoParamTable,
        dimTable:       field.sourceTable ?? null,
        hierarchyDefId: hierDef?.hierarchyDefId,
      });
    }

    this.closeFieldPicker();
    this.markDirty();
  }

  /** All fields eligible for the currently-open picker zone, filtered by search text. */
  get filteredPickerFields(): FieldInfo[] {
    if (!this.fieldPickerZone) return [];
    const zone = this.fieldPickerZone;

    // Get type-compatible fields (same logic as availableForZone but without excluding assigned)
    let typeFiltered: FieldInfo[];
    if (this.usingDbFallback) {
      typeFiltered = this.allFields;
    } else if (zone === 'values') {
      typeFiltered = this.allFields.filter(
        (f) => f.fieldType === 'measure' || f.fieldType === 'note' || f.fieldType === 'audit',
      );
    } else {
      typeFiltered = this.allFields.filter(
        (f) => f.fieldType === 'dimension' || f.fieldType === 'period' ||
               f.fieldType === 'scenario'  || f.fieldType === 'key'    ||
               f.fieldType === 'dim-column' || f.fieldType === 'hierarchy' ||
               f.fieldType === 'param-dimension' || f.fieldType === 'param-grouping',
      );
    }

    // Apply search filter
    const search = this.fieldPickerSearch.toLowerCase().trim();
    if (search) {
      typeFiltered = typeFiltered.filter((f) => {
        const haystack = `${f.label} ${f.groupLabel ?? ''} ${f.fieldName}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    return typeFiltered;
  }

  /** Check if a field is available (not yet assigned) for the current picker zone */
  isPickerFieldAvailable(fieldName: string): boolean {
    if (!this.fieldPickerZone) return false;
    return this.availableForZone(this.fieldPickerZone).some((f) => f.fieldName === fieldName);
  }

  // ── Field Settings Popup ──────────────────────────────────────────────────

  openSettingsPopup(zone: ZoneKey, fieldName: string): void {
    this.settingsPopupZone  = zone;
    this.settingsPopupField = fieldName;

    // Pre-load lock-members inline when opening a columns field
    if (zone === 'columns') {
      this.lockInlineSearch  = '';
      this.lockInlineError   = null;
      this.lockInlineLoading = true;
      this.lockInlineValues  = [];
      // Restore current selections from layout
      const item = this.layout.columns.find((i) => i.fieldName === fieldName);
      this.lockInlineChecked = new Set<string>(item?.lockedMembers ?? []);

      const ctx = this.getLockDialogContext(fieldName);
      this.svc.getDistinctValues(ctx.schema, ctx.table, ctx.column, 1000).subscribe({
        next:  (r) => { this.lockInlineValues = r.values ?? []; this.lockInlineLoading = false; },
        error: ()  => { this.lockInlineError = 'Impossibile caricare i valori.'; this.lockInlineLoading = false; },
      });
    }

    // Pre-load distinct values for the filter-default dropdown
    if (zone === 'filters') {
      this.filterDefaultOptions = [];
      this.filterDefaultLoading = true;
      this.filterDefaultError   = null;
      const ctx = this.getFilterDistinctContext(fieldName);
      if (ctx.table) {
        this.svc.getDistinctValues(ctx.schema, ctx.table, ctx.column, 500).subscribe({
          next:  (r) => { this.filterDefaultOptions = r.values ?? []; this.filterDefaultLoading = false; },
          error: ()  => { this.filterDefaultError = 'Impossibile caricare i valori.'; this.filterDefaultLoading = false; },
        });
      } else {
        this.filterDefaultLoading = false;
      }
    }
  }

  closeSettingsPopup(): void {
    this.settingsPopupZone  = null;
    this.settingsPopupField = null;
  }

  /** Toggle a single lock-member value in the inline checklist */
  toggleLockInline(val: string): void {
    if (this.lockInlineChecked.has(val)) this.lockInlineChecked.delete(val);
    else this.lockInlineChecked.add(val);
  }

  /** Select/deselect all visible (filtered) inline lock values */
  lockInlineSelectAll():   void { this.lockInlineFiltered.forEach((v) => this.lockInlineChecked.add(v)); }
  lockInlineDeselectAll(): void { this.lockInlineFiltered.forEach((v) => this.lockInlineChecked.delete(v)); }

  /** Values filtered by current search text */
  get lockInlineFiltered(): string[] {
    const q = this.lockInlineSearch.trim().toLowerCase();
    return q ? this.lockInlineValues.filter((v) => v.toLowerCase().includes(q)) : this.lockInlineValues;
  }

  /** Persist inline lock selection to the layout item, mark dirty, close popup */
  applyLockInline(): void {
    if (!this.settingsPopupField) return;
    this.onLockDialogSaved(this.settingsPopupField, [...this.lockInlineChecked]);
    this.closeSettingsPopup();
  }

  // ── Zone CRUD ──────────────────────────────────────────────────────────────

  addToZone(zone: ZoneKey): void {
    const fieldName = this.addPending[zone];
    if (!fieldName) return;
    const field = this.allFields.find((f) => f.fieldName === fieldName);
    if (!field) return;
    this.addPending[zone] = '';

    if (zone === 'values') {
      if (this.layout.values.some((i) => i.fieldName === fieldName)) return;
      this.layout.values.push({ fieldName: field.fieldName, label: field.label, aggregation: 'SUM' });
    } else {
      const axisZone = this.layout[zone] as EntryAxisItem[];
      if (axisZone.some((i) => i.fieldName === fieldName)) return;
      const hierDef = field.fieldType === 'hierarchy'
        ? this.hierarchyDefs.find((h) => h.childKeyCol === fieldName)
        : undefined;
      const autoParamTable = (field.fieldType === 'param-dimension' || field.fieldType === 'param-grouping')
        ? (this.getParamTableForField(fieldName)?.paramTableId ?? null)
        : null;
      axisZone.push({
        fieldName:      field.fieldName,
        label:          field.label,
        paramTableId:   autoParamTable,
        dimTable:       field.sourceTable ?? null,
        hierarchyDefId: hierDef?.hierarchyDefId,
      });
    }
    this.markDirty();
  }

  removeFromZone(zone: ZoneKey, fieldName: string): void {
    if (zone === 'values') {
      this.layout.values = this.layout.values.filter((i) => i.fieldName !== fieldName);
    } else {
      (this.layout[zone] as EntryAxisItem[]) =
        (this.layout[zone] as EntryAxisItem[]).filter((i) => i.fieldName !== fieldName);
    }
    // Close settings popup if the removed field was open
    if (this.settingsPopupField === fieldName && this.settingsPopupZone === zone) {
      this.closeSettingsPopup();
    }
    this.markDirty();
  }

  /**
   * Moves a field from its current zone (rows/columns/values) to the filters zone.
   * Strips rows-only properties (role, skipDepths) and values-only (aggregation).
   */
  moveToFilters(fromZone: ZoneKey, fieldName: string): void {
    if (fromZone === 'filters') return;

    let newItem: EntryAxisItem;

    if (fromZone === 'values') {
      const valItem = this.layout.values.find((i) => i.fieldName === fieldName);
      if (!valItem) return;
      this.layout.values = this.layout.values.filter((i) => i.fieldName !== fieldName);
      newItem = { fieldName: valItem.fieldName, label: valItem.label, paramTableId: null, dimTable: null };
    } else {
      const fromItems = this.layout[fromZone] as EntryAxisItem[];
      const item = fromItems.find((i) => i.fieldName === fieldName);
      if (!item) return;
      (this.layout[fromZone] as EntryAxisItem[]) = fromItems.filter((i) => i.fieldName !== fieldName);
      newItem = {
        fieldName:   item.fieldName,
        label:       item.label,
        paramTableId: item.paramTableId,
        dimTable:    item.dimTable ?? null,
      };
    }

    this.layout.filters.push(newItem);
    this.closeSettingsPopup();
    this.markDirty();
  }

  toggleParam(zone: 'filters' | 'rows' | 'columns', fieldName: string): void {
    const item = (this.layout[zone] as EntryAxisItem[]).find((i) => i.fieldName === fieldName);
    if (!item) return;
    const pt = this.getParamTable(fieldName);
    if (!pt) return;
    item.paramTableId = item.paramTableId ? null : pt.paramTableId;
    this.markDirty();
  }

  // ── Param table helpers ────────────────────────────────────────────────────

  getParamTable(fieldName: string): ParamTableInfo | undefined {
    return this.paramTables.find((p) => p.columnName === fieldName);
  }

  getParamTableForField(fieldName: string): ParamTableInfo | undefined {
    const direct = this.paramTables.find((p) => p.columnName === fieldName);
    if (direct) return direct;
    if (fieldName.endsWith('_Grouping')) {
      const base = fieldName.slice(0, -'_Grouping'.length);
      return this.paramTables.find((p) => p.columnName === base);
    }
    return undefined;
  }

  hasParamTable(fieldName: string): boolean {
    return !!this.getParamTable(fieldName);
  }

  isParamEnabled(zone: 'filters' | 'rows' | 'columns', fieldName: string): boolean {
    const item = (this.layout[zone] as EntryAxisItem[]).find((i) => i.fieldName === fieldName);
    return !!(item?.paramTableId);
  }

  // ── Drag-and-drop reordering ───────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDrop(event: CdkDragDrop<any[]>, zone: ZoneKey): void {
    if (zone === 'values') {
      moveItemInArray(this.layout.values, event.previousIndex, event.currentIndex);
    } else {
      moveItemInArray(this.layout[zone] as EntryAxisItem[], event.previousIndex, event.currentIndex);
    }
    this.markDirty();
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  saveLayout(): void {
    this.isSaving   = true;
    this.errorMsg   = null;
    this.successMsg = null;
    this.svc.saveEntryLayout(this.reportId, this.layout).subscribe({
      next: (saved) => {
        this.layoutId    = saved.layoutId;
        this.isSaving    = false;
        this.layoutDirty = false;
        this.successMsg  = 'Layout salvato.';
        // When embedded inside the layout+preview split-pane, emit next so the
        // parent's onLayoutSaved() reloads the live preview automatically.
        if (this.embedded) {
          this.next.emit();
        }
        setTimeout(() => { this.successMsg = null; }, 4000);
      },
      error: () => { this.errorMsg = 'Impossibile salvare il layout.'; this.isSaving = false; },
    });
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  isAssigned(fieldName: string): boolean { return this.assignedNames.has(fieldName); }

  readonly aggregations: { value: AggregationFn; label: string }[] = [
    { value: 'SUM',   label: 'SUM — somma' },
    { value: 'COUNT', label: 'COUNT — conteggio' },
    { value: 'AVG',   label: 'AVG — media' },
    { value: 'MIN',   label: 'MIN — minimo' },
    { value: 'MAX',   label: 'MAX — massimo' },
    { value: 'NONE',  label: 'NONE — valore grezzo' },
  ];

  setAggregation(fieldName: string, agg: AggregationFn): void {
    const item = this.layout.values.find((i) => i.fieldName === fieldName);
    if (item) item.aggregation = agg;
    this.markDirty();
  }

  aggLabel(agg: AggregationFn): string {
    return this.aggregations.find((a) => a.value === agg)?.label.split('—')[0].trim() ?? agg;
  }

  isAxisZone(zone: ZoneKey): zone is 'filters' | 'rows' | 'columns' { return zone !== 'values'; }
  getAxisItems(zone: ZoneKey): EntryAxisItem[]  { return zone !== 'values' ? (this.layout[zone] as EntryAxisItem[]) : []; }
  getValueItems(): EntryValueItem[]             { return this.layout.values; }

  fieldTypeIcon(type: string): string {
    const map: Record<string, string> = {
      measure: '📊', dimension: '🏷', period: '📅', scenario: '🔀',
      key: '🔑', note: '📝', audit: '🔍', column: '◻', 'dim-column': '🔗',
      hierarchy: '🌳', 'param-dimension': '📋', 'param-grouping': '🗂',
    };
    return map[type] ?? '◻';
  }

  /** Helper: get FieldInfo for a given fieldName */
  getFieldInfo(fieldName: string): FieldInfo | undefined {
    return this.allFields.find((f) => f.fieldName === fieldName);
  }

  private splitFact(fullName: string): [string, string] {
    return fullName.includes('.') ? (fullName.split('.') as [string, string]) : ['dbo', fullName];
  }

  get joinedTables(): string[] {
    return [...new Set((this.binding?.joinConfig ?? []).map((j) => j.rightTable))];
  }

  getDimTable(zone: 'filters' | 'rows' | 'columns', fieldName: string): string {
    const item = (this.layout[zone] as EntryAxisItem[]).find((i) => i.fieldName === fieldName);
    return item?.dimTable ?? '';
  }

  setDimTable(zone: 'filters' | 'rows' | 'columns', fieldName: string, value: string): void {
    const item = (this.layout[zone] as EntryAxisItem[]).find((i) => i.fieldName === fieldName);
    if (item) item.dimTable = value || null;
    this.markDirty();
  }

  getSkipDepths(zone: 'filters' | 'rows' | 'columns', fieldName: string): number {
    const item = (this.layout[zone] as EntryAxisItem[]).find((i) => i.fieldName === fieldName);
    return item?.skipDepths ?? 0;
  }

  setSkipDepths(zone: 'filters' | 'rows' | 'columns', fieldName: string, value: string | number): void {
    const item = (this.layout[zone] as EntryAxisItem[]).find((i) => i.fieldName === fieldName);
    if (!item) return;
    const n = Number(value);
    item.skipDepths = n > 0 ? n : undefined;
    this.markDirty();
  }

  // ── Filter default value ──────────────────────────────────────────────────

  getFilterDefault(fieldName: string): string {
    const item = this.layout.filters.find((i) => i.fieldName === fieldName);
    return item?.defaultValue ?? '';
  }

  setFilterDefault(fieldName: string, value: string): void {
    const item = this.layout.filters.find((i) => i.fieldName === fieldName);
    if (item) { item.defaultValue = value || null; this.markDirty(); }
  }

  /** Resolves the {schema, table, column} to query distinct values for a filter field. */
  getFilterDistinctContext(fieldName: string): { schema: string; table: string; column: string } {
    const item = this.layout.filters.find((i) => i.fieldName === fieldName);
    if (item?.dimTable) {
      const [s, t] = this.splitFact(item.dimTable);
      return { schema: s, table: t, column: fieldName };
    }
    if (this.binding) {
      const [s, t] = this.splitFact(this.binding.factTable);
      return { schema: s, table: t, column: fieldName };
    }
    return { schema: 'dbo', table: '', column: fieldName };
  }

  // ── Row role (raggruppamento / dettaglio) ─────────────────────────────────

  getRowRole(fieldName: string): 'grouping' | 'detail' {
    const item = this.layout.rows.find((i) => i.fieldName === fieldName);
    return item?.role ?? 'grouping';
  }

  setRowRole(fieldName: string, role: 'grouping' | 'detail'): void {
    const item = this.layout.rows.find((i) => i.fieldName === fieldName);
    if (item) { item.role = role; this.markDirty(); }
  }

  getLockedMembersText(fieldName: string): string {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    return (item?.lockedMembers ?? []).join(', ');
  }

  getLockedMembersCount(fieldName: string): number {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    return (item?.lockedMembers ?? []).length;
  }

  setLockedMembersText(fieldName: string, text: string): void {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    if (!item) return;
    const members = text.split(',').map((s) => s.trim()).filter(Boolean);
    (item as any).lockedMembers = members.length ? members : undefined;
    this.markDirty();
  }

  // ── Lock members dialog ────────────────────────────────────────────────────

  lockDialogField: string | null = null;

  openLockDialog(fieldName: string): void { this.lockDialogField = fieldName; }

  getLockDialogContext(fieldName: string): { schema: string; table: string; column: string } {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    if (item?.dimTable) {
      const [s, t] = this.splitFact(item.dimTable);
      return { schema: s, table: t, column: fieldName };
    }
    if (this.binding) {
      const [s, t] = this.splitFact(this.binding.factTable);
      return { schema: s, table: t, column: fieldName };
    }
    return { schema: 'dbo', table: '', column: fieldName };
  }

  getLockDialogLabel(fieldName: string): string {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    return item?.label ?? fieldName;
  }

  getLockDialogCurrentMembers(fieldName: string): string[] {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    return item?.lockedMembers ?? [];
  }

  onLockDialogSaved(fieldName: string, members: string[]): void {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    if (item) (item as any).lockedMembers = members.length ? members : undefined;
    this.lockDialogField = null;
    this.markDirty();
  }

  trackByField(_: number, f: FieldInfo): string          { return f.fieldName; }
  trackByAxisItem(_: number, i: EntryAxisItem): string   { return i.fieldName; }
  trackByValueItem(_: number, i: EntryValueItem): string { return i.fieldName; }
  trackByZone(_: number, z: ZoneKey): ZoneKey            { return z; }
  trackByGroup(_: number, g: string): string             { return g; }

  // ── Left field-panel helpers ───────────────────────────────────────────────

  /** Returns the zone a field is currently assigned to, or null if unassigned. */
  getFieldZone(fieldName: string): ZoneKey | null {
    if (this.layout.filters.some((i) => i.fieldName === fieldName)) return 'filters';
    if (this.layout.rows.some((i) => i.fieldName === fieldName))    return 'rows';
    if (this.layout.columns.some((i) => i.fieldName === fieldName)) return 'columns';
    if (this.layout.values.some((i) => i.fieldName === fieldName))  return 'values';
    return null;
  }

  /** Returns the short badge text for a zone (F / R / C / V). */
  zoneBadge(zone: ZoneKey): string {
    return { filters: 'F', rows: 'R', columns: 'C', values: 'V' }[zone];
  }

  /** Toggles the inline zone-picker for a field in the left panel. */
  togglePanelField(fieldName: string): void {
    this.activePanelField = this.activePanelField === fieldName ? null : fieldName;
  }

  /** Collapses / expands a source-table group in the left panel. */
  toggleFieldGroup(group: string): void {
    this.fieldGroupCollapsed[group] = !this.fieldGroupCollapsed[group];
  }

  /** Source-table groups that have at least one field matching the panel search. */
  get visibleFieldGroups(): string[] {
    const q = this.fieldPanelSearch.toLowerCase().trim();
    if (!q) return this.fieldGroups;
    return this.fieldGroups.filter((g) =>
      this.fieldsInGroup(g).some((f) =>
        `${f.label} ${f.fieldName}`.toLowerCase().includes(q),
      ),
    );
  }

  /** Fields in a group filtered by the panel search text. */
  fieldsInGroupFiltered(group: string): FieldInfo[] {
    const q = this.fieldPanelSearch.toLowerCase().trim();
    const base = this.fieldsInGroup(group);
    return q ? base.filter((f) => `${f.label} ${f.fieldName}`.toLowerCase().includes(q)) : base;
  }

  /**
   * Whether a field can be added to a zone:
   * - must not already be in that zone
   * - must be type-compatible with the zone
   */
  canAddToZone(fieldName: string, zone: ZoneKey): boolean {
    // Already in this zone?
    if (zone === 'values') {
      if (this.layout.values.some((i) => i.fieldName === fieldName)) return false;
    } else {
      if ((this.layout[zone] as EntryAxisItem[]).some((i) => i.fieldName === fieldName)) return false;
    }
    // Type check
    const field = this.allFields.find((f) => f.fieldName === fieldName);
    if (!field) return false;
    if (this.usingDbFallback) return true;
    if (zone === 'values') {
      return field.fieldType === 'measure' || field.fieldType === 'note' || field.fieldType === 'audit';
    }
    return (
      field.fieldType === 'dimension'       || field.fieldType === 'period'    ||
      field.fieldType === 'scenario'        || field.fieldType === 'key'       ||
      field.fieldType === 'dim-column'      || field.fieldType === 'hierarchy' ||
      field.fieldType === 'param-dimension' || field.fieldType === 'param-grouping'
    );
  }

  /** Add a field from the left panel to a zone, then close the inline picker. */
  addFromPanel(zone: ZoneKey, fieldName: string): void {
    this.addFieldFromPicker(zone, fieldName);
    this.activePanelField = null;
  }

  /** Open field settings from the left panel (field already assigned to a zone). */
  openSettingsFromPanel(fieldName: string): void {
    const zone = this.getFieldZone(fieldName);
    if (!zone) return;
    this.activePanelField = null;
    this.openSettingsPopup(zone, fieldName);
  }

  /** Remove a field from its zone via the left panel. */
  removeFromPanel(fieldName: string): void {
    const zone = this.getFieldZone(fieldName);
    if (!zone) return;
    this.removeFromZone(zone, fieldName);
    this.activePanelField = null;
  }
}
