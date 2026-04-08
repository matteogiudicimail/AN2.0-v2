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

interface FieldInfo {
  fieldName:   string;
  label:       string;
  fieldType:   string;
  sourceTable?: string;
  groupLabel?:  string;   // smart name or schema.table for display grouping
}

const ZONE_META: Record<ZoneKey, { title: string; hint: string; icon: string }> = {
  filters: { title: 'Filters',  icon: '🔽', hint: 'Fix the context: year, scenario, entity.' },
  columns: { title: 'Columns',  icon: '↔',  hint: 'Dimensions across the sheet columns.' },
  rows:    { title: 'Rows',     icon: '↕',  hint: 'Dimensions down the sheet rows.' },
  values:  { title: 'Values',   icon: '✏',  hint: 'Measure fields to be entered.' },
};

@Component({
  selector: 'esg-step-entry-layout',
  templateUrl: './esg-step-entry-layout.component.html',
})
export class EsgStepEntryLayoutComponent implements OnInit {
  @Input() reportId!: number;
  @Output() back = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

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

  /** Zone order: Filters | Columns on top row; Rows | Values on bottom row. */
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
          // Sanitize: hierarchy items saved with a non-identifier fieldName (e.g. smartName
          // with spaces) must have fieldName replaced with childKeyCol so the backend
          // identifier-validator doesn't reject them.
          const identRe = /^[A-Za-z0-9_]+$/;
          const axisZones: Array<EntryAxisItem[]> = [
            this.layout.filters, this.layout.rows, this.layout.columns,
          ];
          for (const zone of axisZones) {
            for (const item of zone) {
              if (!identRe.test(item.fieldName)) {
                // Match by hierarchyDefId first, then fall back to dimTable
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
      error: () => { this.errorMsg = 'Could not load configuration.'; this.isLoading = false; },
    });
  }

  // ── Smart name resolution ─────────────────────────────────────────────────

  private getSmartNameForTable(fqn: string): string {
    if (!this.binding) return fqn;
    // Check fact table
    if (fqn === this.binding.factTable) {
      return this.binding.factTableSmartName || fqn;
    }
    // Check joined dim tables
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

    // P&C hierarchy fields — fieldName MUST be the childKeyCol (valid SQL identifier).
    // label uses smartName for display. sourceTable carries the dimTable for backend lookup.
    const hierarchyFields: FieldInfo[] = this.hierarchyDefs.map((h) => ({
      fieldName:   h.childKeyCol,
      label:       h.smartName || h.childKeyCol,
      fieldType:   'hierarchy',
      sourceTable: h.dimTable,
      groupLabel:  'Hierarchies (P&C)',
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

    // PARAM-configured columns (Step 3): inject any that are not already in the pool.
    // These carry their PARAM table reference so paramTableId is auto-set when added to a zone.
    const poolNames = new Set(baseFields.map((f) => f.fieldName));
    const paramFields: FieldInfo[] = this.paramTables
      .filter((pt) => !poolNames.has(pt.columnName))
      .map((pt) => ({
        fieldName:   pt.columnName,
        label:       pt.columnName,
        fieldType:   'param-dimension',
        sourceTable: undefined as string | undefined,
        groupLabel:  'Parameters',
      }));

    // _Grouping virtual fields: one per PARAM table, named <colName>_Grouping.
    // Lets users group/filter data by the Grouping configured in Step 3.
    const groupingFields: FieldInfo[] = this.paramTables.map((pt) => ({
      fieldName:   `${pt.columnName}_Grouping`,
      label:       `${pt.columnName} — Grouping`,
      fieldType:   'param-grouping',
      sourceTable: undefined as string | undefined,
      groupLabel:  'Parameters',
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
    const assigned = this.assignedNames;
    const unassigned = this.allFields.filter((f) => {
      // Hierarchy (P&C) fields may appear in multiple axis zones simultaneously
      // (e.g. both Filters and Rows).  Only exclude if already present in THIS zone.
      if (f.fieldType === 'hierarchy' && zone !== 'values') {
        const zoneItems = this.layout[zone] as EntryAxisItem[];
        return !zoneItems.some((i) => i.fieldName === f.fieldName);
      }
      return !assigned.has(f.fieldName);
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
      // Auto-enable paramTableId for param-dimension and param-grouping fields.
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
  }

  removeFromZone(zone: ZoneKey, fieldName: string): void {
    if (zone === 'values') {
      this.layout.values = this.layout.values.filter((i) => i.fieldName !== fieldName);
    } else {
      (this.layout[zone] as EntryAxisItem[]) =
        (this.layout[zone] as EntryAxisItem[]).filter((i) => i.fieldName !== fieldName);
    }
  }

  toggleParam(zone: 'filters' | 'rows' | 'columns', fieldName: string): void {
    const item = (this.layout[zone] as EntryAxisItem[]).find((i) => i.fieldName === fieldName);
    if (!item) return;
    const pt = this.getParamTable(fieldName);
    if (!pt) return;
    item.paramTableId = item.paramTableId ? null : pt.paramTableId;
  }

  // ── Param table helpers ────────────────────────────────────────────────────

  getParamTable(fieldName: string): ParamTableInfo | undefined {
    return this.paramTables.find((p) => p.columnName === fieldName);
  }

  /** Finds the PARAM table for a field — handles both direct match and <col>_Grouping suffix. */
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
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  saveLayout(): void {
    this.isSaving   = true;
    this.errorMsg   = null;
    this.successMsg = null;
    this.svc.saveEntryLayout(this.reportId, this.layout).subscribe({
      next: (saved) => {
        this.layoutId   = saved.layoutId;
        this.isSaving   = false;
        this.successMsg = 'Layout saved.';
        setTimeout(() => { this.successMsg = null; }, 4000);
      },
      error: () => { this.errorMsg = 'Could not save layout.'; this.isSaving = false; },
    });
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  isAssigned(fieldName: string): boolean { return this.assignedNames.has(fieldName); }

  readonly aggregations: { value: AggregationFn; label: string }[] = [
    { value: 'SUM',   label: 'SUM — sum' },
    { value: 'COUNT', label: 'COUNT — count' },
    { value: 'AVG',   label: 'AVG — average' },
    { value: 'MIN',   label: 'MIN — minimum' },
    { value: 'MAX',   label: 'MAX — maximum' },
    { value: 'NONE',  label: 'NONE — raw value' },
  ];

  setAggregation(fieldName: string, agg: AggregationFn): void {
    const item = this.layout.values.find((i) => i.fieldName === fieldName);
    if (item) item.aggregation = agg;
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
  }

  /** Returns comma-separated string of locked members for a columns item */
  getLockedMembersText(fieldName: string): string {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    return (item?.lockedMembers ?? []).join(', ');
  }

  /** Returns count of locked members for a columns item */
  getLockedMembersCount(fieldName: string): number {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    return (item?.lockedMembers ?? []).length;
  }

  /** Parses comma-separated text and stores into item.lockedMembers */
  setLockedMembersText(fieldName: string, text: string): void {
    const item = this.layout.columns.find((i) => i.fieldName === fieldName);
    if (!item) return;
    const members = text.split(',').map((s) => s.trim()).filter(Boolean);
    (item as any).lockedMembers = members.length ? members : undefined;
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
  }

  trackByField(_: number, f: FieldInfo): string          { return f.fieldName; }
  trackByAxisItem(_: number, i: EntryAxisItem): string   { return i.fieldName; }
  trackByValueItem(_: number, i: EntryValueItem): string { return i.fieldName; }
  trackByZone(_: number, z: ZoneKey): ZoneKey            { return z; }
  trackByGroup(_: number, g: string): string             { return g; }
}
