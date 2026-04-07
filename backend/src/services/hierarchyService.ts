/**
 * Hierarchy Service — carica l'albero di riclassificazione da vCFS_ReclassificationHierarchy.
 *
 * Colonne reali nel DB Azure:
 *   FolderChildKey, FolderFatherKey, Folder, Folder_Code, InLevelOrder, HierarchyMasterLever
 *
 * Tabelle non presenti: vCFS_Reclassification_SourceType, app_SyntheticRclMember, app_Delta
 */
import { dbAll } from '../config/dbHelpers';

export interface HierarchyNode {
  rclAccountKey:  string;
  parentRclKey:   string | null;
  label:          string;
  level:          number;
  isLeaf:         boolean;
  inLevelOrder:   number;
  dataPath:       string[];
  plis:           number;
}

interface HierarchyRow {
  FolderChildKey:      string;
  FolderFatherKey:     string | null;
  Folder:              string;
  InLevelOrder:        number;
  HierarchyMasterLever: number;
}

/**
 * Returns HierarchyNode entries for synthetic aggregate-writeback nodes.
 * A synthetic node is visible in the report only if it has at least one
 * active delta for the current entity/load combination.
 *
 * Requires the full hierarchy to build correct dataPath (parent path + syntheticKey).
 */
export async function getSyntheticNodes(
  entityIds: number[],
  loadIds: number[],
  hierarchy: HierarchyNode[],
): Promise<HierarchyNode[]> {
  if (!entityIds.length || !loadIds.length) return [];

  const entityPh = entityIds.map(() => '?').join(',');
  const loadPh   = loadIds.map(() => '?').join(',');

  // Only include synthetic members that have at least one active delta in scope
  const rows = await dbAll<{ SyntheticKey: string; ParentRclKey: string; Label: string }>(
    `SELECT DISTINCT s.SyntheticKey, s.ParentRclKey, s.Label
     FROM app_SyntheticRclMember s
     WHERE EXISTS (
       SELECT 1 FROM app_Delta d
       WHERE d.RclAccountKey = s.SyntheticKey
         AND d.EntityId IN (${entityPh})
         AND d.LoadId   IN (${loadPh})
         AND d.IsActive = 1
     )`,
    ...entityIds, ...loadIds,
  );

  if (!rows.length) return [];

  // Build parent-path lookup from the natural hierarchy
  const pathMap = new Map<string, string[]>(
    hierarchy.map((n) => [n.rclAccountKey, n.dataPath]),
  );

  return rows.map((r): HierarchyNode => {
    const parentPath = pathMap.get(r.ParentRclKey) ?? [r.ParentRclKey];
    return {
      rclAccountKey: r.SyntheticKey,
      parentRclKey:  r.ParentRclKey,
      label:         r.Label,
      level:         parentPath.length + 1,
      isLeaf:        true,
      inLevelOrder:  9999,   // always rendered after natural children
      dataPath:      [...parentPath, r.SyntheticKey],
      plis:          0,
    };
  });
}

export async function getReclassificationHierarchy(): Promise<HierarchyNode[]> {
  const rows = await dbAll<HierarchyRow>(`
    SELECT FolderChildKey, FolderFatherKey, Folder, InLevelOrder, HierarchyMasterLever
    FROM   vCFS_ReclassificationHierarchy
    ORDER  BY HierarchyMasterLever, InLevelOrder
  `);

  // Nodi che compaiono come padre di qualcuno → non sono foglie
  const parentKeys = new Set(
    rows.map((r) => r.FolderFatherKey).filter((k): k is string => k != null)
  );

  // Mappa child → parent per ricostruire il path
  const childToParent = new Map<string, string>();
  for (const r of rows) {
    if (r.FolderFatherKey) {
      childToParent.set(r.FolderChildKey, r.FolderFatherKey);
    }
  }

  function buildPath(key: string): string[] {
    const path: string[] = [];
    let current: string | undefined = key;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      path.unshift(current);
      visited.add(current);
      current = childToParent.get(current);
    }
    return path;
  }

  return rows.map((r): HierarchyNode => ({
    rclAccountKey: r.FolderChildKey,
    parentRclKey:  r.FolderFatherKey ?? null,
    label:         r.Folder,
    level:         r.HierarchyMasterLever,
    isLeaf:        !parentKeys.has(r.FolderChildKey),
    inLevelOrder:  r.InLevelOrder,
    dataPath:      buildPath(r.FolderChildKey),
    plis:          0, // vCFS_Reclassification_SourceType non disponibile
  }));
}
