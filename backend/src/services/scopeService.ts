import { dbAll } from '../config/dbHelpers';
import { Scope, AdjLevel } from '../models/dimension.models';

interface ScopeRow { ScopeId: number; ScopeOfConsolidation: string; Scope: string; }
interface AdjLevelRow {
  AdjLevelId: number; AdjLevel: string; AdjLevelDSC: string;
  AdjGroup: string; AdjGroupType: string;
}

export async function getAllScopes(): Promise<Scope[]> {
  const rows = await dbAll<ScopeRow>(
    'SELECT ScopeId, ScopeOfConsolidation, Scope FROM tCFS_ScopeOfConsolidation ORDER BY ScopeOfConsolidation'
  );
  return rows.map((r) => ({
    scopeId:          r.ScopeId,
    scopeCode:        r.ScopeOfConsolidation,
    scopeDescription: r.Scope,
  }));
}

export async function getAdjLevelsForScope(scopeId: number): Promise<AdjLevel[]> {
  const rows = await dbAll<AdjLevelRow>(
    `SELECT a.AdjLevelId, a.AdjLevel, a.AdjLevelDSC,
            a.AdjGroup, a.AdjGroupType
     FROM   vCFS_AdjLevelHierarchy a
     JOIN   tCFS_Mapping_AdjLevel_ScopeId m ON m.AdjLevelId = a.AdjLevelId
     WHERE  m.ScopeId = ?
     ORDER  BY a.AdjGroupType, a.AdjLevelId`,
    scopeId
  );
  return rows.map((r) => ({
    adjLevelId:          r.AdjLevelId,
    adjLevelCode:        r.AdjLevelDSC,
    adjLevelDescription: r.AdjLevel,
    adjGroupId:          0,
    adjGroupDescription: r.AdjGroup,
  }));
}
