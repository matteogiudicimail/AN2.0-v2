/**
 * dataEntryGridService — builds and returns the full data-entry pivot grid.
 *
 * [V3] All identifiers validated; parameterised SQL throughout.
 * [V5] <400 lines.
 * [V6] Business logic here; routes orchestrate.
 */

import { dbAll, dbGet } from '../config/dbHelpers';
import { assertValidIdentifier } from './paramTableService';
import { getHierarchyDefForDimTable } from './hierarchyDefService';
import { DataEntryGridResponse, DataEntryFiltriOption, DataEntryRigaOption, WriteRow } from '../models/dataEntry.models';
import {
  sortedJson, splitFact, getDistinctColValues, validateLayoutIdentifiers, columnExists,
} from './dataEntryHelpers';
import {
  loadParamMap, buildDimTableHierarchy, buildParentChildHierarchy,
  getDistinctParamGroupings, buildGroupingParamHierarchy,
} from './dataEntryHierarchyBuilderService';

/** True when an axis item is a virtual param-grouping field (<col>_Grouping). */
function isGroupingItem(item: { fieldName: string; paramTableId?: number | null }): boolean {
  return !!(item.paramTableId) && item.fieldName.endsWith('_Grouping');
}
import { getRowApprovalsArray } from './rowApprovalService';

// ── getMultiLevelRigheOptions ─────────────────────────────────────────────────

type ParamRowShape = DataEntryRigaOption['paramRow'];

/**
 * Builds a flat ordered list of DataEntryRigaOption nodes for all righe levels.
 * Supports:
 *  - Single-level (PARAM-ordered or DISTINCT)
 *  - Multi-level fact-based drill-down
 *  - Dim-table hierarchy (level fields or parent-child)
 */
export async function getMultiLevelRigheOptions(
  schema: string,
  factTable: string,
  righeLayout: Array<{ fieldName: string; label: string; paramTableId: number | null; dimTable?: string | null }>,
  reportId: number,
): Promise<DataEntryRigaOption[]> {
  if (righeLayout.length === 0) return [];

  // Virtual param-grouping fields: <col>_Grouping — resolved from PARAM table.
  const firstIsGrouping = isGroupingItem(righeLayout[0]);
  if (firstIsGrouping) {
    const gItem = righeLayout[0];
    if (righeLayout.length >= 2 && !isGroupingItem(righeLayout[1])) {
      // Two-level hierarchy: Grouping → source column
      return buildGroupingParamHierarchy(gItem.paramTableId!, gItem.fieldName, righeLayout[1].fieldName);
    }
    // Single-level: flat list of grouping values as row labels
    const groupings = await getDistinctParamGroupings(gItem.paramTableId!);
    return groupings.map((g) => ({
      depth: 0, fieldName: gItem.fieldName, value: g,
      label: g, isLeaf: true,
      pathValues: { [gItem.fieldName]: g },
      paramRow: null,
    }));
  }

  // Exclude any remaining _Grouping fields from SQL-based paths
  const realRighe = righeLayout.filter((r) => !isGroupingItem(r));
  if (realRighe.length === 0) return [];
  // Reassign to proceed with real fields only
  righeLayout = realRighe;

  righeLayout.forEach((r) => assertValidIdentifier(r.fieldName, `righe field "${r.fieldName}"`));

  // Dim-table path — only when no riga is PARAM-based (paramTableId fields live in the fact table,
  // not in the dim view, so a mixed righe list must use the fact-based path below).
  const dimTables = [...new Set(righeLayout.map((r) => r.dimTable ?? null).filter(Boolean))];
  if (
    dimTables.length === 1
    && righeLayout.every((r) => r.dimTable === dimTables[0])
    && righeLayout.every((r) => !r.paramTableId)
  ) {
    const [dimSchema, dimTbl] = splitFact(dimTables[0]!);
    assertValidIdentifier(dimTbl, 'dimTable');

    const factFieldName = righeLayout[0].fieldName;
    const hierDef = await getHierarchyDefForDimTable(reportId, `${dimSchema}.${dimTbl}`);
    if (hierDef) {
      return buildParentChildHierarchy(
        dimSchema, dimTbl, factFieldName,
        hierDef.childKeyCol, hierDef.parentKeyCol, hierDef.labelCol,
        hierDef.orderCol ?? null, reportId,
      );
    }

    const hasParentCol = await columnExists(dimSchema, dimTbl, 'FolderFatherKey');
    if (hasParentCol) {
      const hasOrder  = await columnExists(dimSchema, dimTbl, 'InLevelOrder');
      const hasFolder = await columnExists(dimSchema, dimTbl, 'Folder');
      return buildParentChildHierarchy(
        dimSchema, dimTbl, factFieldName,
        'FolderChildKey', 'FolderFatherKey',
        hasFolder ? 'Folder' : 'FolderChildKey',
        hasOrder ? 'InLevelOrder' : null,
        reportId,
      );
    }

    const hasOrder = await columnExists(dimSchema, dimTbl, 'InLevelOrder');
    return buildDimTableHierarchy(dimSchema, dimTbl, righeLayout.map((r) => r.fieldName), hasOrder);
  }

  // Fact-based path
  const paramMaps = await Promise.all(
    righeLayout.map((r) => r.paramTableId ? loadParamMap(r.paramTableId) : Promise.resolve(new Map())),
  );

  if (righeLayout.length === 1) {
    const pMap = paramMaps[0] as Map<string, { label: string; paramRow: NonNullable<ParamRowShape> }>;
    let values: string[];
    if (pMap.size > 0) {
      values = [...pMap.keys()];
    } else {
      values = await getDistinctColValues(schema, factTable, righeLayout[0].fieldName);
    }
    const fn = righeLayout[0].fieldName;
    return values.map((v) => {
      const info = pMap.get(v);
      return {
        depth: 0, fieldName: fn, value: v,
        label: info?.label ?? v, isLeaf: true,
        pathValues: { [fn]: v },
        paramRow: info?.paramRow ?? null,
      };
    });
  }

  // Multi-level
  const selectCols = righeLayout.map((r) => `[${r.fieldName}]`).join(', ');
  const combinations = await dbAll<Record<string, string>>(
    `SELECT DISTINCT TOP(5000) ${selectCols}
       FROM [${schema}].[${factTable}]
      ORDER BY ${selectCols}`,
  );

  const result: DataEntryRigaOption[] = [];
  const seenPathKeys = new Set<string>();

  for (const combo of combinations) {
    for (let depth = 0; depth < righeLayout.length; depth++) {
      const pathValues: Record<string, string> = {};
      for (let d = 0; d <= depth; d++) {
        pathValues[righeLayout[d].fieldName] = combo[righeLayout[d].fieldName];
      }
      const pk = Object.keys(pathValues).sort().map((k) => `${k}=${pathValues[k]}`).join('|');
      if (seenPathKeys.has(pk)) continue;
      seenPathKeys.add(pk);

      const fn    = righeLayout[depth].fieldName;
      const value = combo[fn];
      const isLeaf = depth === righeLayout.length - 1;
      const pMap   = paramMaps[depth] as Map<string, { label: string; paramRow: NonNullable<ParamRowShape> }>;
      const info   = pMap.get(value);
      result.push({
        depth, fieldName: fn, value,
        label: info?.label ?? value, isLeaf,
        pathValues,
        paramRow: info?.paramRow ?? null,
      });
    }
  }

  return result;
}

// ── loadWriteRows ─────────────────────────────────────────────────────────────

export async function loadWriteRows(
  schema: string, writeTable: string,
  allDimFields: string[], valoriFields: string[],
): Promise<WriteRow[]> {
  assertValidIdentifier(schema, 'schema');
  assertValidIdentifier(writeTable, 'writeTable');

  const exists = await dbGet<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    schema, writeTable,
  );
  if (!exists || (exists.cnt as unknown as number) === 0) return [];

  const selectCols = [...allDimFields, ...valoriFields].map((f) => `[${f}]`).join(', ');
  const rows = await dbAll<Record<string, unknown>>(
    `SELECT ${selectCols} FROM [${schema}].[${writeTable}]`,
  );

  return rows.map((row) => {
    const dimensionValues: Record<string, string> = {};
    allDimFields.forEach((f) => { dimensionValues[f] = row[f] != null ? String(row[f]) : ''; });
    const values: Record<string, string | null> = {};
    valoriFields.forEach((f) => { values[f] = row[f] != null ? String(row[f]) : null; });
    return { dimensionValues, values };
  });
}

// ── resolveDistinctSource ─────────────────────────────────────────────────────

export function resolveDistinctSource(
  fieldName: string,
  explicitDimTable: string | null | undefined,
  joinConfig: Array<{ leftKey: string; rightTable: string }>,
  fallbackSchema: string,
  fallbackTable: string,
): [string, string] {
  if (explicitDimTable) return splitFact(explicitDimTable);
  const join = joinConfig.find((j) => j.leftKey === fieldName);
  if (join) return splitFact(join.rightTable);
  return [fallbackSchema, fallbackTable];
}

// ── loadAggregatedFactRows ────────────────────────────────────────────────────

export async function loadAggregatedFactRows(
  schemaName: string,
  factTable: string,
  joinConfig: Array<{ leftKey: string; rightTable: string; rightKey?: string; joinType?: string }>,
  layout: DataEntryGridResponse['layout'],
  reportId: number,
): Promise<WriteRow[]> {
  const valoriFields = layout.valori.map((v) => v.fieldName);
  if (valoriFields.length === 0) return [];

  // Param-based fields (paramTableId set) are fact-level even when dimTable is also set.
  // Pure dim-only fields (dimTable set, no paramTableId) are handled via JOIN below, not here.
  const isFactDimAgg = (f: { paramTableId?: number | null; dimTable?: unknown }) =>
    !isGroupingItem(f as any) && (!(f as any).dimTable || !!(f as any).paramTableId);

  const factDimFields = [
    ...layout.filtri.filter(isFactDimAgg).map((f) => f.fieldName),
    ...layout.righe.filter(isFactDimAgg).map((f) => f.fieldName),
    ...layout.colonne.filter(isFactDimAgg).map((f) => f.fieldName),
  ];

  // Pure dim-only righe/colonne: dimTable set AND no paramTableId → handled via JOIN
  const dimRighe   = layout.righe.filter((f) => !!(f as any).dimTable && !(f as any).paramTableId) as any[];
  const dimColonne = layout.colonne.filter((f) => !!(f as any).dimTable && !(f as any).paramTableId) as any[];
  if (dimRighe.length === 0 && dimColonne.length === 0) return [];

  const selectParts:  string[] = [];
  const groupByParts: string[] = [];
  const joinClauses:  string[] = [];
  const usedJoinIdx  = new Set<number>();

  for (const f of factDimFields) {
    assertValidIdentifier(f, `agg fact dim "${f}"`);
    selectParts.push(`[f].[${f}]`);
    groupByParts.push(`[f].[${f}]`);
  }

  for (const r of dimRighe) {
    const fieldName = r.fieldName as string;
    const dimTable  = (r as any).dimTable as string;
    const [dSchema, dTbl] = splitFact(dimTable);
    assertValidIdentifier(dTbl, `agg dim righe table "${dTbl}"`);
    assertValidIdentifier(fieldName, `agg dim righe field "${fieldName}"`);

    const hierDef = await getHierarchyDefForDimTable(reportId, dimTable);
    const childKey = hierDef?.childKeyCol ?? 'FolderChildKey';
    assertValidIdentifier(childKey, `childKey "${childKey}"`);

    const jIdx = joinConfig.findIndex((j, i) =>
      !usedJoinIdx.has(i) && splitFact(j.rightTable)[1].toLowerCase() === dTbl.toLowerCase(),
    );
    if (jIdx < 0) continue;
    usedJoinIdx.add(jIdx);
    const j = joinConfig[jIdx];
    assertValidIdentifier(j.leftKey, `agg join leftKey "${j.leftKey}"`);
    const rKey = j.rightKey ?? childKey;
    assertValidIdentifier(rKey, `agg join rightKey "${rKey}"`);

    const alias = `r${jIdx}`;
    joinClauses.push(
      `LEFT JOIN [${dSchema}].[${dTbl}] [${alias}] ON [f].[${j.leftKey}] = [${alias}].[${rKey}]`,
    );
    selectParts.push(`[${alias}].[${rKey}] AS [${fieldName}]`);
    groupByParts.push(`[${alias}].[${rKey}]`);
  }

  for (const c of dimColonne) {
    const fieldName = c.fieldName as string;
    const dimTable  = (c as any).dimTable as string;
    const [dSchema, dTbl] = splitFact(dimTable);
    assertValidIdentifier(dTbl, `agg dim colonne table "${dTbl}"`);
    assertValidIdentifier(fieldName, `agg dim colonne field "${fieldName}"`);

    const jIdx = joinConfig.findIndex((j, i) =>
      !usedJoinIdx.has(i) && splitFact(j.rightTable)[1].toLowerCase() === dTbl.toLowerCase(),
    );
    if (jIdx < 0) continue;
    usedJoinIdx.add(jIdx);
    const j = joinConfig[jIdx];
    assertValidIdentifier(j.leftKey, `agg colonne leftKey "${j.leftKey}"`);
    const rKey = j.rightKey ?? j.leftKey;
    assertValidIdentifier(rKey, `agg colonne rightKey "${rKey}"`);

    const alias = `c${jIdx}`;
    joinClauses.push(
      `LEFT JOIN [${dSchema}].[${dTbl}] [${alias}] ON [f].[${j.leftKey}] = [${alias}].[${rKey}]`,
    );
    selectParts.push(`[${alias}].[${fieldName}] AS [${fieldName}]`);
    groupByParts.push(`[${alias}].[${fieldName}]`);
  }

  if (selectParts.length === 0) return [];

  valoriFields.forEach((v) => assertValidIdentifier(v, `agg valori "${v}"`));
  const valoriSelect = valoriFields.map((v) => `SUM([f].[${v}]) AS [${v}]`).join(', ');
  const havingNonNull = [...groupByParts].map((g) => `${g} IS NOT NULL`).join(' AND ');

  const sql = [
    `SELECT ${[...selectParts, valoriSelect].join(', ')}`,
    `FROM [${schemaName}].[${factTable}] [f]`,
    ...joinClauses,
    `GROUP BY ${groupByParts.join(', ')}`,
    `HAVING ${havingNonNull}`,
  ].join('\n');

  const rows = await dbAll<Record<string, unknown>>(sql);

  const allDimOut = [
    ...factDimFields,
    ...dimRighe.map((r) => r.fieldName as string),
    ...dimColonne.map((c) => c.fieldName as string),
  ];

  return rows.map((row) => {
    const dimensionValues: Record<string, string> = {};
    allDimOut.forEach((f) => { dimensionValues[f] = row[f] != null ? String(row[f]) : ''; });
    const values: Record<string, string | null> = {};
    valoriFields.forEach((v) => { values[v] = row[v] != null ? String(row[v]) : null; });
    return { dimensionValues, values };
  });
}

// ── getDataEntryGrid ──────────────────────────────────────────────────────────

export async function getDataEntryGrid(reportId: number): Promise<DataEntryGridResponse> {
  // 1. Layout
  const layoutRow = await dbGet<{ ConfigJson: string }>(
    'SELECT ConfigJson FROM dbo.cfg_EntryLayout WHERE ReportId = ?',
    reportId,
  );
  if (!layoutRow) {
    const e = new Error('Entry layout non configurato per questo report');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
  const layout = JSON.parse(layoutRow.ConfigJson) as DataEntryGridResponse['layout'];

  // 2. Binding
  const bindingRow = await dbGet<{ FactTable: string; JoinConfig: string | null }>(
    'SELECT FactTable, JoinConfig FROM dbo.cfg_DatasetBinding WHERE ReportId = ?',
    reportId,
  );
  if (!bindingRow) {
    const e = new Error('Dataset binding non configurato per questo report');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }

  const [schemaName, factTable] = splitFact(bindingRow.FactTable);
  type JoinEntry = { leftKey: string; rightTable: string; rightKey?: string; joinType?: string };
  const joinConfig: JoinEntry[] = bindingRow.JoinConfig
    ? (JSON.parse(bindingRow.JoinConfig) as JoinEntry[])
    : [];
  const writeTable = `${factTable}_WRITE`;

  const filtriFields  = layout.filtri.map((f) => f.fieldName);
  const righeFields   = layout.righe.map((f) => f.fieldName);
  const colonneFields = layout.colonne.map((f) => f.fieldName);
  const valoriFields  = layout.valori.map((f) => f.fieldName);

  validateLayoutIdentifiers(filtriFields, righeFields, colonneFields, valoriFields);

  // 3. Filter options
  const filtriOptions: DataEntryFiltriOption[] = await Promise.all(
    layout.filtri.map(async (f) => {
      if (isGroupingItem(f)) {
        return { fieldName: f.fieldName, label: f.label,
                 values: await getDistinctParamGroupings(f.paramTableId!) };
      }
      const [qSchema, qTable] = resolveDistinctSource(
        f.fieldName, (f as any).dimTable as string | null, joinConfig, schemaName, factTable,
      );
      try {
        return {
          fieldName: f.fieldName, label: f.label,
          values: await getDistinctColValues(qSchema, qTable, f.fieldName),
        };
      } catch (err) {
        console.warn(`[filtriOptions] could not load values for "${f.fieldName}" from [${qSchema}].[${qTable}]:`, (err as Error).message);
        return { fieldName: f.fieldName, label: f.label, values: [] };
      }
    }),
  );

  // 4. Righe options
  const righeOptions: DataEntryRigaOption[] = await getMultiLevelRigheOptions(
    schemaName, factTable, layout.righe, reportId,
  );

  // 5. Colonne options
  const colonneOptions = await Promise.all(
    layout.colonne.map(async (f) => {
      if (isGroupingItem(f)) {
        return { fieldName: f.fieldName,
                 values: await getDistinctParamGroupings(f.paramTableId!) };
      }
      const [qSchema, qTable] = resolveDistinctSource(
        f.fieldName, (f as any).dimTable as string | null, joinConfig, schemaName, factTable,
      );
      return {
        fieldName: f.fieldName,
        values: await getDistinctColValues(qSchema, qTable, f.fieldName),
      };
    }),
  );

  // 6. Write rows — exclude virtual _Grouping fields (not stored in WRITE table).
  // Param-based fields (paramTableId set) are fact-level dimensions and belong in the write
  // table even when they also carry a dimTable (dimTable = hierarchy source, not exclusion flag).
  // Pure dim-table-only fields (dimTable set, no paramTableId) are excluded — they are not
  // columns in the fact/write table (e.g. a pure hierarchy like STAKEHOLDER from a dim view).
  const isFactDim = (f: { paramTableId?: number | null; dimTable?: unknown }) =>
    !isGroupingItem(f as any) && (!(f as any).dimTable || !!(f as any).paramTableId);

  const factFiltriFields  = layout.filtri.filter(isFactDim).map((f) => f.fieldName);
  const factRigheFields   = layout.righe.filter(isFactDim).map((f) => f.fieldName);
  const factColonneFields = layout.colonne.filter((f) => !isGroupingItem(f)).map((f) => f.fieldName);
  const allDimFields      = [...factFiltriFields, ...factRigheFields, ...factColonneFields];

  let writeRows = await loadWriteRows(schemaName, writeTable, allDimFields, valoriFields);

  const factRows = await loadAggregatedFactRows(schemaName, factTable, joinConfig, layout, reportId);
  if (writeRows.length === 0) {
    writeRows = factRows;
  } else {
    const writeKeys = new Set(writeRows.map((r) => sortedJson(r.dimensionValues)));
    for (const fr of factRows) {
      if (!writeKeys.has(sortedJson(fr.dimensionValues))) writeRows.push(fr);
    }
  }

  // Post-process: resolve virtual _Grouping dimension values from PARAM maps
  const groupingItems = [
    ...layout.filtri.filter(isGroupingItem),
    ...layout.righe.filter(isGroupingItem),
    ...layout.colonne.filter(isGroupingItem),
  ];
  if (groupingItems.length > 0) {
    const resolutions = new Map<string, { sourceCol: string; map: Map<string, string> }>();
    for (const item of groupingItems) {
      if (resolutions.has(item.fieldName)) continue;
      const pMap = await loadParamMap(item.paramTableId!);
      const sourceCol = item.fieldName.slice(0, -'_Grouping'.length);
      const gMap = new Map<string, string>();
      for (const [sv, info] of pMap) gMap.set(sv, info.paramRow.raggruppamento ?? '');
      resolutions.set(item.fieldName, { sourceCol, map: gMap });
    }
    for (const row of writeRows) {
      for (const [gField, { sourceCol, map }] of resolutions) {
        row.dimensionValues[gField] = map.get(row.dimensionValues[sourceCol] ?? '') ?? '';
      }
    }
  }

  // 7. Approval state
  const approvedRows = await getRowApprovalsArray(reportId);

  return {
    bindingInfo: { factTable, schemaName, writeTable },
    layout,
    filtriOptions,
    righeOptions,
    colonneOptions,
    writeRows,
    approvedRows,
  };
}
