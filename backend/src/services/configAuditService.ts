/**
 * Config Audit Service — traccia eventi del configuratore e dei task.
 */
import { dbAll, dbRun } from '../config/dbHelpers';
import { ConfigAuditEntry } from '../models/configurator.models';

export async function logConfigEvent(
  eventType: string,
  entityType: string,
  entityId: string | null,
  reportId: number | null,
  oldSnapshot: unknown,
  newSnapshot: unknown,
  changedBy: string,
  taskId?: number,
  notes?: string,
): Promise<void> {
  await dbRun(
    `INSERT INTO cfg_ConfigAudit
       (EventType, EntityType, EntityId, ReportId, TaskId, OldSnapshot, NewSnapshot, ChangedBy, ChangedAt, Notes)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    eventType,
    entityType,
    entityId,
    reportId ?? null,
    taskId ?? null,
    oldSnapshot ? JSON.stringify(oldSnapshot) : null,
    newSnapshot ? JSON.stringify(newSnapshot) : null,
    changedBy,
    new Date().toISOString(),
    notes ?? null,
  );
}

export async function getAuditLog(options: {
  reportId?: number;
  taskId?: number;
  eventType?: string;
  changedBy?: string;
  limit?: number;
}): Promise<ConfigAuditEntry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.reportId  !== undefined) { conditions.push('ReportId=?');  params.push(options.reportId); }
  if (options.taskId    !== undefined) { conditions.push('TaskId=?');    params.push(options.taskId); }
  if (options.eventType !== undefined) { conditions.push('EventType=?'); params.push(options.eventType); }
  if (options.changedBy !== undefined) { conditions.push('ChangedBy=?'); params.push(options.changedBy); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const top   = options.limit ? `TOP ${Math.min(options.limit, 500)}` : 'TOP 200';

  const rows = await dbAll<{
    AuditId: number; EventType: string; EntityType: string; EntityId: string | null;
    ReportId: number | null; TaskId: number | null;
    OldSnapshot: string | null; NewSnapshot: string | null;
    ChangedBy: string; ChangedAt: string; Notes: string | null;
  }>(
    `SELECT ${top} AuditId, EventType, EntityType, EntityId, ReportId, TaskId,
            OldSnapshot, NewSnapshot, ChangedBy, ChangedAt, Notes
     FROM cfg_ConfigAudit
     ${where}
     ORDER BY ChangedAt DESC`,
    ...params
  );

  return rows.map((r) => ({
    auditId:     r.AuditId,
    eventType:   r.EventType,
    entityType:  r.EntityType,
    entityId:    r.EntityId,
    reportId:    r.ReportId,
    taskId:      r.TaskId,
    oldSnapshot: r.OldSnapshot ? JSON.parse(r.OldSnapshot) : null,
    newSnapshot: r.NewSnapshot ? JSON.parse(r.NewSnapshot) : null,
    changedBy:   r.ChangedBy,
    changedAt:   r.ChangedAt,
    notes:       r.Notes,
  }));
}
