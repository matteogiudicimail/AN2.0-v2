import { dbAll, dbGet } from '../config/dbHelpers';
import { Entity } from '../models/dimension.models';

interface EntityRow {
  EntityId: number;
  EntityCode: string;
  Entity: string;
}

function mapEntity(row: EntityRow): Entity {
  return {
    entityId:             row.EntityId,
    entityCode:           row.EntityCode,
    entityName:           row.Entity,
    consolidationGroupId: null,
    countryCode:          null,
  };
}

export async function getAllEntities(): Promise<Entity[]> {
  const rows = await dbAll<EntityRow>(
    'SELECT EntityId, EntityCode, Entity FROM tCFS_Entity ORDER BY EntityCode'
  );
  return rows.map(mapEntity);
}

export async function getEntitiesForUser(_userId: string): Promise<Entity[]> {
  // app_UserPermission non presente nel DB: restituisce tutte le entità
  return getAllEntities();
}

export async function getUserRoleForEntity(userId: string, entityId: number): Promise<string | null> {
  if (!userId || !entityId) return null;
  try {
    const row = await dbGet<{ Role: string }>(
      'SELECT TOP 1 Role FROM app_UserPermission WHERE UserId = ? AND EntityId = ?',
      userId, entityId
    );
    return row?.Role ?? null;
  } catch {
    return null; // app_UserPermission non ancora creata
  }
}

export async function canWrite(userId: string, entityId: number): Promise<boolean> {
  const role = await getUserRoleForEntity(userId, entityId);
  // Se la tabella non esiste (role === null) consenti scrittura (modalità dev/no-auth)
  if (role === null) return true;
  return role === 'Editor' || role === 'Approver' || role === 'Admin';
}

export async function isAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const row = await dbGet<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM app_UserPermission WHERE UserId = ? AND Role = 'Admin'`,
      userId
    );
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false; // tabella assente → non admin di default
  }
}
