/**
 * Permission Service — manages entity-level RBAC. [F14, OWASP A01]
 * Roles: Viewer | Editor | Approver | Admin
 */
import { dbAll, dbGet } from '../config/dbHelpers';
import { getPool } from '../config/db';

export interface UserPermission {
  userId:     string;
  entityId:   number;
  entityCode: string;
  entityName: string;
  role:       'Viewer' | 'Editor' | 'Approver' | 'Admin';
}

interface PermRow {
  UserId:     string;
  EntityId:   number;
  EntityCode: string;
  Entity:     string;
  Role:       string;
}

const VALID_ROLES = ['Viewer', 'Editor', 'Approver', 'Admin'] as const;
type Role = typeof VALID_ROLES[number];

export async function getUserPermissions(userId: string): Promise<UserPermission[]> {
  if (!userId) return [];
  const rows = await dbAll<PermRow>(
    `SELECT p.UserId, p.EntityId, e.EntityCode, e.Entity, p.Role
     FROM   app_UserPermission p
     JOIN   tCFS_Entity e ON e.EntityId = p.EntityId
     WHERE  p.UserId = ?
     ORDER  BY e.EntityCode`,
    userId
  );
  return rows.map((r) => ({
    userId:     r.UserId,
    entityId:   r.EntityId,
    entityCode: r.EntityCode,
    entityName: r.Entity,
    role:       r.Role as Role,
  }));
}

export async function getAllPermissions(): Promise<UserPermission[]> {
  const rows = await dbAll<PermRow>(
    `SELECT p.UserId, p.EntityId, e.EntityCode, e.Entity, p.Role
     FROM   app_UserPermission p
     JOIN   tCFS_Entity e ON e.EntityId = p.EntityId
     ORDER  BY p.UserId, e.EntityCode`
  );
  return rows.map((r) => ({
    userId:     r.UserId,
    entityId:   r.EntityId,
    entityCode: r.EntityCode,
    entityName: r.Entity,
    role:       r.Role as Role,
  }));
}

export async function getUserRole(userId: string, entityId: number): Promise<Role | null> {
  const row = await dbGet<{ Role: string }>(
    'SELECT TOP 1 Role FROM app_UserPermission WHERE UserId=? AND EntityId=?',
    userId, entityId
  );
  return (row?.Role as Role) ?? null;
}

export async function setPermission(userId: string, entityId: number, role: Role, grantedBy = 'system'): Promise<void> {
  if (!VALID_ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role: ${role}`), { status: 400 });
  }
  const pool = await getPool();
  const now = new Date().toISOString();
  await pool.request()
    .input('userId', userId)
    .input('entityId', entityId)
    .input('role', role)
    .input('grantedBy', grantedBy)
    .input('now', now)
    .query(`
      MERGE dbo.app_UserPermission AS T
      USING (SELECT @userId AS UserId, @entityId AS EntityId) AS S
        ON T.UserId = S.UserId AND T.EntityId = S.EntityId
      WHEN MATCHED THEN
        UPDATE SET Role=@role, GrantedBy=@grantedBy, GrantedAt=@now
      WHEN NOT MATCHED THEN
        INSERT (UserId, EntityId, Role, GrantedBy, GrantedAt)
        VALUES (@userId, @entityId, @role, @grantedBy, @now);
    `);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const row = await dbGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM app_UserPermission WHERE UserId=? AND Role='Admin'`,
    userId
  );
  return (row?.n ?? 0) > 0;
}
