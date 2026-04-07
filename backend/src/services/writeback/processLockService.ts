/**
 * Process Lock Service — manages the lock/unlock of processes (F15).
 */
import { dbGet } from '../../config/dbHelpers';
import { getPool } from '../../config/db';

interface LockRow { LoadId: number; IsLocked: number; }

export async function isProcessLocked(loadId: number): Promise<boolean> {
  try {
    const row = await dbGet<LockRow>(
      'SELECT TOP 1 IsLocked FROM app_ProcessLock WHERE LoadId = ?',
      loadId
    );
    return Boolean(row?.IsLocked);
  } catch {
    return false; // app_ProcessLock non ancora creata → nessun lock
  }
}

export async function lockProcess(loadId: number, userId: string): Promise<void> {
  const pool = await getPool();
  const now = new Date().toISOString();
  await pool.request()
    .input('loadId', loadId)
    .input('userId', userId)
    .input('now', now)
    .query(`
      MERGE app_ProcessLock AS T
      USING (SELECT @loadId AS LoadId) AS S ON T.LoadId = S.LoadId
      WHEN MATCHED THEN
        UPDATE SET IsLocked=1, LockedBy=@userId, LockedAt=@now, UnlockedBy=NULL, UnlockedAt=NULL
      WHEN NOT MATCHED THEN
        INSERT (LoadId, IsLocked, LockedBy, LockedAt) VALUES (@loadId, 1, @userId, @now);
    `);
}

export async function unlockProcess(loadId: number, userId: string): Promise<void> {
  const pool = await getPool();
  const now = new Date().toISOString();
  await pool.request()
    .input('loadId', loadId)
    .input('userId', userId)
    .input('now', now)
    .query(`
      MERGE app_ProcessLock AS T
      USING (SELECT @loadId AS LoadId) AS S ON T.LoadId = S.LoadId
      WHEN MATCHED THEN
        UPDATE SET IsLocked=0, LockedBy=NULL, LockedAt=NULL, UnlockedBy=@userId, UnlockedAt=@now
      WHEN NOT MATCHED THEN
        INSERT (LoadId, IsLocked) VALUES (@loadId, 0);
    `);
}
