import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import {
  DataModelSummary, DataModelDetail, CreateDataModelDto, UpdateDataModelDto,
  DatasetBinding, UpsertDatasetBindingDto,
  HierarchyDef,
  DbTableInfo, DbColumnInfo,
  ParamTableInfo, CreateParamTableDto, CustomColumnDef,
  ParamRow, UpsertParamRowDto, DistinctValuesResult, SeedResult,
  EntryLayout, EntryLayoutConfig,
  DataEntryGridResponse, SaveCellDto, CellHistoryEntry, CellHistoryRequest,
  EnsureAdjDto, EnsureAdjResult,
  TaskSummary, UpsertTaskDto, MenuTreeNode,
  RowApprovalDto, BulkRowApprovalDto,
  MasterDataTableDef, RegisterMasterDataDto, MasterDataRow, UpsertMasterDataRowDto,
} from '../models/esg-configurator.models';

@Injectable()
export class EsgConfiguratorService {
  private readonly base = '/api/configurator';

  constructor(private http: HttpClient, private authService: AuthService) {}

  private headers(): HttpHeaders {
    const token = this.authService.token;
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders({});
  }

  // ── Data Model (Report) ─────────────────────────────────────────────────────

  listReports(): Observable<DataModelSummary[]> {
    return this.http.get<DataModelSummary[]>(`${this.base}/reports`, { headers: this.headers() });
  }

  getReport(reportId: number): Observable<DataModelDetail> {
    return this.http.get<DataModelDetail>(`${this.base}/reports/${reportId}`, { headers: this.headers() });
  }

  createReport(dto: CreateDataModelDto): Observable<DataModelDetail> {
    return this.http.post<DataModelDetail>(`${this.base}/reports`, dto, { headers: this.headers() });
  }

  updateReport(reportId: number, dto: UpdateDataModelDto): Observable<DataModelDetail> {
    return this.http.patch<DataModelDetail>(`${this.base}/reports/${reportId}`, dto, { headers: this.headers() });
  }

  // ── Dataset Binding ─────────────────────────────────────────────────────────

  getBinding(reportId: number): Observable<DatasetBinding | null> {
    return this.http.get<DatasetBinding | null>(`${this.base}/reports/${reportId}/binding`, { headers: this.headers() });
  }

  upsertBinding(reportId: number, dto: UpsertDatasetBindingDto): Observable<DatasetBinding> {
    return this.http.put<DatasetBinding>(`${this.base}/reports/${reportId}/binding`, dto, { headers: this.headers() });
  }

  // ── Hierarchy Definitions ───────────────────────────────────────────────────

  listHierarchyDefs(reportId: number): Observable<HierarchyDef[]> {
    return this.http.get<HierarchyDef[]>(
      `${this.base}/reports/${reportId}/hierarchy-defs`,
      { headers: this.headers() },
    );
  }

  saveHierarchyDef(reportId: number, def: HierarchyDef): Observable<HierarchyDef> {
    if (def.hierarchyDefId) {
      return this.http.put<HierarchyDef>(
        `${this.base}/hierarchy-defs/${def.hierarchyDefId}`,
        def,
        { headers: this.headers() },
      );
    }
    return this.http.post<HierarchyDef>(
      `${this.base}/reports/${reportId}/hierarchy-defs`,
      def,
      { headers: this.headers() },
    );
  }

  deleteHierarchyDef(defId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/hierarchy-defs/${defId}`,
      { headers: this.headers() },
    );
  }

  // ── DB Explorer ─────────────────────────────────────────────────────────────

  listDbTables(): Observable<DbTableInfo[]> {
    return this.http.get<DbTableInfo[]>(`${this.base}/db/tables`, { headers: this.headers() });
  }

  getTableColumns(schemaName: string, tableName: string): Observable<DbColumnInfo[]> {
    return this.http.get<DbColumnInfo[]>(
      `${this.base}/db/tables/${schemaName}/${tableName}/columns`,
      { headers: this.headers() },
    );
  }

  // ── Dim Table Direct CRUD ───────────────────────────────────────────────────

  getDimTableRows(schema: string, table: string): Observable<Record<string, unknown>[]> {
    return this.http.get<Record<string, unknown>[]>(
      `${this.base}/dim-table/${schema}/${table}/rows`, { headers: this.headers() });
  }

  insertDimTableRow(schema: string, table: string, values: Record<string, string | null>): Observable<void> {
    return this.http.post<void>(
      `${this.base}/dim-table/${schema}/${table}/rows`, { values }, { headers: this.headers() });
  }

  updateDimTableRow(schema: string, table: string, pkCol: string, pk: string, values: Record<string, string | null>): Observable<void> {
    return this.http.put<void>(
      `${this.base}/dim-table/${schema}/${table}/rows/${encodeURIComponent(pkCol)}/${encodeURIComponent(pk)}`,
      { values }, { headers: this.headers() });
  }

  deleteDimTableRow(schema: string, table: string, pkCol: string, pk: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/dim-table/${schema}/${table}/rows/${encodeURIComponent(pkCol)}/${encodeURIComponent(pk)}`,
      { headers: this.headers() });
  }

  // ── Parameter Tables ────────────────────────────────────────────────────────

  listParamTables(reportId: number): Observable<ParamTableInfo[]> {
    return this.http.get<ParamTableInfo[]>(
      `${this.base}/reports/${reportId}/param-tables`,
      { headers: this.headers() },
    );
  }

  createParamTable(reportId: number, dto: CreateParamTableDto): Observable<ParamTableInfo> {
    return this.http.post<ParamTableInfo>(
      `${this.base}/reports/${reportId}/param-tables`,
      dto,
      { headers: this.headers() },
    );
  }

  getDistinctValues(schema: string, table: string, column: string, limit = 500): Observable<DistinctValuesResult> {
    return this.http.get<DistinctValuesResult>(
      `${this.base}/db/tables/${schema}/${table}/columns/${column}/distinct?limit=${limit}`,
      { headers: this.headers() },
    );
  }

  getParamRows(paramTableId: number): Observable<ParamRow[]> {
    return this.http.get<ParamRow[]>(
      `${this.base}/param-tables/${paramTableId}/rows`,
      { headers: this.headers() },
    ).pipe(map(rows => rows.map(r => this.normalizeParamRow(r))));
  }

  addParamRow(paramTableId: number, dto: UpsertParamRowDto): Observable<ParamRow> {
    return this.http.post<ParamRow>(
      `${this.base}/param-tables/${paramTableId}/rows`,
      this.denormalizeParamRowDto(dto),
      { headers: this.headers() },
    ).pipe(map(r => this.normalizeParamRow(r)));
  }

  updateParamRow(paramTableId: number, paramId: number, dto: UpsertParamRowDto): Observable<ParamRow> {
    return this.http.put<ParamRow>(
      `${this.base}/param-tables/${paramTableId}/rows/${paramId}`,
      this.denormalizeParamRowDto(dto),
      { headers: this.headers() },
    ).pipe(map(r => this.normalizeParamRow(r)));
  }

  deleteParamRow(paramTableId: number, paramId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/param-tables/${paramTableId}/rows/${paramId}`,
      { headers: this.headers() },
    );
  }

  seedParamTable(paramTableId: number): Observable<SeedResult> {
    return this.http.post<SeedResult>(
      `${this.base}/param-tables/${paramTableId}/seed`,
      {},
      { headers: this.headers() },
    );
  }

  reorderParamRows(paramTableId: number, orderedIds: number[]): Observable<void> {
    return this.http.put<void>(
      `${this.base}/param-tables/${paramTableId}/rows/reorder`,
      { orderedIds },
      { headers: this.headers() },
    );
  }

  moveParamRow(paramTableId: number, paramId: number, direction: 'up' | 'down'): Observable<void> {
    return this.http.patch<void>(
      `${this.base}/param-tables/${paramTableId}/rows/${paramId}/move`,
      { direction },
      { headers: this.headers() },
    );
  }

  updateCustomColumns(paramTableId: number, columns: CustomColumnDef[]): Observable<ParamTableInfo> {
    return this.http.put<ParamTableInfo>(
      `${this.base}/param-tables/${paramTableId}/custom-columns`,
      { columns },
      { headers: this.headers() },
    );
  }

  dropParamTable(paramTableId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/param-tables/${paramTableId}`,
      { headers: this.headers() },
    );
  }

  // ── Entry Layout ────────────────────────────────────────────────────────────

  getEntryLayout(reportId: number): Observable<EntryLayout | null> {
    return this.http.get<EntryLayout | null>(
      `${this.base}/reports/${reportId}/entry-layout`,
      { headers: this.headers() },
    ).pipe(map(layout => layout ? this.normalizeEntryLayout(layout) : null));
  }

  saveEntryLayout(reportId: number, config: EntryLayoutConfig): Observable<EntryLayout> {
    // Send both new and legacy keys so old backend still works
    const legacyConfig = {
      ...config,
      filtri:  config.filters,
      righe:   config.rows,
      colonne: config.columns,
      valori:  config.values,
    };
    return this.http.put<EntryLayout>(
      `${this.base}/reports/${reportId}/entry-layout`,
      { config: legacyConfig },
      { headers: this.headers() },
    ).pipe(map(layout => this.normalizeEntryLayout(layout)));
  }

  // ── Data Entry Sheet ────────────────────────────────────────────────────────

  getDataEntryGrid(reportId: number): Observable<DataEntryGridResponse> {
    return this.http.get<DataEntryGridResponse>(
      `${this.base}/reports/${reportId}/data-entry/grid`,
      { headers: this.headers() },
    ).pipe(map(r => this.normalizeGridResponse(r)));
  }

  saveDataEntryCell(reportId: number, dto: SaveCellDto): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(
      `${this.base}/reports/${reportId}/data-entry/cell`,
      dto,
      { headers: this.headers() },
    );
  }

  insertManualRow(reportId: number, dimensionValues: Record<string, string>): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.base}/reports/${reportId}/data-entry/manual-row`,
      { dimensionValues },
      { headers: this.headers() },
    );
  }

  getCellHistory(reportId: number, req: CellHistoryRequest): Observable<CellHistoryEntry[]> {
    return this.http.post<CellHistoryEntry[]>(
      `${this.base}/reports/${reportId}/data-entry/cell-history`,
      req,
      { headers: this.headers() },
    );
  }

  ensureManualAdj(reportId: number, dto: EnsureAdjDto): Observable<EnsureAdjResult> {
    return this.http.post<EnsureAdjResult>(
      `${this.base}/reports/${reportId}/data-entry/ensure-adj`,
      dto,
      { headers: this.headers() },
    );
  }

  // ── Tasks / Publish ─────────────────────────────────────────────────────────

  listTasks(reportId: number): Observable<TaskSummary[]> {
    return this.http.get<TaskSummary[]>(
      `${this.base}/reports/${reportId}/tasks`,
      { headers: this.headers() },
    );
  }

  /** Lists ALL tasks across reports (uses /api/tasks, not /api/configurator). */
  listAllTasks(opts?: { status?: string; domain?: string }): Observable<TaskSummary[]> {
    const params: string[] = [];
    if (opts?.status) params.push(`status=${encodeURIComponent(opts.status)}`);
    if (opts?.domain) params.push(`domain=${encodeURIComponent(opts.domain)}`);
    const qs = params.length ? '?' + params.join('&') : '';
    return this.http.get<TaskSummary[]>(`/api/tasks${qs}`, { headers: this.headers() });
  }

  createTask(reportId: number, dto: UpsertTaskDto): Observable<TaskSummary> {
    return this.http.post<TaskSummary>(
      `${this.base}/reports/${reportId}/tasks`,
      dto,
      { headers: this.headers() },
    );
  }

  updateTask(taskId: number, dto: UpsertTaskDto): Observable<TaskSummary> {
    return this.http.put<TaskSummary>(
      `${this.base}/tasks/${taskId}`,
      dto,
      { headers: this.headers() },
    );
  }

  activateTask(taskId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/tasks/${taskId}/activate`,
      {},
      { headers: this.headers() },
    );
  }

  archiveTask(taskId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/tasks/${taskId}/archive`,
      {},
      { headers: this.headers() },
    );
  }

  duplicateReport(reportId: number): Observable<DataModelDetail> {
    return this.http.post<DataModelDetail>(
      `${this.base}/reports/${reportId}/duplicate`,
      {},
      { headers: this.headers() },
    );
  }

  duplicateTask(taskId: number): Observable<TaskSummary> {
    return this.http.post<TaskSummary>(
      `${this.base}/tasks/${taskId}/duplicate`,
      {},
      { headers: this.headers() },
    );
  }

  deleteTask(taskId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/tasks/${taskId}`,
      { headers: this.headers() },
    );
  }

  // ── Snapshot ────────────────────────────────────────────────────────────────

  createSnapshot(taskId: number, reportId: number): Observable<{ snapshotId: number }> {
    return this.http.post<{ snapshotId: number }>(
      `${this.base}/tasks/${taskId}/snapshot`,
      { reportId },
      { headers: this.headers() },
    );
  }

  getActiveSnapshot(taskId: number): Observable<{ snapshotId: number; taskId: number; reportId: number }> {
    return this.http.get<{ snapshotId: number; taskId: number; reportId: number }>(
      `${this.base}/tasks/${taskId}/snapshot/active`,
      { headers: this.headers() },
    );
  }

  getSnapshotGrid(snapshotId: number): Observable<DataEntryGridResponse> {
    return this.http.get<DataEntryGridResponse>(
      `${this.base}/snapshots/${snapshotId}/grid`,
      { headers: this.headers() },
    ).pipe(map(r => this.normalizeGridResponse(r)));
  }

  saveSnapshotCell(snapshotId: number, dto: SaveCellDto): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(
      `${this.base}/snapshots/${snapshotId}/cell`,
      dto,
      { headers: this.headers() },
    );
  }

  getMenuTree(): Observable<MenuTreeNode[]> {
    return this.http.get<MenuTreeNode[]>(
      `${this.base}/menu-tree`,
      { headers: this.headers() },
    );
  }

  createMenuItem(code: string, label: string, parentCode: string | null): Observable<void> {
    return this.http.post<void>(
      `${this.base}/menu-items`,
      { code, label, parentCode },
      { headers: this.headers() },
    );
  }

  // ── Normalizers (backend → frontend field mapping) ──────────────────────────

  /**
   * Backend still uses Italian field names (raggruppamento, guidaCompilazione, etc.)
   * Map them to the new English names transparently.
   */
  private normalizeParamRow(r: any): ParamRow {
    return {
      paramId:          r.paramId,
      sourceValue:      r.sourceValue,
      label:            r.label,
      rowKind:          this.normalizeRowKind(r.rowKind),
      indentLevel:      r.indentLevel ?? 0,
      parentParamId:    r.parentParamId ?? null,
      grouping:         r.grouping ?? r.raggruppamento ?? null,
      formula:          r.formula ?? null,
      compilationGuide: r.compilationGuide ?? r.guidaCompilazione ?? null,
      isEditable:       !!r.isEditable,
      isFormula:        !!r.isFormula,
      isVisible:        r.isVisible !== false,
      sortOrder:        r.sortOrder ?? 0,
      customColumns:    r.customColumns ?? null,
    };
  }

  private denormalizeParamRowDto(dto: UpsertParamRowDto): any {
    return {
      ...dto,
      raggruppamento:   dto.grouping,
      guidaCompilazione: dto.compilationGuide,
      rowKind:          this.denormalizeRowKind(dto.rowKind),
    };
  }

  private normalizeRowKind(rk: string): 'Aggregate' | 'Indicator' {
    if (rk === 'Aggregato') return 'Aggregate';
    if (rk === 'Indicatore') return 'Indicator';
    return (rk as 'Aggregate' | 'Indicator') ?? 'Indicator';
  }

  private denormalizeRowKind(rk?: string): string {
    if (rk === 'Aggregate') return 'Aggregato';
    if (rk === 'Indicator') return 'Indicatore';
    return rk ?? 'Indicatore';
  }

  private normalizeEntryLayout(layout: any): EntryLayout {
    const cfg = layout.config ?? {};
    return {
      ...layout,
      config: {
        filters: cfg.filters ?? cfg.filtri  ?? [],
        rows:    cfg.rows    ?? cfg.righe   ?? [],
        columns: cfg.columns ?? cfg.colonne ?? [],
        values:  cfg.values  ?? cfg.valori  ?? [],
      },
    };
  }

  private normalizeGridResponse(r: any): DataEntryGridResponse {
    const layout = r.layout ?? {};
    const normalizedLayout = {
      filters:  layout.filters  ?? layout.filtri  ?? [],
      rows:     layout.rows     ?? layout.righe   ?? [],
      columns:  layout.columns  ?? layout.colonne ?? [],
      values:   layout.values   ?? layout.valori  ?? [],
    };
    return {
      ...r,
      layout:        normalizedLayout,
      filterOptions: r.filterOptions ?? r.filtriOptions  ?? [],
      rowOptions:    (r.rowOptions   ?? r.righeOptions   ?? []).map((ro: any) => this.normalizeRowOption(ro)),
      columnOptions: r.columnOptions ?? r.colonneOptions ?? [],
      approvedRows:  r.approvedRows ?? [],
    };
  }

  // ── Row Approval ────────────────────────────────────────────────────────────

  getRowApprovals(reportId: number): Observable<string[]> {
    return this.http
      .get<{ approvedRows: string[] }>(`${this.base}/reports/${reportId}/data-entry/row-approvals`, { headers: this.headers() })
      .pipe(map((r) => r.approvedRows));
  }

  setRowApproval(reportId: number, dto: RowApprovalDto): Observable<void> {
    return this.http.put<void>(`${this.base}/reports/${reportId}/data-entry/row-approval`, dto, { headers: this.headers() });
  }

  bulkSetRowApproval(reportId: number, dto: BulkRowApprovalDto): Observable<void> {
    return this.http.put<void>(`${this.base}/reports/${reportId}/data-entry/row-approval/bulk`, dto, { headers: this.headers() });
  }

  // ── Master Data (Anagrafiche) ────────────────────────────────────────────────

  listMasterDataTables(reportId: number): Observable<MasterDataTableDef[]> {
    return this.http.get<MasterDataTableDef[]>(`${this.base}/reports/${reportId}/master-data`, { headers: this.headers() });
  }

  registerMasterDataTable(reportId: number, dto: RegisterMasterDataDto): Observable<{ masterDataId: number }> {
    return this.http.post<{ masterDataId: number }>(`${this.base}/reports/${reportId}/master-data`, dto, { headers: this.headers() });
  }

  unregisterMasterDataTable(reportId: number, masterDataId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/reports/${reportId}/master-data/${masterDataId}`, { headers: this.headers() });
  }

  getMasterDataRows(reportId: number, masterDataId: number): Observable<MasterDataRow[]> {
    return this.http.get<MasterDataRow[]>(`${this.base}/reports/${reportId}/master-data/${masterDataId}/rows`, { headers: this.headers() });
  }

  insertMasterDataRow(reportId: number, masterDataId: number, dto: UpsertMasterDataRowDto): Observable<void> {
    return this.http.post<void>(`${this.base}/reports/${reportId}/master-data/${masterDataId}/rows`, dto, { headers: this.headers() });
  }

  updateMasterDataRow(reportId: number, masterDataId: number, pkValue: string, dto: UpsertMasterDataRowDto): Observable<void> {
    return this.http.put<void>(`${this.base}/reports/${reportId}/master-data/${masterDataId}/rows/${encodeURIComponent(pkValue)}`, dto, { headers: this.headers() });
  }

  deleteMasterDataRow(reportId: number, masterDataId: number, pkValue: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/reports/${reportId}/master-data/${masterDataId}/rows/${encodeURIComponent(pkValue)}`, { headers: this.headers() });
  }

  private normalizeRowOption(ro: any): any {
    if (!ro.paramRow) return ro;
    return {
      ...ro,
      paramRow: {
        ...ro.paramRow,
        grouping:         ro.paramRow.grouping         ?? ro.paramRow.raggruppamento ?? null,
        compilationGuide: ro.paramRow.compilationGuide ?? ro.paramRow.guidaCompilazione ?? null,
        rowKind:          this.normalizeRowKind(ro.paramRow.rowKind),
      },
    };
  }
}
