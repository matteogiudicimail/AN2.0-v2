/**
 * ConfiguratorService — HTTP facade for all /api/configurator endpoints.
 * Delegates auth to ApiService (Bearer token injected per request).
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../services/api.service';
import {
  ReportSummary, ReportDetail, CreateReportDto, UpdateReportDto,
  DatasetBinding, UpsertDatasetBindingDto,
  ReportRowDef, UpsertRowDto,
  ReportColumnDef, UpsertColumnDto,
  ReportFilterDef, UpsertFilterDto,
  ReportSectionDef, UpsertSectionDto,
  ReportLayout, UpsertLayoutDto,
  DbTableInfo, DbColumnInfo,
  ConfigAuditEntry,
} from '../models/configurator.models';

@Injectable()
export class ConfiguratorService {
  private readonly base = '/configurator';

  constructor(private api: ApiService) {}

  // ── Reports ────────────────────────────────────────────────────────────────

  listReports(): Observable<ReportSummary[]> {
    return this.api.get<ReportSummary[]>(`${this.base}/reports`);
  }

  getReport(reportId: number): Observable<ReportDetail> {
    return this.api.get<ReportDetail>(`${this.base}/reports/${reportId}`);
  }

  createReport(dto: CreateReportDto): Observable<ReportDetail> {
    return this.api.post<ReportDetail>(`${this.base}/reports`, dto);
  }

  updateReport(reportId: number, dto: UpdateReportDto): Observable<ReportDetail> {
    return this.api.patch<ReportDetail>(`${this.base}/reports/${reportId}`, dto);
  }

  publishReport(reportId: number): Observable<void> {
    return this.api.post<void>(`${this.base}/reports/${reportId}/publish`, {});
  }

  archiveReport(reportId: number): Observable<void> {
    return this.api.post<void>(`${this.base}/reports/${reportId}/archive`, {});
  }

  // ── Dataset Binding ────────────────────────────────────────────────────────

  getBinding(reportId: number): Observable<DatasetBinding | null> {
    return this.api.get<DatasetBinding | null>(`${this.base}/reports/${reportId}/binding`);
  }

  upsertBinding(reportId: number, dto: UpsertDatasetBindingDto): Observable<DatasetBinding> {
    return this.api.put<DatasetBinding>(`${this.base}/reports/${reportId}/binding`, dto);
  }

  // ── Rows ───────────────────────────────────────────────────────────────────

  getRows(reportId: number): Observable<ReportRowDef[]> {
    return this.api.get<ReportRowDef[]>(`${this.base}/reports/${reportId}/rows`);
  }

  upsertRow(reportId: number, rowId: number | null, dto: UpsertRowDto): Observable<ReportRowDef> {
    if (rowId) {
      return this.api.put<ReportRowDef>(`${this.base}/reports/${reportId}/rows/${rowId}`, dto);
    }
    return this.api.post<ReportRowDef>(`${this.base}/reports/${reportId}/rows`, dto);
  }

  deleteRow(reportId: number, rowId: number): Observable<void> {
    return this.api.delete<void>(`${this.base}/reports/${reportId}/rows/${rowId}`);
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  getColumns(reportId: number): Observable<ReportColumnDef[]> {
    return this.api.get<ReportColumnDef[]>(`${this.base}/reports/${reportId}/columns`);
  }

  upsertColumn(reportId: number, columnId: number | null, dto: UpsertColumnDto): Observable<ReportColumnDef> {
    if (columnId) {
      return this.api.put<ReportColumnDef>(`${this.base}/reports/${reportId}/columns/${columnId}`, dto);
    }
    return this.api.post<ReportColumnDef>(`${this.base}/reports/${reportId}/columns`, dto);
  }

  deleteColumn(reportId: number, columnId: number): Observable<void> {
    return this.api.delete<void>(`${this.base}/reports/${reportId}/columns/${columnId}`);
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  getFilters(reportId: number): Observable<ReportFilterDef[]> {
    return this.api.get<ReportFilterDef[]>(`${this.base}/reports/${reportId}/filters`);
  }

  upsertFilter(reportId: number, filterId: number | null, dto: UpsertFilterDto): Observable<ReportFilterDef> {
    if (filterId) {
      return this.api.put<ReportFilterDef>(`${this.base}/reports/${reportId}/filters/${filterId}`, dto);
    }
    return this.api.post<ReportFilterDef>(`${this.base}/reports/${reportId}/filters`, dto);
  }

  deleteFilter(reportId: number, filterId: number): Observable<void> {
    return this.api.delete<void>(`${this.base}/reports/${reportId}/filters/${filterId}`);
  }

  // ── Sections ───────────────────────────────────────────────────────────────

  getSections(reportId: number): Observable<ReportSectionDef[]> {
    return this.api.get<ReportSectionDef[]>(`${this.base}/reports/${reportId}/sections`);
  }

  upsertSection(reportId: number, sectionId: number | null, dto: UpsertSectionDto): Observable<ReportSectionDef> {
    if (sectionId) {
      return this.api.put<ReportSectionDef>(`${this.base}/reports/${reportId}/sections/${sectionId}`, dto);
    }
    return this.api.post<ReportSectionDef>(`${this.base}/reports/${reportId}/sections`, dto);
  }

  deleteSection(reportId: number, sectionId: number): Observable<void> {
    return this.api.delete<void>(`${this.base}/reports/${reportId}/sections/${sectionId}`);
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  getLayout(reportId: number): Observable<ReportLayout | null> {
    return this.api.get<ReportLayout | null>(`${this.base}/reports/${reportId}/layout`);
  }

  upsertLayout(reportId: number, dto: UpsertLayoutDto): Observable<ReportLayout> {
    return this.api.put<ReportLayout>(`${this.base}/reports/${reportId}/layout`, dto);
  }

  // ── DB Explorer ────────────────────────────────────────────────────────────

  listDbTables(): Observable<DbTableInfo[]> {
    return this.api.get<DbTableInfo[]>(`${this.base}/db/tables`);
  }

  getTableColumns(schemaName: string, tableName: string): Observable<DbColumnInfo[]> {
    return this.api.get<DbColumnInfo[]>(`${this.base}/db/tables/${schemaName}/${tableName}/columns`);
  }

  // ── Audit ──────────────────────────────────────────────────────────────────

  getAuditLog(reportId?: number): Observable<ConfigAuditEntry[]> {
    const qs = reportId ? `?reportId=${reportId}` : '';
    return this.api.get<ConfigAuditEntry[]>(`${this.base}/audit${qs}`);
  }
}
