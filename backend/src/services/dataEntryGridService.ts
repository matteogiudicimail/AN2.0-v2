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

// ── extendGroupingHierarchy ───────────────────────────────────────────────────

/**
 * Extends an existing 2-level Grouping → Dim2 hierarchy with one or more
 * additional fact-based dimension levels (Dim3, Dim4, …).
 *
 * Each current leaf node becomes a non-leaf group; its children are the
 * distinct values of the next additional dimension.  Recurses for further dims.
 *
 * If no values can be found for a dim (empty fact + write table, no param map)
 * the hierarchy is returned as-is without further extension.
 */
async function extendGroupingHierarchy(
  base:           DataEntryRigaOption[],
  additionalDims: Array<{ fieldName: string; paramTableId: number | null; dimTable?: string | null }>,
  schema:         string,
  factTable:      string,
): Promise<DataEntryRigaOption[]> {
  if (additionalDims.length === 0) return base;

  const dim = additionalDims[0];
  assertValidIdentifier(dim.fieldName, `extend dim "${dim.fieldName}"`);

  // Resolve values priority: param map → dim table → fact table → write table
  let dimValues: string[] = [];

  if (dim.paramTableId) {
    const pm = await loadParamMap(dim.paramTableId);
    dimValues = [...pm.keys()];
  }

  if (dimValues.length === 0 && dim.dimTable) {
    try {
      const [dimSchema, dimTbl] = splitFact(dim.dimTable);
      assertValidIdentifier(dimTbl, `extend dimTable "${dimTbl}"`);
      dimValues = await getDistinctColValues(dimSchema, dimTbl, dim.fieldName);
    } catch { /* dim table might not have this column */ }
  }

  if (dimValues.length === 0) {
    try { dimValues = await getDistinctColValues(schema, factTable, dim.fieldName); } catch { /* ignore */ }
  }
  if (dimValues.length === 0) {
    try { dimValues = await getDistinctColValues(schema, `${factTable}_WRITE`, dim.fieldName); } catch { /* ignore */ }
  }
  if (dimValues.length === 0) return base; // can't extend — return as-is

  const isLastDim = additionalDims.length === 1;
  const result: DataEntryRigaOption[] = [];

  for (const node of base) {
    if (!node.isLeaf) {
      result.push(node); // non-leaf group: keep untouched
    } else {
      // Promote leaf → non-leaf, then append children
      result.push({ ...node, isLeaf: false });
      for (const v of dimValues) {
        result.push({
          depth:      node.depth + 1,
          fieldName:  dim.fieldName,
          value:      v,
          label:      v,
          isLeaf:     isLastDim,
          pathValues: { ...node.pathValues, [dim.fieldName]: v },
          paramRow:   null,
        });
      }
    }
  }

  return isLastDim
    ? result
    : extendGroupingHierarchy(result, additionalDims.slice(1), schema, factTable);
}

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
      // Base 2-level: Grouping (depth 0) → Dim2 (depth 1, leaf)
      const base2 = await buildGroupingParamHierarchy(
        gItem.paramTableId!, gItem.fieldName, righeLayout[1].fieldName,
      );
      // If there are additional row dimensions beyond Dim2, extend the hierarchy
      if (righeLayout.length > 2) {
        const additionalDims = righeLayout.slice(2).map((r) => ({
          fieldName:   r.fieldName,
          paramTableId: r.paramTableId,
          dimTable:    r.dimTable ?? null,
        }));
        return extendGroupingHierarchy(base2, additionalDims, schema, factTable);
      }
      return base2;
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

  // Multi-level — collect distinct dimension combinations from multiple sources.
  const selectCols = righeLayout.map((r) => `[${r.fieldName}]`).join(', ');
  const orderCols  = selectCols; // same expression, valid for ORDER BY

  let combinations: Record<string, string>[] = [];

  // 1. Try source fact table
  try {
    combinations = await dbAll<Record<string, string>>(
      `SELECT DISTINCT TOP(5000) ${selectCols}
         FROM [${schema}].[${factTable}]
        ORDER BY ${orderCols}`,
    );
  } catch { /* fact table might not have all columns — fall through */ }

  // 2. Fallback: WRITE table (populated when user enters data)
  if (combinations.length === 0) {
    try {
      combinations = await dbAll<Record<string, string>>(
        `SELECT DISTINCT TOP(5000) ${selectCols}
           FROM [${schema}].[${factTable}_WRITE]
          ORDER BY ${orderCols}`,
      );
    } catch { /* write table might not exist yet */ }
  }

  // 3. Fallback: Cartesian product from param maps (covers new reports with no data yet).
  //    Only used when ALL row dimensions have a configured param table.
  if (combinations.length === 0 && paramMaps.every((pm) => pm.size > 0)) {
    let product: Record<string, string>[] = [{}];
    for (let d = 0; d < righeLayout.length; d++) {
      const fn   = righeLayout[d].fieldName;
      const keys = [...paramMaps[d].keys()];
      const next: Record<string, string>[] = [];
      for (const existing of product) {
        for (const k of keys) next.push({ ...existing, [fn]: k });
      }
      product = next;
    }
    combinations = product;
  }

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
  _allDimFields: string[], valoriFields: string[],
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

  // SELECT * so we get every column the WRITE table has, regardless of what isFactDim
  // excludes. The table may have been created with more dimension columns than allDimFields
  // currently lists (e.g. dimTable fields are still real fact-table columns).
  const rows = await dbAll<Record<string, unknown>>(
    `SELECT * FROM [${schema}].[${writeTable}]`,
  );

  const valoriSet = new Set(valoriFields);
  const metaCols  = new Set(['UpdatedBy', 'UpdatedAt']);

  return rows.map((row) => {
    const dimensionValues: Record<string, string> = {};
    const values: Record<string, string | null> = {};
    for (const [key, val] of Object.entries(row)) {
      if (metaCols.has(key)) continue;
      if (valoriSet.has(key)) {
        values[key] = val != null ? String(val) : null;
      } else {
        dimensionValues[key] = val != null ? String(val) : '';
      }
    }
    // Guarantee all declared value fields are present (null if missing from row)
    valoriFields.forEach((f) => { if (!(f in values)) values[f] = null; });
    return { dimensionValues, values };
  });
}

// ── loadFiltriDimMapping ──────────────────────────────────────────────────────
/**
 * For "pure dim-table-only" filtri fields (dimTable set, no paramTableId) that map
 * to ROWS (i.e. their dimTable does NOT match any colonne dimTable), builds:
 *   fieldName → filterValue → array of primary-row field values
 *
 * When primaryRiga itself comes from a dimTable (e.g. DescrizioneKPI lives in the
 * KPI dim, not directly in the fact table), the rowKey is read from the dim-table
 * alias rather than from [f].  This matches the pathValues populated by
 * loadAggregatedFactRows which now selects the display column from the dim table.
 */
export async function loadFiltriDimMapping(
  schemaName: string,
  factTable:  string,
  joinConfig: Array<{ leftKey: string; rightTable: string; rightKey?: string; joinType?: string }>,
  layout:     DataEntryGridResponse['layout'],
  _reportId:  number,
): Promise<Record<string, Record<string, string[]>>> {
  const result: Record<string, Record<string, string[]>> = {};

  const dimRighe = layout.righe.filter(
    (f) => !!(f as any).dimTable && !(f as any).paramTableId && !isGroupingItem(f),
  ) as any[];
  if (dimRighe.length === 0) return result;

  const primaryRiga    = dimRighe[dimRighe.length - 1];
  const rigaFieldName  = primaryRiga.fieldName as string;
  const rigaDimTable   = (primaryRiga as any).dimTable as string | null;
  assertValidIdentifier(rigaFieldName, 'filtriMapping rigaFieldName');

  // Resolve the righe dim join (used when rigaFieldName lives in a dim table, not in [f])
  let rigaJoin: { leftKey: string; rightTable: string; rightKey?: string } | null = null;
  if (rigaDimTable) {
    const [, rTbl] = splitFact(rigaDimTable);
    const idx = joinConfig.findIndex(
      (j) => splitFact(j.rightTable)[1].toLowerCase() === rTbl.toLowerCase(),
    );
    if (idx >= 0) rigaJoin = joinConfig[idx];
  }

  // Colonne dimTables: filtri whose dimTable matches a colonne field are column filters
  // and are handled by loadFiltriColonneMapping — skip them here.
  const colonneDimTbls = new Set(
    layout.colonne
      .filter((f) => !!(f as any).dimTable && !(f as any).paramTableId)
      .map((f) => splitFact((f as any).dimTable as string)[1].toLowerCase()),
  );

  const dimFiltri = layout.filtri.filter(
    (f) => !!(f as any).dimTable && !(f as any).paramTableId && !isGroupingItem(f),
  ) as any[];
  if (dimFiltri.length === 0) return result;

  for (const filtro of dimFiltri) {
    const filtroFieldName = filtro.fieldName as string;
    const filtroDimTable  = filtro.dimTable  as string;
    const [fSchema, fTbl] = splitFact(filtroDimTable);

    // Skip column-type filtri (handled by loadFiltriColonneMapping)
    if (colonneDimTbls.has(fTbl.toLowerCase())) continue;

    const filtroJoinIdx = joinConfig.findIndex(
      (j) => splitFact(j.rightTable)[1].toLowerCase() === fTbl.toLowerCase(),
    );
    if (filtroJoinIdx < 0) continue;
    const filtroJoin = joinConfig[filtroJoinIdx];

    try {
      assertValidIdentifier(filtroJoin.leftKey, 'filtriMapping filtroJoin.leftKey');
      assertValidIdentifier(fTbl,               'filtriMapping fTbl');
      assertValidIdentifier(filtroFieldName,    'filtriMapping filtroFieldName');

      const filtroRKey = filtroJoin.rightKey ?? filtroJoin.leftKey;
      assertValidIdentifier(filtroRKey, 'filtriMapping filtroRKey');

      let sql: string;

      if (rigaJoin) {
        // rigaFieldName lives in a dim table — read it from the dim alias, not [f].
        const rigaRKey    = rigaJoin.rightKey ?? rigaJoin.leftKey;
        const [rSchema, rTbl] = splitFact(rigaDimTable!);
        assertValidIdentifier(rigaJoin.leftKey, 'filtriMapping rigaJoin.leftKey');
        assertValidIdentifier(rTbl,             'filtriMapping rigaTbl');
        assertValidIdentifier(rigaRKey,         'filtriMapping rigaRKey');

        // Same dim table for both riga and filtro → reuse a single join alias.
        if (rTbl.toLowerCase() === fTbl.toLowerCase()) {
          sql = `
            SELECT DISTINCT
              [fdim].[${rigaFieldName}]   AS [_rowKey],
              [fdim].[${filtroFieldName}] AS [_filtroVal]
            FROM   [${schemaName}].[${factTable}] [f]
            LEFT JOIN [${fSchema}].[${fTbl}] [fdim]
                   ON [f].[${filtroJoin.leftKey}] = [fdim].[${filtroRKey}]
            WHERE  [fdim].[${rigaFieldName}]   IS NOT NULL
              AND  [fdim].[${filtroFieldName}] IS NOT NULL
          `;
        } else {
          // Different dim tables — two joins required.
          sql = `
            SELECT DISTINCT
              [rdim].[${rigaFieldName}]   AS [_rowKey],
              [fdim].[${filtroFieldName}] AS [_filtroVal]
            FROM   [${schemaName}].[${factTable}] [f]
            LEFT JOIN [${rSchema}].[${rTbl}] [rdim]
                   ON [f].[${rigaJoin.leftKey}] = [rdim].[${rigaRKey}]
            LEFT JOIN [${fSchema}].[${fTbl}] [fdim]
                   ON [f].[${filtroJoin.leftKey}] = [fdim].[${filtroRKey}]
            WHERE  [rdim].[${rigaFieldName}]   IS NOT NULL
              AND  [fdim].[${filtroFieldName}] IS NOT NULL
          `;
        }
      } else {
        // Original path: rigaFieldName is a direct column in the fact table.
        sql = `
          SELECT DISTINCT
            [f].[${rigaFieldName}]        AS [_rowKey],
            [fdim].[${filtroFieldName}]   AS [_filtroVal]
          FROM   [${schemaName}].[${factTable}] [f]
          LEFT JOIN [${fSchema}].[${fTbl}] [fdim]
                 ON [f].[${filtroJoin.leftKey}] = [fdim].[${filtroRKey}]
          WHERE  [f].[${rigaFieldName}]      IS NOT NULL
            AND  [fdim].[${filtroFieldName}] IS NOT NULL
        `;
      }

      const rows = await dbAll<{ _rowKey: string; _filtroVal: string }>(sql);

      const mapping: Record<string, string[]> = {};
      for (const row of rows) {
        const fv = String(row._filtroVal);
        const rk = String(row._rowKey);
        if (!mapping[fv]) mapping[fv] = [];
        if (!mapping[fv].includes(rk)) mapping[fv].push(rk);
      }
      result[filtroFieldName] = mapping;
    } catch (err) {
      console.warn(
        `[filtriDimMapping] could not build mapping for "${filtroFieldName}":`,
        (err as Error).message,
      );
    }
  }

  return result;
}

// ── loadFiltriColonneMapping ──────────────────────────────────────────────────
/**
 * For "pure dim-table-only" filtri fields whose dimTable matches a COLONNE field's
 * dimTable, builds a column-level filter mapping:
 *   fieldName → filterValue → array of colonna field values visible under that filter.
 *
 * Used by the frontend to hide/show column headers when such a filter is active.
 */
export async function loadFiltriColonneMapping(
  schemaName: string,
  factTable:  string,
  joinConfig: Array<{ leftKey: string; rightTable: string; rightKey?: string; joinType?: string }>,
  layout:     DataEntryGridResponse['layout'],
): Promise<Record<string, Record<string, string[]>>> {
  const result: Record<string, Record<string, string[]>> = {};

  // Colonne fields that come from a dim table
  const dimColonne = layout.colonne.filter(
    (f) => !!(f as any).dimTable && !(f as any).paramTableId && !isGroupingItem(f),
  ) as any[];
  if (dimColonne.length === 0) return result;

  // Build a set of colonne dimTable names → their leaf fieldName
  const colonneDimMap = new Map<string, { fieldName: string; dimTable: string }>();
  for (const c of dimColonne) {
    const [, tbl] = splitFact((c as any).dimTable as string);
    colonneDimMap.set(tbl.toLowerCase(), { fieldName: c.fieldName, dimTable: (c as any).dimTable });
  }

  // Only process filtri that match a colonne dimTable
  const colonneFiltri = layout.filtri.filter((f) => {
    if (!(f as any).dimTable || (f as any).paramTableId || isGroupingItem(f)) return false;
    const [, fTbl] = splitFact((f as any).dimTable as string);
    return colonneDimMap.has(fTbl.toLowerCase());
  }) as any[];
  if (colonneFiltri.length === 0) return result;

  for (const filtro of colonneFiltri) {
    const filtroFieldName = filtro.fieldName as string;
    const filtroDimTable  = filtro.dimTable  as string;
    const [fSchema, fTbl] = splitFact(filtroDimTable);

    // Find the colonna field that shares this dim table
    const colonnaInfo = colonneDimMap.get(fTbl.toLowerCase());
    if (!colonnaInfo) continue;
    const colonnaFieldName = colonnaInfo.fieldName;

    const filtroJoinIdx = joinConfig.findIndex(
      (j) => splitFact(j.rightTable)[1].toLowerCase() === fTbl.toLowerCase(),
    );
    if (filtroJoinIdx < 0) continue;
    const filtroJoin = joinConfig[filtroJoinIdx];

    try {
      assertValidIdentifier(filtroJoin.leftKey, 'filtriColMapping filtroJoin.leftKey');
      assertValidIdentifier(fTbl,               'filtriColMapping fTbl');
      assertValidIdentifier(filtroFieldName,    'filtriColMapping filtroFieldName');
      assertValidIdentifier(colonnaFieldName,   'filtriColMapping colonnaFieldName');

      const filtroRKey = filtroJoin.rightKey ?? filtroJoin.leftKey;
      assertValidIdentifier(filtroRKey, 'filtriColMapping filtroRKey');

      // Both colonnaFieldName and filtroFieldName live in the same dim table (fdim)
      const sql = `
        SELECT DISTINCT
          [fdim].[${colonnaFieldName}]  AS [_colKey],
          [fdim].[${filtroFieldName}]   AS [_filtroVal]
        FROM   [${schemaName}].[${factTable}] [f]
        LEFT JOIN [${fSchema}].[${fTbl}] [fdim]
               ON [f].[${filtroJoin.leftKey}] = [fdim].[${filtroRKey}]
        WHERE  [fdim].[${colonnaFieldName}]  IS NOT NULL
          AND  [fdim].[${filtroFieldName}]   IS NOT NULL
      `;

      const rows = await dbAll<{ _colKey: string; _filtroVal: string }>(sql);

      const mapping: Record<string, string[]> = {};
      for (const row of rows) {
        const fv = String(row._filtroVal);
        const ck = String(row._colKey);
        if (!mapping[fv]) mapping[fv] = [];
        if (!mapping[fv].includes(ck)) mapping[fv].push(ck);
      }
      result[filtroFieldName] = mapping;
    } catch (err) {
      console.warn(
        `[filtriColMapping] could not build mapping for "${filtroFieldName}":`,
        (err as Error).message,
      );
    }
  }

  return result;
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
  // Return early only if there are no JOIN-based dims AND no direct fact-level dims to SELECT
  if (dimRighe.length === 0 && dimColonne.length === 0 && factDimFields.length === 0) return [];

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
    // Select the display column (fieldName) from the dim table, not the join key (rKey).
    // The row headers are loaded from the fieldName column; fact rows must match them.
    assertValidIdentifier(fieldName, `agg dim righe display field "${fieldName}"`);
    selectParts.push(`[${alias}].[${fieldName}] AS [${fieldName}]`);
    groupByParts.push(`[${alias}].[${fieldName}]`);
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
        // Fallback: try WRITE table (filter dims may only exist there, not in fact/join tables)
        try {
          const values = await getDistinctColValues(schemaName, writeTable, f.fieldName);
          return { fieldName: f.fieldName, label: f.label, values };
        } catch {
          console.warn(`[filtriOptions] fallback WRITE table also failed for "${f.fieldName}" from [${schemaName}].[${writeTable}]`);
          return { fieldName: f.fieldName, label: f.label, values: [] };
        }
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

  // 6. Compute expected dim fields (used for filtriOptions resolution; loadWriteRows uses SELECT *).
  // FILTRI: exclude pure dim-table-only fields (they filter the view, not stored per row).
  // RIGHE: include ALL non-grouping fields — row fields are the primary key of the WRITE table.
  const isFactFiltro = (f: { paramTableId?: number | null; dimTable?: unknown }) =>
    !isGroupingItem(f as any) && (!(f as any).dimTable || !!(f as any).paramTableId);
  const isFactRiga = (f: { paramTableId?: number | null; dimTable?: unknown }) =>
    !isGroupingItem(f as any); // All row dims stored, including dimTable-only ones

  const factFiltriFields  = layout.filtri.filter(isFactFiltro).map((f) => f.fieldName);
  const factRigheFields   = layout.righe.filter(isFactRiga).map((f) => f.fieldName);
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

  // 8. Filtri dim/colonne mappings for pure dim-table-only filtri fields.
  //    Provides filterValue → [rowKey, ...] for row-level filtering, and
  //    filterValue → [colKey, ...] for column-level filtering in the frontend.
  const [filtriDimMapping, filtriColonneMapping] = await Promise.all([
    loadFiltriDimMapping(schemaName, factTable, joinConfig, layout, reportId),
    loadFiltriColonneMapping(schemaName, factTable, joinConfig, layout),
  ]);

  return {
    bindingInfo: { factTable, schemaName, writeTable },
    layout,
    filtriOptions,
    righeOptions,
    colonneOptions,
    writeRows,
    approvedRows,
    filtriDimMapping:    Object.keys(filtriDimMapping).length    > 0 ? filtriDimMapping    : undefined,
    filtriColonneMapping: Object.keys(filtriColonneMapping).length > 0 ? filtriColonneMapping : undefined,
  };
}
