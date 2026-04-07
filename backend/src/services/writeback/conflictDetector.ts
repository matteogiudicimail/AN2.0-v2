/**
 * Conflict Detector — checks if the row version the client holds is still current.
 * Implements optimistic locking (Version field).
 */
import { dbGet } from '../../config/dbHelpers';
import { ConflictInfo } from '../../models/writeback.models';

interface DeltaVersionRow {
  DeltaId:     number;
  Version:     number;
  DeltaValue:  number;
  UpdatedBy:   string | null;
  UpdatedAt:   string | null;
  CreatedBy:   string;
  CreatedAt:   string;
}

export async function detectConflict(
  rclAccountKey: string,
  loadId: number,
  entityId: number,
  currencyId: number,
  adjLevelId: number,
  currentVersion: number,
  yourValue: number,
): Promise<ConflictInfo | null> {

  const row = await dbGet<DeltaVersionRow>(
    `SELECT TOP 1 DeltaId, Version, DeltaValue, UpdatedBy, UpdatedAt, CreatedBy, CreatedAt
     FROM app_Delta
     WHERE RclAccountKey = ?
       AND LoadId = ?
       AND EntityId = ?
       AND CurrencyId = ?
       AND AdjLevelId = ?
       AND IsActive = 1
     ORDER BY DeltaId DESC`,
    rclAccountKey, loadId, entityId, currencyId, adjLevelId
  );

  if (!row) return null;
  if (row.Version <= currentVersion) return null;

  return {
    yourValue,
    serverValue: row.DeltaValue,
    modifiedBy:  row.UpdatedBy ?? row.CreatedBy,
    modifiedAt:  row.UpdatedAt ?? row.CreatedAt,
  };
}
