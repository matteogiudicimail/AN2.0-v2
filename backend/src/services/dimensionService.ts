import { dbAll } from '../config/dbHelpers';
import { CostCenter, CO, Counterpart } from '../models/dimension.models';

interface CCRow { DimAcc01Code: string; DimAcc01: string; }
interface CORow { DimAcc02Code: string; DimAcc02: string; }
interface CPRow  { EntityId: number; EntityCode: string; Entity: string; }

export async function getAllCostCenters(): Promise<CostCenter[]> {
  const rows = await dbAll<CCRow>(
    'SELECT DimAcc01Code, DimAcc01 FROM vCFS_AccDim01 ORDER BY DimAcc01Code'
  );
  return rows.map((r) => ({
    costCenterCode:        r.DimAcc01Code,
    costCenterDescription: r.DimAcc01,
  }));
}

export async function getAllCOs(): Promise<CO[]> {
  const rows = await dbAll<CORow>(
    'SELECT DimAcc02Code, DimAcc02 FROM tCFS_DimAcc02 ORDER BY DimAcc02Code'
  );
  return rows.map((r) => ({
    coCode:        r.DimAcc02Code,
    coDescription: r.DimAcc02,
  }));
}

export async function getAllCounterparts(): Promise<Counterpart[]> {
  const rows = await dbAll<CPRow>(
    'SELECT EntityId, EntityCode, Entity FROM tCFS_Entity ORDER BY EntityCode'
  );
  return rows.map((r) => ({
    entityId:   r.EntityId,
    entityCode: r.EntityCode,
    entityName: r.Entity,
  }));
}
