/**
 * dataEntryHierarchyBuilderService — builds DataEntryRigaOption hierarchies
 * from PARAM tables and dimension tables (dim-table and parent-child modes).
 *
 * [V3] All identifiers validated with assertValidIdentifier before interpolation.
 * [V5] <400 lines.
 * [V6] Pure data-loading logic; no HTTP concerns.
 */

import { dbAll, dbGet } from '../config/dbHelpers';
import { assertValidIdentifier } from './paramTableService';
import { DataEntryRigaOption } from '../models/dataEntry.models';
import { memPathKey } from './dataEntryHelpers';

// ── Internal types ────────────────────────────────────────────────────────────

type ParamRowShape = DataEntryRigaOption['paramRow'];

export interface LoadedParamRow {
  paramId:           number;
  sourceValue:       string;
  label:             string;
  rowKind:           'Aggregato' | 'Indicatore';
  indentLevel:       number;
  parentParamId:     number | null;
  raggruppamento:    string | null;
  formula:           string | null;
  guidaCompilazione: string | null;
  isEditable:        boolean;
  isFormula:         boolean;
  sortOrder:         number;
}

// ── loadParamMap ──────────────────────────────────────────────────────────────

/** Loads a PARAM table's rows as { label, paramRow } keyed by SourceValue. */
export async function loadParamMap(
  paramTableId: number,
): Promise<Map<string, { label: string; paramRow: NonNullable<ParamRowShape> }>> {
  const map = new Map<string, { label: string; paramRow: NonNullable<ParamRowShape> }>();
  const reg = await dbGet<{ SchemaName: string; ParamTableName: string }>(
    'SELECT SchemaName, ParamTableName FROM dbo.cfg_ParamTable WHERE ParamTableId = ?',
    paramTableId,
  );
  if (!reg) return map;
  assertValidIdentifier(reg.SchemaName, 'paramSchema');
  assertValidIdentifier(reg.ParamTableName, 'paramTableName');
  const rows = await dbAll<{
    SourceValue: string; Label: string; RowKind: string; IndentLevel: number;
    Raggruppamento: string | null; Formula: string | null;
    GuidaCompilazione: string | null; IsEditable: boolean; IsFormula: boolean;
  }>(
    `SELECT SourceValue, Label, RowKind, IndentLevel, Raggruppamento, Formula,
            GuidaCompilazione, IsEditable, IsFormula
       FROM [${reg.SchemaName}].[${reg.ParamTableName}]
      WHERE IsVisible = 1
      ORDER BY SortOrder, ParamId`,
  );
  rows.forEach((r) => {
    map.set(r.SourceValue, {
      label: r.Label || r.SourceValue,
      paramRow: {
        rowKind:           (r.RowKind ?? 'Indicatore') as 'Aggregato' | 'Indicatore',
        indentLevel:       r.IndentLevel ?? 1,
        raggruppamento:    r.Raggruppamento ?? null,
        formula:           r.Formula ?? null,
        guidaCompilazione: r.GuidaCompilazione ?? null,
        isEditable:        !!r.IsEditable,
        isFormula:         !!r.IsFormula,
      },
    });
  });
  return map;
}

// ── loadParamRowsForField ─────────────────────────────────────────────────────

/**
 * Loads all rows from the PARAM table for `fieldName` in `reportId`.
 * Returns empty array if no PARAM table exists.
 */
export async function loadParamRowsForField(
  reportId: number,
  fieldName: string,
): Promise<LoadedParamRow[]> {
  const pt = await dbGet<{ ParamTableId: number; SchemaName: string; ParamTableName: string }>(
    `SELECT ParamTableId, SchemaName, ParamTableName
       FROM dbo.cfg_ParamTable
      WHERE ReportId = ? AND ColumnName = ?`,
    reportId, fieldName,
  );
  if (!pt) return [];

  assertValidIdentifier(pt.SchemaName, 'paramSchema');
  assertValidIdentifier(pt.ParamTableName, 'paramTableName');

  const rows = await dbAll<Record<string, unknown>>(
    `SELECT ParamId, SourceValue, Label, RowKind, IndentLevel, ParentParamId,
            Raggruppamento, Formula, GuidaCompilazione, IsEditable, IsFormula, SortOrder
       FROM [${pt.SchemaName}].[${pt.ParamTableName}]
      ORDER BY SortOrder`,
  );

  return rows.map((r) => ({
    paramId:           r['ParamId']           as number,
    sourceValue:       String(r['SourceValue'] ?? ''),
    label:             String(r['Label']        ?? ''),
    rowKind:           (r['RowKind']            as 'Aggregato' | 'Indicatore') ?? 'Indicatore',
    indentLevel:       (r['IndentLevel']        as number) ?? 1,
    parentParamId:     (r['ParentParamId']      as number | null) ?? null,
    raggruppamento:    r['Raggruppamento']       as string | null ?? null,
    formula:           r['Formula']             as string | null ?? null,
    guidaCompilazione: r['GuidaCompilazione']   as string | null ?? null,
    isEditable:        (r['IsEditable']         as number) === 1,
    isFormula:         (r['IsFormula']          as number) === 1,
    sortOrder:         (r['SortOrder']          as number) ?? 0,
  }));
}

// ── buildDimTableHierarchy ────────────────────────────────────────────────────

/**
 * Builds hierarchy righe options directly from a dimension table
 * using level fields (e.g. L_h01..L_h05).
 *
 * Security: all table/column names validated with assertValidIdentifier.
 */
export async function buildDimTableHierarchy(
  dimSchema: string,
  dimTable: string,
  levelFields: string[],
  hasInLevelOrder: boolean,
): Promise<DataEntryRigaOption[]> {
  assertValidIdentifier(dimSchema, 'dimSchema');
  assertValidIdentifier(dimTable, 'dimTable');
  levelFields.forEach((f) => assertValidIdentifier(f, `level field "${f}"`));

  const selectCols = levelFields.map((f) => `[${f}]`).join(', ');
  const orderPart = hasInLevelOrder
    ? `MIN([InLevelOrder]), ${levelFields.map((f) => `[${f}]`).join(', ')}`
    : levelFields.map((f) => `[${f}]`).join(', ');

  const rows = await dbAll<Record<string, string | null>>(
    `SELECT TOP(10000) ${selectCols}
       FROM [${dimSchema}].[${dimTable}]
      GROUP BY ${selectCols}
      ORDER BY ${orderPart}`,
  );

  const result: DataEntryRigaOption[] = [];
  const seenPathKeys = new Set<string>();

  for (const row of rows) {
    let effectiveDepth = -1;
    for (let i = 0; i < levelFields.length; i++) {
      const v = row[levelFields[i]];
      if (v != null && String(v).trim() !== '') effectiveDepth = i;
    }
    if (effectiveDepth < 0) continue;

    for (let depth = 0; depth <= effectiveDepth; depth++) {
      const pathValues: Record<string, string> = {};
      for (let d = 0; d <= depth; d++) {
        pathValues[levelFields[d]] = String(row[levelFields[d]] ?? '');
      }
      const pk = memPathKey(pathValues);
      if (seenPathKeys.has(pk)) continue;
      seenPathKeys.add(pk);

      const fn    = levelFields[depth];
      const value = String(row[fn] ?? '');
      const isLeaf = depth === effectiveDepth;
      result.push({
        depth, fieldName: fn, value,
        label: value,
        isLeaf,
        pathValues,
        paramRow: null,
      });
    }
  }

  return result;
}

// ── buildParentChildHierarchy ─────────────────────────────────────────────────

/**
 * Builds parent-child hierarchy from a dimension table/view.
 * DFS-ordered flat list; overlays PARAM row metadata when available.
 *
 * Security: all identifiers validated with assertValidIdentifier.
 */
export async function buildParentChildHierarchy(
  dimSchema: string,
  dimTable: string,
  factFieldName: string,
  childKeyCol: string,
  parentKeyCol: string,
  labelCol: string,
  orderCol: string | null,
  reportId: number,
): Promise<DataEntryRigaOption[]> {
  [dimSchema, dimTable, childKeyCol, parentKeyCol, labelCol].forEach((id) =>
    assertValidIdentifier(id, id),
  );
  if (orderCol) assertValidIdentifier(orderCol, 'orderCol');

  const orderExpr = orderCol ? `[${orderCol}]` : `[${childKeyCol}]`;
  const rows = await dbAll<Record<string, string | null>>(
    `SELECT [${childKeyCol}], [${parentKeyCol}], [${labelCol}]
       FROM [${dimSchema}].[${dimTable}]
      ORDER BY ${orderExpr}`,
  );

  const childrenMap = new Map<string, string[]>();
  const labelMap    = new Map<string, string>();
  const roots: string[] = [];

  for (const r of rows) {
    const child  = String(r[childKeyCol]  ?? '');
    const parent = r[parentKeyCol] ? String(r[parentKeyCol]) : null;
    const label  = String(r[labelCol] ?? child);
    labelMap.set(child, label);
    if (!childrenMap.has(child)) childrenMap.set(child, []);
    if (parent) {
      if (!childrenMap.has(parent)) childrenMap.set(parent, []);
      childrenMap.get(parent)!.push(child);
    } else {
      roots.push(child);
    }
  }

  const result: DataEntryRigaOption[] = [];
  const seen = new Set<string>();

  function dfs(key: string, depth: number, ancestorKeys: string[]): void {
    if (seen.has(key)) return;
    seen.add(key);
    const children   = childrenMap.get(key) ?? [];
    const isLeaf     = children.length === 0;
    const pathValues = { [factFieldName]: key };
    const myPathKey  = memPathKey(pathValues);
    result.push({
      depth, fieldName: factFieldName, value: key,
      label: labelMap.get(key) ?? key,
      isLeaf, pathValues,
      ancestorKeys: [...ancestorKeys],
      paramRow: null,
    });
    for (const child of children) dfs(child, depth + 1, [...ancestorKeys, myPathKey]);
  }

  for (const root of roots) dfs(root, 0, []);

  // Overlay & inject PARAM rows.
  // Primary lookup: PARAM table associated with factFieldName (childKeyCol).
  // Fallback:       PARAM table associated with labelCol — created when the user
  //                 selects the hierarchy via the kpi-params label-column shortcut.
  //                 In that case SourceValues are human-readable labels (e.g. "Sales Managerial")
  //                 and we must match them against node.label rather than node.value.
  let paramRows = await loadParamRowsForField(reportId, factFieldName);
  let useLabelMatching = false;
  if (paramRows.length === 0) {
    const labelParamRows = await loadParamRowsForField(reportId, labelCol);
    if (labelParamRows.length > 0) {
      paramRows = labelParamRows;
      useLabelMatching = true;
    }
  }

  if (paramRows.length > 0) {
    const nodeByValue = new Map<string, DataEntryRigaOption>(result.map((n) => [n.value, n]));
    // When matching by label: build a secondary lookup keyed by node.label
    const nodeByLabel = useLabelMatching
      ? new Map<string, DataEntryRigaOption>(result.map((n) => [n.label, n]))
      : null;
    const paramById   = new Map<number, LoadedParamRow>(paramRows.map((p) => [p.paramId, p]));

    for (const pr of paramRows) {
      const node = nodeByValue.get(pr.sourceValue) ?? nodeByLabel?.get(pr.sourceValue);
      if (node) {
        node.label = pr.label || node.label;
        node.paramRow = {
          rowKind: pr.rowKind, indentLevel: pr.indentLevel,
          raggruppamento: pr.raggruppamento, formula: pr.formula,
          guidaCompilazione: pr.guidaCompilazione,
          isEditable: pr.isEditable, isFormula: pr.isFormula,
        };
      }
    }

    const virtualRows = paramRows.filter((pr) =>
      !nodeByValue.has(pr.sourceValue) && !(nodeByLabel?.has(pr.sourceValue)),
    );
    for (const vr of virtualRows) {
      let parentNode: DataEntryRigaOption | undefined;
      if (vr.parentParamId !== null) {
        const parentParam = paramById.get(vr.parentParamId);
        if (parentParam) {
          parentNode = nodeByValue.get(parentParam.sourceValue) ?? nodeByLabel?.get(parentParam.sourceValue);
        }
      }
      const parentDepth   = parentNode?.depth ?? -1;
      const parentPath    = parentNode?.pathValues ?? {};
      const parentAncKeys = parentNode?.ancestorKeys ?? [];
      const depth         = parentDepth + 1;
      const pathValues    = { ...parentPath, [factFieldName]: vr.sourceValue };

      const virtualNode: DataEntryRigaOption = {
        depth, fieldName: factFieldName, value: vr.sourceValue,
        label: vr.label, isLeaf: true, pathValues,
        ancestorKeys: parentNode ? [...parentAncKeys, memPathKey(parentNode.pathValues)] : [],
        paramRow: {
          rowKind: vr.rowKind, indentLevel: vr.indentLevel,
          raggruppamento: vr.raggruppamento, formula: vr.formula,
          guidaCompilazione: vr.guidaCompilazione,
          isEditable: vr.isEditable, isFormula: vr.isFormula,
        },
      };
      nodeByValue.set(vr.sourceValue, virtualNode);

      if (parentNode) {
        const parentIdx = result.indexOf(parentNode);
        let insertIdx = parentIdx + 1;
        while (
          insertIdx < result.length &&
          result[insertIdx].depth > parentDepth &&
          !result[insertIdx].paramRow?.isFormula
        ) {
          const candidate = result[insertIdx];
          const candidateParam = paramRows.find((p) => p.sourceValue === candidate.value);
          if (candidateParam && candidateParam.sortOrder > vr.sortOrder) break;
          insertIdx++;
        }
        result.splice(insertIdx, 0, virtualNode);
      } else {
        result.push(virtualNode);
      }
    }
  }

  return result;
}

// ── getDistinctParamGroupings ─────────────────────────────────────────────────

/**
 * Returns distinct non-empty Raggruppamento (Grouping) values from a PARAM table.
 */
export async function getDistinctParamGroupings(paramTableId: number): Promise<string[]> {
  const reg = await dbGet<{ SchemaName: string; ParamTableName: string }>(
    'SELECT SchemaName, ParamTableName FROM dbo.cfg_ParamTable WHERE ParamTableId = ?',
    paramTableId,
  );
  if (!reg) return [];
  assertValidIdentifier(reg.SchemaName, 'paramSchema');
  assertValidIdentifier(reg.ParamTableName, 'paramTableName');
  const rows = await dbAll<{ g: string }>(
    `SELECT DISTINCT Raggruppamento AS g
       FROM [${reg.SchemaName}].[${reg.ParamTableName}]
      WHERE Raggruppamento IS NOT NULL AND LTRIM(RTRIM(Raggruppamento)) <> ''`,
  );
  return rows.map((r) => String(r.g)).sort();
}

// ── buildGroupingParamHierarchy ───────────────────────────────────────────────

/**
 * Builds a 2-level DataEntryRigaOption hierarchy from a PARAM table:
 *   depth 0: distinct Raggruppamento values   (group headers, isLeaf=false)
 *   depth 1: PARAM source values within group (leaves, carries paramRow)
 *
 * Used when the rows axis starts with a <col>_Grouping virtual field.
 */
export async function buildGroupingParamHierarchy(
  paramTableId:      number,
  groupingFieldName: string,
  sourceFieldName:   string,
): Promise<DataEntryRigaOption[]> {
  const pMap       = await loadParamMap(paramTableId);
  const groupOrder = new Map<string, number>();
  const groupItems = new Map<string, Array<{ value: string; label: string; pr: NonNullable<ParamRowShape> }>>();

  for (const [sourceValue, info] of pMap) {
    const g = info.paramRow.raggruppamento ?? '';
    if (!g) continue;
    if (!groupItems.has(g)) { groupItems.set(g, []); groupOrder.set(g, groupOrder.size); }
    groupItems.get(g)!.push({ value: sourceValue, label: info.label, pr: info.paramRow });
  }

  const sortedGroups = [...groupItems.keys()].sort(
    (a, b) => (groupOrder.get(a) ?? 0) - (groupOrder.get(b) ?? 0),
  );
  const result: DataEntryRigaOption[] = [];
  for (const g of sortedGroups) {
    result.push({
      depth: 0, fieldName: groupingFieldName, value: g,
      label: g, isLeaf: false,
      pathValues: { [groupingFieldName]: g },
      paramRow: null,
    });
    for (const item of groupItems.get(g)!) {
      result.push({
        depth: 1, fieldName: sourceFieldName, value: item.value,
        label: item.label, isLeaf: true,
        pathValues: { [groupingFieldName]: g, [sourceFieldName]: item.value },
        paramRow: item.pr,
      });
    }
  }
  return result;
}
