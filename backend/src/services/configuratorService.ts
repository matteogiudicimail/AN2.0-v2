/**
 * Configurator Service — gestisce report, dataset binding, righe, colonne,
 * filtri, sezioni, layout. Logica di business in questo servizio. [V6]
 */
import { dbAll, dbGet, dbRun, dbInsertGetId } from '../config/dbHelpers';
import {
  ReportSummary, ReportDetail, CreateReportDto, UpdateReportDto,
  DatasetBinding, UpsertDatasetBindingDto,
  ReportRowDef, UpsertRowDto,
  ReportColumnDef, UpsertColumnDto,
  ReportFilterDef, UpsertFilterDto,
  ReportSectionDef, UpsertSectionDto,
  ReportLayout, UpsertLayoutDto,
  DbTableInfo, DbColumnInfo,
  ReportDefinitionFull, ReportPresetFilters, ReportFilterConfig, FilterFieldConfig,
} from '../models/configurator.models';
import { logConfigEvent } from './configAuditService';
import { listHierarchyDefs } from './hierarchyDefService';
import {
  ReportStatus, WritebackMode, RowType, SectionType, LayoutStyle,
} from '../models/configurator.models';

// ── Raw DB row interfaces (PascalCase = SQL Server column names) ───────────────

interface RawReportSummary {
  ReportId: number; ReportCode: string; ReportLabel: string;
  Domain: string | null; Category: string | null;
  Status: string; Version: number; WritebackMode: string;
  CreatedBy: string; CreatedAt: string; UpdatedAt: string | null; IsActive: number;
}

interface RawReportDetail extends RawReportSummary {
  Description: string | null; Tags: string | null; Owner: string | null;
}

// ── Report CRUD ────────────────────────────────────────────────────────────────

export async function listReports(_userId: string): Promise<ReportSummary[]> {
  const rows = await dbAll<RawReportSummary>(
    `SELECT ReportId, ReportCode, ReportLabel, Domain, Category, Status, Version,
            WritebackMode, CreatedBy, CreatedAt, UpdatedAt, IsActive
     FROM cfg_Report
     WHERE IsActive = 1
     ORDER BY UpdatedAt DESC, CreatedAt DESC`
  );
  return rows.map((r) => ({
    reportId:      r.ReportId,
    reportCode:    r.ReportCode,
    reportLabel:   r.ReportLabel,
    domain:        r.Domain,
    category:      r.Category,
    status:        r.Status        as ReportStatus,
    version:       r.Version,
    writebackMode: r.WritebackMode as WritebackMode,
    createdBy:     r.CreatedBy,
    createdAt:     r.CreatedAt,
    updatedAt:     r.UpdatedAt,
  }));
}

export async function getReport(reportId: number): Promise<ReportDetail | null> {
  const row = await dbGet<RawReportDetail>(
    `SELECT TOP 1 ReportId, ReportCode, ReportLabel, Description, Domain, Category,
            Tags, Owner, Status, Version, WritebackMode,
            CreatedBy, CreatedAt, UpdatedAt, IsActive
     FROM cfg_Report WHERE ReportId = ?`,
    reportId
  );
  if (!row) return null;
  return {
    reportId:      row.ReportId,
    reportCode:    row.ReportCode,
    reportLabel:   row.ReportLabel,
    description:   row.Description,
    domain:        row.Domain,
    category:      row.Category,
    tags:          row.Tags,
    owner:         row.Owner,
    status:        row.Status        as ReportStatus,
    version:       row.Version,
    writebackMode: row.WritebackMode as WritebackMode,
    createdBy:     row.CreatedBy,
    createdAt:     row.CreatedAt,
    updatedAt:     row.UpdatedAt,
    isActive:      Boolean(row.IsActive),
  };
}

export async function createReport(dto: CreateReportDto, userId: string): Promise<number> {
  const now = new Date().toISOString();
  const reportId = await dbInsertGetId(
    `INSERT INTO cfg_Report
       (ReportCode, ReportLabel, Description, Domain, Category, Tags, Owner,
        Status, Version, WritebackMode, CreatedBy, CreatedAt, IsActive)
     VALUES (?,?,?,?,?,?,?,'Draft',1,?,?,?,1)`,
    dto.reportCode, dto.reportLabel,
    dto.description ?? null, dto.domain ?? null, dto.category ?? null,
    dto.tags ?? null, dto.owner ?? null,
    dto.writebackMode ?? 'Overwrite', userId, now
  );

  // Create default layout
  await dbRun(
    `INSERT INTO cfg_ReportLayout (ReportId) VALUES (?)`,
    reportId
  );

  await logConfigEvent('ReportCreated', 'Report', String(reportId), reportId, null, { dto }, userId);
  return reportId;
}

export async function updateReport(reportId: number, dto: UpdateReportDto, userId: string): Promise<void> {
  const old = await getReport(reportId);
  const now = new Date().toISOString();

  const fields: string[] = [];
  const params: unknown[] = [];

  if (dto.reportLabel  !== undefined) { fields.push('ReportLabel=?');  params.push(dto.reportLabel); }
  if (dto.description  !== undefined) { fields.push('Description=?');  params.push(dto.description); }
  if (dto.domain       !== undefined) { fields.push('Domain=?');       params.push(dto.domain); }
  if (dto.category     !== undefined) { fields.push('Category=?');     params.push(dto.category); }
  if (dto.tags         !== undefined) { fields.push('Tags=?');         params.push(dto.tags); }
  if (dto.owner        !== undefined) { fields.push('Owner=?');        params.push(dto.owner); }
  if (dto.writebackMode !== undefined) { fields.push('WritebackMode=?'); params.push(dto.writebackMode); }
  if (dto.status       !== undefined) { fields.push('Status=?');       params.push(dto.status); }

  if (fields.length === 0) return;

  fields.push('UpdatedBy=?'); params.push(userId);
  fields.push('UpdatedAt=?'); params.push(now);
  params.push(reportId);

  await dbRun(`UPDATE cfg_Report SET ${fields.join(', ')} WHERE ReportId = ?`, ...params);
  await logConfigEvent('ReportUpdated', 'Report', String(reportId), reportId, old, dto, userId);
}

export async function publishReport(reportId: number, userId: string): Promise<void> {
  await updateReport(reportId, { status: 'Published' }, userId);
  await logConfigEvent('ReportPublished', 'Report', String(reportId), reportId, null, null, userId);
}

export async function archiveReport(reportId: number, userId: string): Promise<void> {
  await updateReport(reportId, { status: 'Archived' }, userId);
  await logConfigEvent('ReportArchived', 'Report', String(reportId), reportId, null, null, userId);
}

// ── Dataset Binding ────────────────────────────────────────────────────────────

export async function getDatasetBinding(reportId: number): Promise<DatasetBinding | null> {
  type FullRow = {
    BindingId: number; ReportId: number; FactTable: string; FactTableSmartName: string | null;
    FieldMappings: string | null; JoinConfig: string | null; CreatedBy: string; CreatedAt: string;
  };
  const mapBinding = async (row: Omit<FullRow, 'FactTableSmartName'> & { FactTableSmartName?: string | null }): Promise<DatasetBinding> => {
    const hierarchyDefs = await listHierarchyDefs(reportId).catch(() => []);
    return {
      bindingId:          row.BindingId,
      reportId:           row.ReportId,
      factTable:          row.FactTable,
      factTableSmartName: row.FactTableSmartName ?? undefined,
      fieldMappings:      row.FieldMappings ? JSON.parse(row.FieldMappings) : [],
      joinConfig:         row.JoinConfig    ? JSON.parse(row.JoinConfig)    : [],
      hierarchyDefs,
      createdBy:          row.CreatedBy,
      createdAt:          row.CreatedAt,
    };
  };

  try {
    const row = await dbGet<FullRow>(
      `SELECT TOP 1 BindingId, ReportId, FactTable, FactTableSmartName,
              FieldMappings, JoinConfig, CreatedBy, CreatedAt
       FROM cfg_DatasetBinding WHERE ReportId = ?`,
      reportId
    );
    return row ? await mapBinding(row) : null;
  } catch (err: any) {
    // Migration not yet run: FactTableSmartName column does not exist yet — fall back
    if (err?.number === 207 || String(err?.message).includes('FactTableSmartName')) {
      const row = await dbGet<Omit<FullRow, 'FactTableSmartName'>>(
        `SELECT TOP 1 BindingId, ReportId, FactTable,
                FieldMappings, JoinConfig, CreatedBy, CreatedAt
         FROM cfg_DatasetBinding WHERE ReportId = ?`,
        reportId
      );
      return row ? await mapBinding(row) : null;
    }
    throw err;
  }
}

export async function upsertDatasetBinding(
  reportId: number, dto: UpsertDatasetBindingDto, userId: string
): Promise<void> {
  const old = await getDatasetBinding(reportId);
  const now = new Date().toISOString();

  const tryUpsertWithSmartName = async (): Promise<void> => {
    if (old) {
      await dbRun(
        `UPDATE cfg_DatasetBinding
         SET FactTable=?, FactTableSmartName=?, FieldMappings=?, JoinConfig=?,
             UpdatedBy=?, UpdatedAt=?
         WHERE ReportId=?`,
        dto.factTable, dto.factTableSmartName ?? null,
        JSON.stringify(dto.fieldMappings), JSON.stringify(dto.joinConfig),
        userId, now, reportId
      );
    } else {
      await dbRun(
        `INSERT INTO cfg_DatasetBinding
           (ReportId, FactTable, FactTableSmartName, FieldMappings, JoinConfig, CreatedBy, CreatedAt)
         VALUES (?,?,?,?,?,?,?)`,
        reportId, dto.factTable, dto.factTableSmartName ?? null,
        JSON.stringify(dto.fieldMappings), JSON.stringify(dto.joinConfig), userId, now
      );
    }
  };

  const tryUpsertWithoutSmartName = async (): Promise<void> => {
    if (old) {
      await dbRun(
        `UPDATE cfg_DatasetBinding
         SET FactTable=?, FieldMappings=?, JoinConfig=?, UpdatedBy=?, UpdatedAt=?
         WHERE ReportId=?`,
        dto.factTable,
        JSON.stringify(dto.fieldMappings), JSON.stringify(dto.joinConfig),
        userId, now, reportId
      );
    } else {
      await dbRun(
        `INSERT INTO cfg_DatasetBinding
           (ReportId, FactTable, FieldMappings, JoinConfig, CreatedBy, CreatedAt)
         VALUES (?,?,?,?,?,?)`,
        reportId, dto.factTable,
        JSON.stringify(dto.fieldMappings), JSON.stringify(dto.joinConfig), userId, now
      );
    }
  };

  try {
    await tryUpsertWithSmartName();
  } catch (err: any) {
    if (err?.number === 207 || String(err?.message).includes('FactTableSmartName')) {
      await tryUpsertWithoutSmartName();
    } else {
      throw err;
    }
  }
  await logConfigEvent('DatasetBindingChanged', 'DatasetBinding', String(reportId), reportId, old, dto, userId);
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export async function getRows(reportId: number): Promise<ReportRowDef[]> {
  const rows = await dbAll<{
    RowId: number; ReportId: number; RowCode: string; Label: string;
    UnitOfMeasure: string | null; RowType: string; ParentRowCode: string | null;
    IndentLevel: number; IsEditable: number; IsVisible: number; SortOrder: number;
    MeasureField: string | null; DimensionMembers: string | null;
    SubtotalConfig: string | null; SectionCode: string | null; SubsectionCode: string | null;
  }>(
    `SELECT RowId, ReportId, RowCode, Label, UnitOfMeasure, RowType, ParentRowCode,
            IndentLevel, IsEditable, IsVisible, SortOrder, MeasureField,
            DimensionMembers, SubtotalConfig, SectionCode, SubsectionCode
     FROM cfg_ReportRow WHERE ReportId = ? ORDER BY SortOrder`,
    reportId
  );
  return rows.map((r) => ({
    rowId:            r.RowId,
    reportId:         r.ReportId,
    rowCode:          r.RowCode,
    label:            r.Label,
    unitOfMeasure:    r.UnitOfMeasure,
    rowType:          r.RowType          as RowType,
    parentRowCode:    r.ParentRowCode,
    indentLevel:      r.IndentLevel,
    isEditable:       Boolean(r.IsEditable),
    isVisible:        Boolean(r.IsVisible),
    sortOrder:        r.SortOrder,
    measureField:     r.MeasureField,
    dimensionMembers: r.DimensionMembers ? JSON.parse(r.DimensionMembers) : null,
    subtotalConfig:   r.SubtotalConfig   ? JSON.parse(r.SubtotalConfig)   : null,
    sectionCode:      r.SectionCode,
    subsectionCode:   r.SubsectionCode,
  }));
}

export async function upsertRow(reportId: number, dto: UpsertRowDto, _userId: string): Promise<number> {
  const existing = await dbGet<{ RowId: number }>(
    'SELECT TOP 1 RowId FROM cfg_ReportRow WHERE ReportId=? AND RowCode=?',
    reportId, dto.rowCode
  );

  if (existing) {
    await dbRun(
      `UPDATE cfg_ReportRow SET Label=?, UnitOfMeasure=?, RowType=?, ParentRowCode=?,
       IndentLevel=?, IsEditable=?, IsVisible=?, SortOrder=?, MeasureField=?,
       DimensionMembers=?, SubtotalConfig=?, SectionCode=?, SubsectionCode=?
       WHERE RowId=?`,
      dto.label, dto.unitOfMeasure ?? null, dto.rowType ?? 'Input',
      dto.parentRowCode ?? null, dto.indentLevel ?? 0,
      dto.isEditable !== false ? 1 : 0, dto.isVisible !== false ? 1 : 0,
      dto.sortOrder ?? 0, dto.measureField ?? null,
      dto.dimensionMembers ? JSON.stringify(dto.dimensionMembers) : null,
      dto.subtotalConfig   ? JSON.stringify(dto.subtotalConfig)   : null,
      dto.sectionCode ?? null, dto.subsectionCode ?? null,
      existing.RowId
    );
    return existing.RowId;
  }

  return dbInsertGetId(
    `INSERT INTO cfg_ReportRow
       (ReportId, RowCode, Label, UnitOfMeasure, RowType, ParentRowCode,
        IndentLevel, IsEditable, IsVisible, SortOrder, MeasureField,
        DimensionMembers, SubtotalConfig, SectionCode, SubsectionCode)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    reportId, dto.rowCode, dto.label, dto.unitOfMeasure ?? null,
    dto.rowType ?? 'Input', dto.parentRowCode ?? null, dto.indentLevel ?? 0,
    dto.isEditable !== false ? 1 : 0, dto.isVisible !== false ? 1 : 0,
    dto.sortOrder ?? 0, dto.measureField ?? null,
    dto.dimensionMembers ? JSON.stringify(dto.dimensionMembers) : null,
    dto.subtotalConfig   ? JSON.stringify(dto.subtotalConfig)   : null,
    dto.sectionCode ?? null, dto.subsectionCode ?? null
  );
}

export async function deleteRow(rowId: number): Promise<void> {
  await dbRun('DELETE FROM cfg_ReportRow WHERE RowId=?', rowId);
}

export async function getRowById(rowId: number): Promise<ReportRowDef | null> {
  const rows = await dbAll<{
    RowId: number; ReportId: number; RowCode: string; Label: string;
    UnitOfMeasure: string | null; RowType: string; ParentRowCode: string | null;
    IndentLevel: number; IsEditable: number; IsVisible: number; SortOrder: number;
    MeasureField: string | null; DimensionMembers: string | null;
    SubtotalConfig: string | null; SectionCode: string | null; SubsectionCode: string | null;
  }>(
    'SELECT RowId, ReportId, RowCode, Label, UnitOfMeasure, RowType, ParentRowCode, IndentLevel, IsEditable, IsVisible, SortOrder, MeasureField, DimensionMembers, SubtotalConfig, SectionCode, SubsectionCode FROM cfg_ReportRow WHERE RowId=?', rowId
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    rowId: r.RowId, reportId: r.ReportId, rowCode: r.RowCode, label: r.Label,
    unitOfMeasure: r.UnitOfMeasure, rowType: r.RowType as RowType, parentRowCode: r.ParentRowCode,
    indentLevel: r.IndentLevel, isEditable: Boolean(r.IsEditable), isVisible: Boolean(r.IsVisible),
    sortOrder: r.SortOrder, measureField: r.MeasureField,
    dimensionMembers: r.DimensionMembers ? JSON.parse(r.DimensionMembers) : null,
    subtotalConfig: r.SubtotalConfig ? JSON.parse(r.SubtotalConfig) : null,
    sectionCode: r.SectionCode, subsectionCode: r.SubsectionCode,
  };
}

// ── Columns ───────────────────────────────────────────────────────────────────

export async function getColumns(reportId: number): Promise<ReportColumnDef[]> {
  const rows = await dbAll<{
    ColumnId: number; ReportId: number; ColumnCode: string; Label: string;
    DimensionName: string | null; MemberKey: string | null;
    IsSystem: number; DefaultWidth: number; IsVisible: number;
    SortOrder: number; HeaderFormat: string;
  }>(
    `SELECT ColumnId, ReportId, ColumnCode, Label, DimensionName, MemberKey,
            IsSystem, DefaultWidth, IsVisible, SortOrder, HeaderFormat
     FROM cfg_ReportColumn WHERE ReportId=? ORDER BY SortOrder`,
    reportId
  );
  return rows.map((r) => ({
    columnId:      r.ColumnId,
    reportId:      r.ReportId,
    columnCode:    r.ColumnCode,
    label:         r.Label,
    dimensionName: r.DimensionName,
    memberKey:     r.MemberKey,
    isSystem:      Boolean(r.IsSystem),
    defaultWidth:  r.DefaultWidth,
    isVisible:     Boolean(r.IsVisible),
    sortOrder:     r.SortOrder,
    headerFormat:  r.HeaderFormat,
  }));
}

export async function upsertColumn(reportId: number, dto: UpsertColumnDto): Promise<number> {
  const existing = await dbGet<{ ColumnId: number }>(
    'SELECT TOP 1 ColumnId FROM cfg_ReportColumn WHERE ReportId=? AND ColumnCode=?',
    reportId, dto.columnCode
  );

  if (existing) {
    await dbRun(
      `UPDATE cfg_ReportColumn SET Label=?, DimensionName=?, MemberKey=?,
       IsSystem=?, DefaultWidth=?, IsVisible=?, SortOrder=?, HeaderFormat=?
       WHERE ColumnId=?`,
      dto.label, dto.dimensionName ?? null, dto.memberKey ?? null,
      dto.isSystem ? 1 : 0, dto.defaultWidth ?? 120,
      dto.isVisible !== false ? 1 : 0, dto.sortOrder ?? 0,
      dto.headerFormat ?? 'Label', existing.ColumnId
    );
    return existing.ColumnId;
  }

  return dbInsertGetId(
    `INSERT INTO cfg_ReportColumn
       (ReportId, ColumnCode, Label, DimensionName, MemberKey, IsSystem, DefaultWidth, IsVisible, SortOrder, HeaderFormat)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    reportId, dto.columnCode, dto.label, dto.dimensionName ?? null,
    dto.memberKey ?? null, dto.isSystem ? 1 : 0, dto.defaultWidth ?? 120,
    dto.isVisible !== false ? 1 : 0, dto.sortOrder ?? 0, dto.headerFormat ?? 'Label'
  );
}

export async function deleteColumn(columnId: number): Promise<void> {
  await dbRun('DELETE FROM cfg_ReportColumn WHERE ColumnId=?', columnId);
}

export async function getColumnById(columnId: number): Promise<ReportColumnDef | null> {
  const rows = await dbAll<{
    ColumnId: number; ReportId: number; ColumnCode: string; Label: string;
    DimensionName: string | null; MemberKey: string | null;
    IsSystem: number; DefaultWidth: number; IsVisible: number;
    SortOrder: number; HeaderFormat: string;
  }>(
    'SELECT ColumnId, ReportId, ColumnCode, Label, DimensionName, MemberKey, IsSystem, DefaultWidth, IsVisible, SortOrder, HeaderFormat FROM cfg_ReportColumn WHERE ColumnId=?', columnId
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    columnId: r.ColumnId, reportId: r.ReportId, columnCode: r.ColumnCode, label: r.Label,
    dimensionName: r.DimensionName, memberKey: r.MemberKey,
    isSystem: Boolean(r.IsSystem), defaultWidth: r.DefaultWidth,
    isVisible: Boolean(r.IsVisible), sortOrder: r.SortOrder, headerFormat: r.HeaderFormat,
  };
}

// ── Filters ───────────────────────────────────────────────────────────────────

export async function getFilters(reportId: number): Promise<ReportFilterDef[]> {
  const rows = await dbAll<{
    FilterId: number; ReportId: number; FilterCode: string; Label: string;
    DimensionName: string; IsVisible: number; IsMultiSelect: number; IsMandatory: number;
    DefaultValue: string | null; DependsOn: string | null; SortOrder: number;
  }>(
    `SELECT FilterId, ReportId, FilterCode, Label, DimensionName,
            IsVisible, IsMultiSelect, IsMandatory, DefaultValue, DependsOn, SortOrder
     FROM cfg_ReportFilter WHERE ReportId=? ORDER BY SortOrder`,
    reportId
  );
  return rows.map((r) => ({
    filterId:      r.FilterId,
    reportId:      r.ReportId,
    filterCode:    r.FilterCode,
    label:         r.Label,
    dimensionName: r.DimensionName,
    isVisible:     Boolean(r.IsVisible),
    isMultiSelect: Boolean(r.IsMultiSelect),
    isMandatory:   Boolean(r.IsMandatory),
    defaultValue:  r.DefaultValue,
    dependsOn:     r.DependsOn,
    sortOrder:     r.SortOrder,
  }));
}

export async function upsertFilter(reportId: number, dto: UpsertFilterDto, _userId: string): Promise<number> {
  const existing = await dbGet<{ FilterId: number }>(
    'SELECT TOP 1 FilterId FROM cfg_ReportFilter WHERE ReportId=? AND FilterCode=?',
    reportId, dto.filterCode
  );

  if (existing) {
    await dbRun(
      `UPDATE cfg_ReportFilter SET Label=?, DimensionName=?, IsVisible=?, IsMultiSelect=?,
       IsMandatory=?, DefaultValue=?, DependsOn=?, SortOrder=?
       WHERE FilterId=?`,
      dto.label, dto.dimensionName, dto.isVisible !== false ? 1 : 0,
      dto.isMultiSelect ? 1 : 0, dto.isMandatory ? 1 : 0,
      dto.defaultValue ?? null, dto.dependsOn ?? null, dto.sortOrder ?? 0,
      existing.FilterId
    );
    return existing.FilterId;
  }

  return dbInsertGetId(
    `INSERT INTO cfg_ReportFilter
       (ReportId, FilterCode, Label, DimensionName, IsVisible, IsMultiSelect, IsMandatory, DefaultValue, DependsOn, SortOrder)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    reportId, dto.filterCode, dto.label, dto.dimensionName,
    dto.isVisible !== false ? 1 : 0, dto.isMultiSelect ? 1 : 0, dto.isMandatory ? 1 : 0,
    dto.defaultValue ?? null, dto.dependsOn ?? null, dto.sortOrder ?? 0
  );
}

export async function deleteFilter(filterId: number): Promise<void> {
  await dbRun('DELETE FROM cfg_ReportFilter WHERE FilterId=?', filterId);
}

export async function getFilterById(filterId: number): Promise<ReportFilterDef | null> {
  const rows = await dbAll<{
    FilterId: number; ReportId: number; FilterCode: string; Label: string;
    DimensionName: string; IsVisible: number; IsMultiSelect: number; IsMandatory: number;
    DefaultValue: string | null; DependsOn: string | null; SortOrder: number;
  }>(
    'SELECT FilterId, ReportId, FilterCode, Label, DimensionName, IsVisible, IsMultiSelect, IsMandatory, DefaultValue, DependsOn, SortOrder FROM cfg_ReportFilter WHERE FilterId=?', filterId
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    filterId: r.FilterId, reportId: r.ReportId, filterCode: r.FilterCode, label: r.Label,
    dimensionName: r.DimensionName, isVisible: Boolean(r.IsVisible),
    isMultiSelect: Boolean(r.IsMultiSelect), isMandatory: Boolean(r.IsMandatory),
    defaultValue: r.DefaultValue, dependsOn: r.DependsOn, sortOrder: r.SortOrder,
  };
}

// ── Sections ──────────────────────────────────────────────────────────────────

export async function getSections(reportId: number): Promise<ReportSectionDef[]> {
  const rows = await dbAll<{
    SectionId: number; ReportId: number; SectionCode: string; Label: string;
    Description: string | null; ParentSectionCode: string | null; SectionType: string;
    LayoutStyle: string; IsCollapsible: number; IsExpandedByDefault: number;
    Icon: string | null; SortOrder: number; IsVisible: number;
  }>(
    `SELECT SectionId, ReportId, SectionCode, Label, Description, ParentSectionCode,
            SectionType, LayoutStyle, IsCollapsible, IsExpandedByDefault, Icon, SortOrder, IsVisible
     FROM cfg_ReportSection WHERE ReportId=? ORDER BY SortOrder`,
    reportId
  );
  return rows.map((r) => ({
    sectionId:           r.SectionId,
    reportId:            r.ReportId,
    sectionCode:         r.SectionCode,
    label:               r.Label,
    description:         r.Description,
    parentSectionCode:   r.ParentSectionCode,
    sectionType:         r.SectionType as SectionType,
    layoutStyle:         r.LayoutStyle as LayoutStyle,
    isCollapsible:       Boolean(r.IsCollapsible),
    isExpandedByDefault: Boolean(r.IsExpandedByDefault),
    icon:                r.Icon,
    sortOrder:           r.SortOrder,
    isVisible:           Boolean(r.IsVisible),
  }));
}

export async function upsertSection(reportId: number, dto: UpsertSectionDto, _userId: string): Promise<number> {
  const existing = await dbGet<{ SectionId: number }>(
    'SELECT TOP 1 SectionId FROM cfg_ReportSection WHERE ReportId=? AND SectionCode=?',
    reportId, dto.sectionCode
  );

  if (existing) {
    await dbRun(
      `UPDATE cfg_ReportSection SET Label=?, Description=?, ParentSectionCode=?,
       SectionType=?, LayoutStyle=?, IsCollapsible=?, IsExpandedByDefault=?,
       Icon=?, SortOrder=?, IsVisible=? WHERE SectionId=?`,
      dto.label, dto.description ?? null, dto.parentSectionCode ?? null,
      dto.sectionType ?? 'Section', dto.layoutStyle ?? 'flat',
      dto.isCollapsible ? 1 : 0, dto.isExpandedByDefault !== false ? 1 : 0,
      dto.icon ?? null, dto.sortOrder ?? 0, dto.isVisible !== false ? 1 : 0,
      existing.SectionId
    );
    return existing.SectionId;
  }

  return dbInsertGetId(
    `INSERT INTO cfg_ReportSection
       (ReportId, SectionCode, Label, Description, ParentSectionCode,
        SectionType, LayoutStyle, IsCollapsible, IsExpandedByDefault, Icon, SortOrder, IsVisible)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    reportId, dto.sectionCode, dto.label, dto.description ?? null, dto.parentSectionCode ?? null,
    dto.sectionType ?? 'Section', dto.layoutStyle ?? 'flat',
    dto.isCollapsible ? 1 : 0, dto.isExpandedByDefault !== false ? 1 : 0,
    dto.icon ?? null, dto.sortOrder ?? 0, dto.isVisible !== false ? 1 : 0
  );
}

export async function deleteSection(sectionId: number): Promise<void> {
  await dbRun('DELETE FROM cfg_ReportSection WHERE SectionId=?', sectionId);
}

export async function getSectionById(sectionId: number): Promise<ReportSectionDef | null> {
  const rows = await dbAll<{
    SectionId: number; ReportId: number; SectionCode: string; Label: string;
    Description: string | null; ParentSectionCode: string | null; SectionType: string;
    LayoutStyle: string; IsCollapsible: number; IsExpandedByDefault: number;
    Icon: string | null; SortOrder: number; IsVisible: number;
  }>(
    'SELECT SectionId, ReportId, SectionCode, Label, Description, ParentSectionCode, SectionType, LayoutStyle, IsCollapsible, IsExpandedByDefault, Icon, SortOrder, IsVisible FROM cfg_ReportSection WHERE SectionId=?', sectionId
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    sectionId: r.SectionId, reportId: r.ReportId, sectionCode: r.SectionCode, label: r.Label,
    description: r.Description, parentSectionCode: r.ParentSectionCode,
    sectionType: r.SectionType as SectionType, layoutStyle: r.LayoutStyle as LayoutStyle,
    isCollapsible: Boolean(r.IsCollapsible), isExpandedByDefault: Boolean(r.IsExpandedByDefault),
    icon: r.Icon, sortOrder: r.SortOrder, isVisible: Boolean(r.IsVisible),
  };
}

// ── Layout ────────────────────────────────────────────────────────────────────

export async function getLayout(reportId: number): Promise<ReportLayout | null> {
  const row = await dbGet<{
    LayoutId: number; ReportId: number; Density: string; FrozenColumnCount: number;
    KpiColumnWidth: number | null; UmColumnWidth: number | null;
    MetadataColumnVisible: number; DefaultColumnWidth: number | null;
    StickyHeader: number; HoverHighlight: number; SubtotalHighlight: number;
    ShowIndentation: number; EmptyValueStyle: string | null;
    AutosaveEnabled: number; AutosaveDebounceMs: number | null;
    SaveOnBlur: number; AllowPivot: number; PivotConfig: string | null;
  }>(
    `SELECT TOP 1 LayoutId, ReportId, Density, FrozenColumnCount, KpiColumnWidth,
            UmColumnWidth, MetadataColumnVisible, DefaultColumnWidth, StickyHeader,
            HoverHighlight, SubtotalHighlight, ShowIndentation, EmptyValueStyle,
            AutosaveEnabled, AutosaveDebounceMs, SaveOnBlur, AllowPivot, PivotConfig
     FROM cfg_ReportLayout WHERE ReportId=?`,
    reportId
  );
  if (!row) return null;
  return {
    layoutId:              row.LayoutId,
    reportId:              row.ReportId,
    density:               (row.Density as 'compact' | 'standard') ?? 'standard',
    frozenColumnCount:     row.FrozenColumnCount,
    kpiColumnWidth:        row.KpiColumnWidth ?? 120,
    umColumnWidth:         row.UmColumnWidth ?? 80,
    metadataColumnVisible: Boolean(row.MetadataColumnVisible),
    defaultColumnWidth:    row.DefaultColumnWidth ?? 100,
    stickyHeader:          Boolean(row.StickyHeader),
    hoverHighlight:        Boolean(row.HoverHighlight),
    subtotalHighlight:     Boolean(row.SubtotalHighlight),
    showIndentation:       Boolean(row.ShowIndentation),
    emptyValueStyle:       row.EmptyValueStyle ?? '',
    autosaveEnabled:       Boolean(row.AutosaveEnabled),
    autosaveDebounceMs:    row.AutosaveDebounceMs ?? 1000,
    saveOnBlur:            Boolean(row.SaveOnBlur),
    allowPivot:            Boolean(row.AllowPivot),
    pivotConfig:           row.PivotConfig ? JSON.parse(row.PivotConfig) : null,
  };
}

export async function upsertLayout(reportId: number, dto: UpsertLayoutDto, _userId: string): Promise<void> {
  const existing = await dbGet<{ LayoutId: number }>(
    'SELECT TOP 1 LayoutId FROM cfg_ReportLayout WHERE ReportId=?',
    reportId
  );

  const fields: Record<string, unknown> = {};
  if (dto.density               !== undefined) fields['Density']               = dto.density;
  if (dto.frozenColumnCount     !== undefined) fields['FrozenColumnCount']     = dto.frozenColumnCount;
  if (dto.kpiColumnWidth        !== undefined) fields['KpiColumnWidth']        = dto.kpiColumnWidth;
  if (dto.umColumnWidth         !== undefined) fields['UmColumnWidth']         = dto.umColumnWidth;
  if (dto.metadataColumnVisible !== undefined) fields['MetadataColumnVisible'] = dto.metadataColumnVisible ? 1 : 0;
  if (dto.defaultColumnWidth    !== undefined) fields['DefaultColumnWidth']    = dto.defaultColumnWidth;
  if (dto.stickyHeader          !== undefined) fields['StickyHeader']          = dto.stickyHeader ? 1 : 0;
  if (dto.hoverHighlight        !== undefined) fields['HoverHighlight']        = dto.hoverHighlight ? 1 : 0;
  if (dto.subtotalHighlight     !== undefined) fields['SubtotalHighlight']     = dto.subtotalHighlight ? 1 : 0;
  if (dto.showIndentation       !== undefined) fields['ShowIndentation']       = dto.showIndentation ? 1 : 0;
  if (dto.emptyValueStyle       !== undefined) fields['EmptyValueStyle']       = dto.emptyValueStyle;
  if (dto.autosaveEnabled       !== undefined) fields['AutosaveEnabled']       = dto.autosaveEnabled ? 1 : 0;
  if (dto.autosaveDebounceMs    !== undefined) fields['AutosaveDebounceMs']    = dto.autosaveDebounceMs;
  if (dto.saveOnBlur            !== undefined) fields['SaveOnBlur']            = dto.saveOnBlur ? 1 : 0;
  if (dto.allowPivot            !== undefined) fields['AllowPivot']            = dto.allowPivot ? 1 : 0;
  if (dto.pivotConfig           !== undefined) fields['PivotConfig']           = JSON.stringify(dto.pivotConfig);

  if (Object.keys(fields).length === 0) return;

  if (existing) {
    const setClauses = Object.keys(fields).map((k) => `${k}=?`).join(', ');
    await dbRun(
      `UPDATE cfg_ReportLayout SET ${setClauses} WHERE ReportId=?`,
      ...Object.values(fields), reportId
    );
  } else {
    const cols = Object.keys(fields).join(', ');
    const ph   = Object.keys(fields).map(() => '?').join(', ');
    await dbRun(
      `INSERT INTO cfg_ReportLayout (ReportId, ${cols}) VALUES (?, ${ph})`,
      reportId, ...Object.values(fields)
    );
  }

  await logConfigEvent('LayoutChanged', 'Layout', String(reportId), reportId, null, dto, _userId);
}

// ── Report Definition (rendering diretta) ─────────────────────────────────────

/**
 * Carica la definizione completa di un report — usata da GET /api/report/definition/:reportId.
 * I filtri predefiniti (cfg_ReportFilter.DefaultValue) vengono parsati e mappati
 * ai campi di FilterState (entityIds, scopeId, currencyId, loadIds).
 */
export async function getReportDefinitionFull(reportId: number): Promise<ReportDefinitionFull | null> {
  const row = await dbGet<{ ReportId: number; ReportCode: string; ReportLabel: string; WritebackMode: string }>(
    `SELECT TOP 1 ReportId, ReportCode, ReportLabel, WritebackMode
     FROM cfg_Report WHERE ReportId = ? AND IsActive = 1`,
    reportId
  );
  if (!row) return null;

  // Recupera layout per AllowPivot e PivotConfig (contiene columnDimension)
  const layout = await dbGet<{ AllowPivot: number; PivotConfig: string | null }>(
    `SELECT TOP 1 AllowPivot, PivotConfig FROM cfg_ReportLayout WHERE ReportId = ?`,
    reportId
  );

  // Recupera TUTTI i filtri configurati (visibili e non), ordinati
  const filterRows = await dbAll<{
    DimensionName: string;
    DefaultValue:  string | null;
    IsMultiSelect: number;
    IsVisible:     number;
    IsMandatory:   number;
  }>(
    `SELECT DimensionName, DefaultValue, IsMultiSelect, IsVisible, IsMandatory
     FROM cfg_ReportFilter
     WHERE ReportId = ?
     ORDER BY SortOrder`,
    reportId
  );

  // Helper per normalizzare il nome della dimensione → chiave filterConfig
  const dimToConfigKey = (dim: string): keyof ReportFilterConfig | null => {
    const k = dim.toLowerCase().replace(/[^a-z]/g, '');
    if (k === 'entity'   || k === 'entityid')                        return 'entity';
    if (k === 'scope'    || k === 'scopeid')                         return 'scope';
    if (k === 'currency' || k === 'currencyid')                      return 'currency';
    if (k === 'process'  || k === 'loadid' || k === 'load')          return 'process';
    if (k === 'adjlevel' || k === 'adjlevelid')                      return 'adjLevel';
    if (k === 'costcenter')                                           return 'costCenter';
    if (k === 'co'       || k === 'dimacc02')                        return 'co';
    if (k === 'counterpart')                                          return 'counterpart';
    if (k === 'includemanualwriteback')                               return 'includeManualWriteback';
    return null;
  };

  // Mappa dimensionName → FilterState fields (case-insensitive)
  const preset: ReportPresetFilters = {};
  // Costruisce filterConfig solo se ci sono righe configurate
  let filterConfig: ReportFilterConfig | null = filterRows.length > 0 ? {} : null;

  const toIntArray = (v: unknown): number[] =>
    (Array.isArray(v) ? v : [v]).map(Number).filter((n) => !isNaN(n) && n > 0);
  const toInt = (v: unknown): number | undefined => {
    const n = Number(Array.isArray(v) ? v[0] : v);
    return !isNaN(n) && n > 0 ? n : undefined;
  };

  for (const f of filterRows) {
    // Build filterConfig entry (visibilità + mandatory)
    const cfgKey = dimToConfigKey(f.DimensionName);
    if (cfgKey && filterConfig) {
      (filterConfig as Record<string, FilterFieldConfig>)[cfgKey] = {
        visible:   Boolean(f.IsVisible),
        mandatory: Boolean(f.IsMandatory),
      };
    }

    // Build preset only from visible rows with a default value
    if (!f.DefaultValue || !f.IsVisible) continue;

    let parsed: unknown;
    try   { parsed = JSON.parse(f.DefaultValue); }
    catch { parsed = f.DefaultValue; }

    const key = f.DimensionName.toLowerCase().replace(/[^a-z]/g, '');
    if      (key === 'entity'   || key === 'entityid')               { preset.entityIds  = toIntArray(parsed); }
    else if (key === 'scope'    || key === 'scopeid')                 { preset.scopeId    = toInt(parsed); }
    else if (key === 'currency' || key === 'currencyid')              { preset.currencyId = toInt(parsed); }
    else if (key === 'process'  || key === 'loadid' || key === 'load') { preset.loadIds  = toIntArray(parsed); }
  }

  const pivotCfg   = layout?.PivotConfig ? JSON.parse(layout.PivotConfig as string) : {};
  const colDim     = (['Process', 'Entity', 'AdjLevel'].includes(pivotCfg?.columnDimension))
    ? pivotCfg.columnDimension as 'Process' | 'Entity' | 'AdjLevel'
    : 'Process';

  return {
    reportId:        row.ReportId,
    reportCode:      row.ReportCode,
    reportLabel:     row.ReportLabel,
    writebackMode:   (row.WritebackMode as 'Delta' | 'Overwrite') ?? 'Overwrite',
    allowPivot:      Boolean(layout?.AllowPivot),
    presetFilters:   preset,
    filterConfig,
    columnDimension: colDim,
  };
}

// ── Task Launch Data ──────────────────────────────────────────────────────────────

/** Helper riutilizzabile per parsare contextFilters / defaultValue → ReportPresetFilters */
function parseFilterValue(
  key: string,
  val: unknown,
  preset: ReportPresetFilters,
): void {
  const toIntArray = (v: unknown): number[] =>
    (Array.isArray(v) ? v : [v]).map(Number).filter((n) => !isNaN(n) && n > 0);
  const toInt = (v: unknown): number | undefined => {
    const n = Number(Array.isArray(v) ? v[0] : v);
    return !isNaN(n) && n > 0 ? n : undefined;
  };
  const k = key.toLowerCase().replace(/[^a-z]/g, '');
  if      (k.startsWith('entity'))                              { preset.entityIds  = toIntArray(val); }
  else if (k.startsWith('scope'))                               { preset.scopeId    = toInt(val); }
  else if (k.startsWith('currency'))                            { preset.currencyId = toInt(val); }
  else if (k.startsWith('load') || k.startsWith('process'))    { preset.loadIds    = toIntArray(val); }
}

export interface TaskLaunchData {
  taskId:          number;
  taskCode:        string;
  label:           string;
  reportId:        number;
  writebackMode:   'Delta' | 'Overwrite';
  allowPivot:      boolean;
  presetFilters:   ReportPresetFilters;
  filterConfig:    ReportFilterConfig | null;
  columnDimension: 'Process' | 'Entity' | 'AdjLevel';
}

export async function getTaskLaunchData(taskId: number): Promise<TaskLaunchData | null> {
  const taskRow = await dbGet<{
    TaskId: number; TaskCode: string; Label: string;
    ReportId: number; WritebackMode: string | null; ContextFilters: string | null;
  }>(
    `SELECT TOP 1 TaskId, TaskCode, Label, ReportId, WritebackMode, ContextFilters
     FROM cfg_Task WHERE TaskId = ? AND IsActive = 1`,
    taskId
  );
  if (!taskRow) return null;

  const reportDef = await getReportDefinitionFull(taskRow.ReportId);
  if (!reportDef) return null;

  // Parte dal preset del report e sovrascrive con i contextFilters del task
  const preset: ReportPresetFilters = { ...reportDef.presetFilters };

  if (taskRow.ContextFilters) {
    let ctx: Record<string, unknown> = {};
    try { ctx = JSON.parse(taskRow.ContextFilters); } catch { /* ignora JSON malformato */ }
    for (const [key, val] of Object.entries(ctx)) {
      parseFilterValue(key, val, preset);
    }
  }

  return {
    taskId:          taskRow.TaskId,
    taskCode:        taskRow.TaskCode,
    label:           taskRow.Label,
    reportId:        taskRow.ReportId,
    writebackMode:   (taskRow.WritebackMode as 'Delta' | 'Overwrite') ?? reportDef.writebackMode,
    allowPivot:      reportDef.allowPivot,
    presetFilters:   preset,
    filterConfig:    reportDef.filterConfig,
    columnDimension: reportDef.columnDimension,
  };
}

// ── DB Explorer (step 1 wizard) ────────────────────────────────────────────────

export async function listDbTables(): Promise<DbTableInfo[]> {
  const rows = await dbAll<{ TABLE_SCHEMA: string; TABLE_NAME: string; TABLE_TYPE: string }>(
    `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
     ORDER BY TABLE_SCHEMA, TABLE_NAME`
  );
  return rows.map((r) => ({
    tableName:  r.TABLE_NAME,
    schemaName: r.TABLE_SCHEMA,
    rowCount:   null,
    tableType:  r.TABLE_TYPE === 'VIEW' ? 'VIEW' : 'TABLE',
  }));
}

export async function getTableColumns(schemaName: string, tableName: string): Promise<DbColumnInfo[]> {
  const rows = await dbAll<{
    COLUMN_NAME: string; DATA_TYPE: string; CHARACTER_MAXIMUM_LENGTH: number | null;
    IS_NULLABLE: string; isPK: number;
  }>(
    `SELECT
       c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.IS_NULLABLE,
       CASE WHEN kcu.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPK
     FROM INFORMATION_SCHEMA.COLUMNS c
     LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
       ON tc.TABLE_SCHEMA = c.TABLE_SCHEMA AND tc.TABLE_NAME = c.TABLE_NAME
       AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
     LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND kcu.COLUMN_NAME = c.COLUMN_NAME
     WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
     ORDER BY c.ORDINAL_POSITION`,
    schemaName, tableName
  );
  return rows.map((r) => ({
    columnName:   r.COLUMN_NAME,
    dataType:     r.DATA_TYPE,
    maxLength:    r.CHARACTER_MAXIMUM_LENGTH,
    isNullable:   r.IS_NULLABLE === 'YES',
    isPrimaryKey: r.isPK === 1,
  }));
}
