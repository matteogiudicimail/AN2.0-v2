/**
 * Hierarchy Definition Service
 * CRUD for cfg_HierarchyDef_AN2 — parent-child hierarchy configurations.
 * One hierarchy def links a dim table to its child/parent/label/order columns.
 */
import { dbAll, dbGet, dbInsertGetId, dbRun } from '../config/dbHelpers';
import { HierarchyDef, UpsertHierarchyDefDto } from '../models/configurator.models';

/** True when the error is SQL Server 208 "Invalid object name" (table not yet created). */
function isTableMissing(err: any): boolean {
  return err?.number === 208 || String(err?.message).includes('cfg_HierarchyDef_AN2');
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listHierarchyDefs(reportId: number): Promise<HierarchyDef[]> {
  try {
    const rows = await dbAll<{
      HierarchyDefId: number; BindingId: number; DimTable: string;
      ChildKeyCol: string; ParentKeyCol: string; LabelCol: string;
      OrderCol: string | null; SmartName: string | null;
    }>(
      `SELECT h.HierarchyDefId, h.BindingId, h.DimTable,
              h.ChildKeyCol, h.ParentKeyCol, h.LabelCol, h.OrderCol, h.SmartName
       FROM cfg_HierarchyDef_AN2 h
       INNER JOIN cfg_DatasetBinding b ON b.BindingId = h.BindingId
       WHERE b.ReportId = ?
       ORDER BY h.HierarchyDefId`,
      reportId
    );
    return rows.map(mapRow);
  } catch (err: any) {
    if (isTableMissing(err)) return [];   // migration not yet run
    throw err;
  }
}

export async function getHierarchyDef(defId: number): Promise<HierarchyDef | null> {
  try {
    const row = await dbGet<{
      HierarchyDefId: number; BindingId: number; DimTable: string;
      ChildKeyCol: string; ParentKeyCol: string; LabelCol: string;
      OrderCol: string | null; SmartName: string | null;
    }>(
      `SELECT HierarchyDefId, BindingId, DimTable,
              ChildKeyCol, ParentKeyCol, LabelCol, OrderCol, SmartName
       FROM cfg_HierarchyDef_AN2 WHERE HierarchyDefId = ?`,
      defId
    );
    return row ? mapRow(row) : null;
  } catch (err: any) {
    if (isTableMissing(err)) return null;
    throw err;
  }
}

/** Returns the first hierarchy def for a given dim table in a report (used by data entry). */
export async function getHierarchyDefForDimTable(
  reportId: number, dimTable: string
): Promise<HierarchyDef | null> {
  try {
    const row = await dbGet<{
      HierarchyDefId: number; BindingId: number; DimTable: string;
      ChildKeyCol: string; ParentKeyCol: string; LabelCol: string;
      OrderCol: string | null; SmartName: string | null;
    }>(
      `SELECT TOP 1 h.HierarchyDefId, h.BindingId, h.DimTable,
              h.ChildKeyCol, h.ParentKeyCol, h.LabelCol, h.OrderCol, h.SmartName
       FROM cfg_HierarchyDef_AN2 h
       INNER JOIN cfg_DatasetBinding b ON b.BindingId = h.BindingId
       WHERE b.ReportId = ? AND h.DimTable = ?`,
      reportId, dimTable
    );
    return row ? mapRow(row) : null;
  } catch (err: any) {
    if (isTableMissing(err)) return null;
    throw err;
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function saveHierarchyDef(
  reportId: number, dto: UpsertHierarchyDefDto & { hierarchyDefId?: number }
): Promise<HierarchyDef> {
  // Get the bindingId for this report
  const binding = await dbGet<{ BindingId: number }>(
    `SELECT TOP 1 BindingId FROM cfg_DatasetBinding WHERE ReportId = ?`, reportId
  );
  if (!binding) throw new Error(`No binding found for reportId ${reportId}`);

  validateDto(dto);

  if (dto.hierarchyDefId) {
    await dbRun(
      `UPDATE cfg_HierarchyDef_AN2
       SET DimTable=?, ChildKeyCol=?, ParentKeyCol=?, LabelCol=?, OrderCol=?, SmartName=?
       WHERE HierarchyDefId=?`,
      dto.dimTable, dto.childKeyCol, dto.parentKeyCol, dto.labelCol,
      dto.orderCol ?? null, dto.smartName ?? null, dto.hierarchyDefId
    );
    return (await getHierarchyDef(dto.hierarchyDefId))!;
  }

  const id = await dbInsertGetId(
    `INSERT INTO cfg_HierarchyDef_AN2
       (BindingId, DimTable, ChildKeyCol, ParentKeyCol, LabelCol, OrderCol, SmartName, CreatedBy, CreatedAt)
     VALUES (?,?,?,?,?,?,?,SYSTEM_USER,SYSUTCDATETIME())`,
    binding.BindingId,
    dto.dimTable, dto.childKeyCol, dto.parentKeyCol, dto.labelCol,
    dto.orderCol ?? null, dto.smartName ?? null
  );
  return (await getHierarchyDef(id))!;
}

export async function deleteHierarchyDef(defId: number): Promise<void> {
  await dbRun(`DELETE FROM cfg_HierarchyDef_AN2 WHERE HierarchyDefId = ?`, defId);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function validateDto(dto: UpsertHierarchyDefDto): void {
  if (!dto.dimTable?.trim())     throw new Error('dimTable is required');
  if (!dto.childKeyCol?.trim())  throw new Error('childKeyCol is required');
  if (!dto.parentKeyCol?.trim()) throw new Error('parentKeyCol is required');
  if (!dto.labelCol?.trim())     throw new Error('labelCol is required');
}

function mapRow(r: {
  HierarchyDefId: number; BindingId: number; DimTable: string;
  ChildKeyCol: string; ParentKeyCol: string; LabelCol: string;
  OrderCol: string | null; SmartName: string | null;
}): HierarchyDef {
  return {
    hierarchyDefId: r.HierarchyDefId,
    bindingId:      r.BindingId,
    dimTable:       r.DimTable,
    childKeyCol:    r.ChildKeyCol,
    parentKeyCol:   r.ParentKeyCol,
    labelCol:       r.LabelCol,
    orderCol:       r.OrderCol,
    smartName:      r.SmartName,
  };
}
