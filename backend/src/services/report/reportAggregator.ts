/**
 * Report Aggregator — builds the full P&L tree from leaf facts + hierarchy.
 *
 * Algorithm:
 *  1. Start with leaf-level fact values (from query builder)
 *  2. Walk up the hierarchy, summing children into parents
 *  3. Suppress ragged empty rows: nodes with no values across ALL loadIds are omitted [F09]
 *  4. Return rows in hierarchy order (parents before children, DFS preorder)
 */
import { HierarchyNode } from '../hierarchyService';
import { ReportRow, FactLeafRow } from '../../models/report.models';

type ValueMap = Record<string, number | null>;    // loadId → amount
type VersionMap = Record<string, number>;          // loadId → version

/** Aggregated node used internally during tree build */
interface TreeNode {
  node:      HierarchyNode;
  values:    ValueMap;
  versions:  VersionMap;
  children:  TreeNode[];
}

/**
 * Takes:
 *   - hierarchy:  all hierarchy nodes (leaves + parents) from hierarchyService
 *   - facts:      leaf-level fact rows from reportQueryBuilder
 *   - loadIds:    the full set of loadIds in the report (to initialise null columns)
 * Returns flat ReportRow[] in DFS order, ragged empty rows suppressed.
 */
export function aggregateReport(
  hierarchy: HierarchyNode[],
  facts: FactLeafRow[],
  loadIds: number[],
  syntheticNodes: HierarchyNode[] = [],
  adjustedKeys: Set<string> = new Set(),
): ReportRow[] {
  // Merge synthetic nodes into hierarchy
  const allNodes = [...hierarchy, ...syntheticNodes];

  // ── Step 1: Build maps ────────────────────────────────────────────────────
  const nodeMap = new Map<string, TreeNode>();

  for (const node of allNodes) {
    nodeMap.set(node.rclAccountKey, {
      node,
      values:   Object.fromEntries(loadIds.map((id) => [String(id), null])),
      versions: Object.fromEntries(loadIds.map((id) => [String(id), 1])),
      children: [],
    });
  }

  // ── Step 2: Populate leaf values from facts ───────────────────────────────
  for (const fact of facts) {
    const treeNode = nodeMap.get(fact.rclAccountKey);
    if (!treeNode) continue;
    treeNode.values[String(fact.loadId)]   = fact.amount;
    treeNode.versions[String(fact.loadId)] = fact.version;
  }

  // ── Step 3: Wire parent-child links ──────────────────────────────────────
  const roots: TreeNode[] = [];
  for (const treeNode of nodeMap.values()) {
    const parentKey = treeNode.node.parentRclKey;
    if (parentKey) {
      const parent = nodeMap.get(parentKey);
      if (parent) {
        parent.children.push(treeNode);
      }
    } else {
      roots.push(treeNode);
    }
  }

  // Sort children by inLevelOrder
  for (const treeNode of nodeMap.values()) {
    treeNode.children.sort((a, b) => a.node.inLevelOrder - b.node.inLevelOrder);
  }

  // Sort roots too
  roots.sort((a, b) => a.node.inLevelOrder - b.node.inLevelOrder);

  // ── Step 4: Bottom-up aggregation ─────────────────────────────────────────
  function aggregateNode(treeNode: TreeNode): void {
    for (const child of treeNode.children) {
      aggregateNode(child);
    }

    if (!treeNode.node.isLeaf) {
      // Sum children into this parent
      for (const loadIdStr of Object.keys(treeNode.values)) {
        let sum: number | null = null;
        for (const child of treeNode.children) {
          const childVal = child.values[loadIdStr];
          if (childVal !== null && childVal !== undefined) {
            sum = (sum ?? 0) + childVal;
          }
        }
        treeNode.values[loadIdStr] = sum;
      }
    }
  }

  for (const root of roots) {
    aggregateNode(root);
  }

  // ── Step 5: DFS traversal → flat rows, suppress empty ragged nodes ────────
  const result: ReportRow[] = [];

  function hasAnyValue(treeNode: TreeNode): boolean {
    return Object.values(treeNode.values).some((v) => v !== null);
  }

  function visit(treeNode: TreeNode): void {
    // Suppress if no values at all across any loadId (ragged suppression F09)
    if (!hasAnyValue(treeNode)) return;

    // Build hasAdjustments map: only meaningful on leaf rows
    const hasAdjustments: Record<string, boolean> = {};
    if (treeNode.node.isLeaf) {
      for (const id of loadIds) {
        if (adjustedKeys.has(`${treeNode.node.rclAccountKey}||${id}`)) {
          hasAdjustments[String(id)] = true;
        }
      }
    }

    result.push({
      rclAccountKey:  treeNode.node.rclAccountKey,
      parentRclKey:   treeNode.node.parentRclKey,
      dataPath:       treeNode.node.dataPath,
      label:          treeNode.node.label,
      level:          treeNode.node.level,
      isLeaf:         treeNode.node.isLeaf,
      isSynthetic:    syntheticNodes.some((s) => s.rclAccountKey === treeNode.node.rclAccountKey),
      plis:           treeNode.node.plis,
      values:         { ...treeNode.values },
      versions:       { ...treeNode.versions },
      hasAdjustments,
    });

    for (const child of treeNode.children) {
      visit(child);
    }
  }

  for (const root of roots) {
    visit(root);
  }

  return result;
}
