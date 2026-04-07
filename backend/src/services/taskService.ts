/**
 * Task Service — gestisce i task e il sistema Seaside.
 */
import { dbAll, dbGet, dbRun, dbInsertGetId } from '../config/dbHelpers';
import { TaskDef, CreateTaskDto, UpdateTaskDto } from '../models/configurator.models';
import { logConfigEvent } from './configAuditService';
import * as mesappaMenu from './mesappaMenuService';
import { createSnapshot, getActiveSnapshot } from './snapshotService';

type TaskRow = {
  TaskId: number; TaskCode: string; Label: string; Description: string | null;
  ReportId: number; ReportVersion: number; Status: string;
  WritebackMode: string | null; ContextFilters: string | null;
  RouteUrl: string | null; MenuItemCode: string | null; ParentMenuCode: string | null;
  AllowedRoles: string | null; AllowedEntities: string | null;
  CreatedBy: string; CreatedAt: string;
  ReportDomain: string | null;
};

function mapTask(r: TaskRow): TaskDef {
  return {
    taskId:          r.TaskId,
    taskCode:        r.TaskCode,
    label:           r.Label,
    description:     r.Description,
    reportId:        r.ReportId,
    reportVersion:   r.ReportVersion,
    status:          r.Status as TaskDef['status'],
    writebackMode:   r.WritebackMode as TaskDef['writebackMode'],
    contextFilters:  r.ContextFilters  ? JSON.parse(r.ContextFilters)  : null,
    routeUrl:        r.RouteUrl,
    menuItemCode:    r.MenuItemCode,
    parentMenuCode:  r.ParentMenuCode ?? null,
    allowedRoles:    r.AllowedRoles,
    allowedEntities: r.AllowedEntities ? JSON.parse(r.AllowedEntities) : null,
    createdBy:       r.CreatedBy,
    createdAt:       r.CreatedAt,
    reportDomain:    r.ReportDomain ?? null,
  };
}

export async function listTasks(options?: {
  status?: string; reportId?: number; domain?: string;
}): Promise<TaskDef[]> {
  const conditions: string[] = ['t.IsActive=1'];
  const params: unknown[] = [];
  if (options?.status)   { conditions.push('t.Status=?');   params.push(options.status); }
  if (options?.reportId) { conditions.push('t.ReportId=?'); params.push(options.reportId); }
  if (options?.domain)   { conditions.push('r.Domain=?');   params.push(options.domain); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await dbAll<TaskRow>(
    `SELECT t.TaskId, t.TaskCode, t.Label, t.Description, t.ReportId, t.ReportVersion, t.Status,
            t.WritebackMode, t.ContextFilters, t.RouteUrl, t.MenuItemCode, t.ParentMenuCode,
            t.AllowedRoles, t.AllowedEntities, t.CreatedBy, t.CreatedAt,
            r.Domain AS ReportDomain
       FROM cfg_Task t
  LEFT JOIN cfg_Report r ON r.ReportId = t.ReportId
     ${where} ORDER BY t.CreatedAt DESC`,
    ...params
  );
  return rows.map(mapTask);
}

export async function getTask(taskId: number): Promise<TaskDef | null> {
  const row = await dbGet<Parameters<typeof mapTask>[0]>(
    `SELECT TOP 1 TaskId, TaskCode, Label, Description, ReportId, ReportVersion, Status,
            WritebackMode, ContextFilters, RouteUrl, MenuItemCode, ParentMenuCode,
            AllowedRoles, AllowedEntities, CreatedBy, CreatedAt
     FROM cfg_Task WHERE TaskId=?`,
    taskId
  );
  return row ? mapTask(row) : null;
}

export async function createTask(dto: CreateTaskDto, userId: string): Promise<number> {
  const now = new Date().toISOString();
  // ParentMenuCode is excluded from the base INSERT for backward-compatibility with
  // deployments where the migration (010_snapshot.sql) has not yet been applied.
  const taskId = await dbInsertGetId(
    `INSERT INTO cfg_Task
       (TaskCode, Label, Description, ReportId, ReportVersion, Status,
        WritebackMode, ContextFilters, RouteUrl, MenuItemCode,
        AllowedRoles, AllowedEntities, CreatedBy, CreatedAt, IsActive)
     VALUES (?,?,?,?,?,'Draft',?,?,?,?,?,?,?,?,1)`,
    dto.taskCode, dto.label, dto.description ?? null,
    dto.reportId, dto.reportVersion ?? 1,
    dto.writebackMode ?? null,
    dto.contextFilters  ? JSON.stringify(dto.contextFilters)  : null,
    dto.routeUrl        ?? null,
    dto.menuItemCode    ?? null,
    dto.allowedRoles    ?? null,
    dto.allowedEntities ? JSON.stringify(dto.allowedEntities) : null,
    userId, now
  );

  // Set ParentMenuCode separately so the INSERT above succeeds even before migration.
  if (dto.parentMenuCode) {
    try {
      await dbRun(`UPDATE cfg_Task SET ParentMenuCode = ? WHERE TaskId = ?`, dto.parentMenuCode, taskId);
    } catch { /* column not yet migrated — parentMenuCode will take effect after 010_snapshot.sql */ }
  }

  await logConfigEvent('TaskCreated', 'Task', String(taskId), dto.reportId, null, dto, userId, taskId);
  return taskId;
}

export async function updateTask(taskId: number, dto: UpdateTaskDto, userId: string): Promise<void> {
  const old = await getTask(taskId);
  const now = new Date().toISOString();

  const fields: string[] = [];
  const params: unknown[] = [];

  if (dto.label          !== undefined) { fields.push('Label=?');          params.push(dto.label); }
  if (dto.description    !== undefined) { fields.push('Description=?');    params.push(dto.description); }
  if (dto.status         !== undefined) { fields.push('Status=?');         params.push(dto.status); }
  if (dto.writebackMode  !== undefined) { fields.push('WritebackMode=?');  params.push(dto.writebackMode); }
  if (dto.contextFilters !== undefined) { fields.push('ContextFilters=?'); params.push(JSON.stringify(dto.contextFilters)); }
  if (dto.routeUrl       !== undefined) { fields.push('RouteUrl=?');       params.push(dto.routeUrl); }
  if (dto.menuItemCode   !== undefined) { fields.push('MenuItemCode=?');   params.push(dto.menuItemCode); }
  if (dto.allowedRoles   !== undefined) { fields.push('AllowedRoles=?');   params.push(dto.allowedRoles); }
  if (dto.allowedEntities  !== undefined) { fields.push('AllowedEntities=?');  params.push(JSON.stringify(dto.allowedEntities)); }
  // ParentMenuCode handled separately below for backward-compat (may not exist pre-migration).
  const pendingParentMenuCode = dto.parentMenuCode;

  if (fields.length === 0 && pendingParentMenuCode === undefined) return;

  if (fields.length > 0) {
    fields.push('UpdatedBy=?'); params.push(userId);
    fields.push('UpdatedAt=?'); params.push(now);
    params.push(taskId);
    await dbRun(`UPDATE cfg_Task SET ${fields.join(', ')} WHERE TaskId=?`, ...params);
  }

  if (pendingParentMenuCode !== undefined) {
    try {
      await dbRun(`UPDATE cfg_Task SET ParentMenuCode = ? WHERE TaskId = ?`, pendingParentMenuCode ?? null, taskId);
    } catch { /* column not yet migrated */ }
  }

  const reportId = old?.reportId ?? null;
  await logConfigEvent('TaskUpdated', 'Task', String(taskId), reportId, old, dto, userId, taskId);
}

export async function activateTask(taskId: number, userId: string): Promise<void> {
  await updateTask(taskId, { status: 'Active' }, userId);
  const task = await getTask(taskId);
  await logConfigEvent('TaskActivated', 'Task', String(taskId), task?.reportId ?? null, null, null, userId, taskId);

  if (task) {
    // Crea snapshot del layout congelato (fire-and-forget, non bloccante)
    createSnapshot(taskId, task.reportId, userId).catch((err: Error) =>
      console.error('[taskService] Errore creazione snapshot:', err.message)
    );

    // Registra la voce di menu nel sistema MESAPPA host (fire-and-forget, non bloccante)
    mesappaMenu.registerMenuItem(task).catch((err: Error) =>
      console.error('[taskService] Errore registrazione menu MESAPPA:', err.message)
    );
  }
}

export async function archiveTask(taskId: number, userId: string): Promise<void> {
  const task = await getTask(taskId);
  await updateTask(taskId, { status: 'Archived' }, userId);

  // Revoca la voce di menu nel sistema MESAPPA host (fire-and-forget, non bloccante)
  if (task?.menuItemCode) {
    mesappaMenu.revokeMenuItem(task.menuItemCode).catch((err: Error) =>
      console.error('[taskService] Errore revoca menu MESAPPA:', err.message)
    );
  }
}

// ── Repair ────────────────────────────────────────────────────────────────────

export interface TaskRepairResult {
  taskId:     number;
  taskStatus: string;
  snapshot: {
    /** Whether an active snapshot was found before the repair ran. */
    hadActiveSnapshot: boolean;
    /** Whether a new snapshot was created during this repair. */
    created:           boolean;
    /** The snapshotId now active after repair (null only if creation was skipped
     *  because the report has no entry layout or no binding configured). */
    activeSnapshotId:  number | null;
  };
  menu: {
    attempted:      boolean;
    registered:     boolean;
    alreadyExisted: boolean;
    skippedReason:  string | null;
  };
}

/**
 * Non-destructive repair for Active tasks that were activated via the broken
 * configurator route (which called updateTask instead of activateTask) and
 * therefore have no snapshot and/or no registered MESA navigation item.
 *
 * Safe to call repeatedly — snapshot creation is idempotent (replaces the
 * previously active one), menu registration checks for an existing item first.
 *
 * Throws with statusCode 404 if task does not exist.
 * Throws with statusCode 400 if task status is not 'Active'.
 */
export async function repairTask(taskId: number, userId: string): Promise<TaskRepairResult> {
  const task = await getTask(taskId);
  if (!task) {
    const e = new Error(`Task ${taskId} not found`);
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
  if (task.status !== 'Active') {
    const e = new Error(`Task ${taskId} has status "${task.status}" — repair only applies to Active tasks`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────────
  const existing = await getActiveSnapshot(taskId);
  const hadActiveSnapshot = existing !== null;
  let created = false;
  let activeSnapshotId: number | null = existing?.snapshotId ?? null;

  if (!existing) {
    // createSnapshot returns 0 when the report has no entry layout or no binding.
    const newId = await createSnapshot(taskId, task.reportId, userId);
    if (newId > 0) {
      created = true;
      activeSnapshotId = newId;
    }
    // newId === 0 → no layout/binding; not an error, result will reflect activeSnapshotId=null
  }

  // ── Menu ──────────────────────────────────────────────────────────────────────
  const menuResult = await mesappaMenu.ensureMenuItemRegistered(task);

  await logConfigEvent(
    'TaskRepaired', 'Task', String(taskId), task.reportId,
    null,
    { snapshotHadActive: hadActiveSnapshot, snapshotCreated: created, menuRegistered: menuResult.registered },
    userId, taskId,
  );

  return {
    taskId,
    taskStatus: task.status,
    snapshot: { hadActiveSnapshot, created, activeSnapshotId },
    menu: {
      attempted:      menuResult.attempted,
      registered:     menuResult.registered,
      alreadyExisted: menuResult.alreadyExisted,
      skippedReason:  menuResult.skippedReason,
    },
  };
}
