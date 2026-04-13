/**
 * Configurator Routes — tutte le operazioni del Report Configurator.
 * Richiede JWT valido [V2]. Input validation prima di delegare ai servizi [V6].
 * V2: getUserId usa req.user!.sub; tutti i mutating endpoints restituiscono
 *     l'oggetto completo per evitare round-trip extra dal client.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import * as cfg from '../services/configuratorService';
import * as audit from '../services/configAuditService';
import * as taskSvc from '../services/taskService';
import * as dimTable from '../services/dimTableService';
import * as snapshotSvc from '../services/snapshotService';

const router = Router();
router.use(authJwt);

function uid(req: Request): string { return req.user!.sub; }
function intParam(s: string | undefined): number { return parseInt(s ?? '0', 10); }

// ── Reports ───────────────────────────────────────────────────────────────────

router.get('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await cfg.listReports(uid(req))); } catch (e) { next(e); }
});

router.get('/reports/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    if (!id) { res.status(400).json({ error: 'Invalid reportId' }); return; }
    const r = await cfg.getReport(id);
    if (!r) { res.status(404).json({ error: 'Report not found' }); return; }
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportCode, reportLabel } = req.body;
    if (!reportCode || typeof reportCode !== 'string' || !reportCode.trim()) {
      res.status(400).json({ error: 'reportCode is required' }); return;
    }
    if (!reportLabel || typeof reportLabel !== 'string' || !reportLabel.trim()) {
      res.status(400).json({ error: 'reportLabel is required' }); return;
    }
    const id = await cfg.createReport(req.body, uid(req));
    res.status(201).json(await cfg.getReport(id));
  } catch (e) { next(e); }
});

router.patch('/reports/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    if (!id) { res.status(400).json({ error: 'Invalid reportId' }); return; }
    await cfg.updateReport(id, req.body, uid(req));
    res.json(await cfg.getReport(id));
  } catch (e) { next(e); }
});

// ── Tracking toggle ───────────────────────────────────────────────────────────
// PUT /reports/:id/tracking — { enabled: boolean }

router.put('/reports/:id/tracking', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    if (!id) { res.status(400).json({ error: 'Invalid reportId' }); return; }
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' }); return;
    }
    await cfg.setReportTracking(id, enabled, uid(req));
    res.json(await cfg.getReport(id));
  } catch (e) { next(e); }
});

router.post('/reports/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    await cfg.publishReport(id, uid(req));
    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Duplicate data model ───────────────────────────────────────────────────────

router.post('/reports/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    const newId = await cfg.duplicateReport(id, uid(req));
    res.status(201).json(await cfg.getReport(newId));
  } catch (e) { next(e); }
});

router.post('/reports/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    await cfg.archiveReport(id, uid(req));
    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Dataset Binding ────────────────────────────────────────────────────────────

router.get('/reports/:id/binding', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    res.json(await cfg.getDatasetBinding(id) ?? null);
  } catch (e) { next(e); }
});

router.put('/reports/:id/binding', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    const { factTable } = req.body;
    if (!factTable || typeof factTable !== 'string') {
      res.status(400).json({ error: 'factTable is required' }); return;
    }
    await cfg.upsertDatasetBinding(id, req.body, uid(req));
    res.json(await cfg.getDatasetBinding(id));
  } catch (e) { next(e); }
});

// ── Rows ──────────────────────────────────────────────────────────────────────

router.get('/reports/:id/rows', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await cfg.getRows(intParam(req.params['id']))); } catch (e) { next(e); }
});

router.post('/reports/:id/rows', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    const { rowCode, label } = req.body;
    if (!rowCode || !label) { res.status(400).json({ error: 'rowCode and label are required' }); return; }
    const rowId = await cfg.upsertRow(reportId, req.body, uid(req));
    res.status(201).json(await cfg.getRowById(rowId));
  } catch (e) { next(e); }
});

router.put('/reports/:id/rows/:rowId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    const rowId = intParam(req.params['rowId']);
    if (!req.body.rowCode || !req.body.label) {
      res.status(400).json({ error: 'rowCode and label are required' }); return;
    }
    await cfg.upsertRow(reportId, req.body, uid(req));
    res.json(await cfg.getRowById(rowId));
  } catch (e) { next(e); }
});

router.delete('/reports/:id/rows/:rowId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await cfg.deleteRow(intParam(req.params['rowId']));
    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Columns ───────────────────────────────────────────────────────────────────

router.get('/reports/:id/columns', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await cfg.getColumns(intParam(req.params['id']))); } catch (e) { next(e); }
});

router.post('/reports/:id/columns', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    const { columnCode, label } = req.body;
    if (!columnCode || !label) { res.status(400).json({ error: 'columnCode and label are required' }); return; }
    const columnId = await cfg.upsertColumn(reportId, req.body);
    res.status(201).json(await cfg.getColumnById(columnId));
  } catch (e) { next(e); }
});

router.put('/reports/:id/columns/:columnId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    const columnId = intParam(req.params['columnId']);
    if (!req.body.columnCode || !req.body.label) {
      res.status(400).json({ error: 'columnCode and label are required' }); return;
    }
    await cfg.upsertColumn(reportId, req.body);
    res.json(await cfg.getColumnById(columnId));
  } catch (e) { next(e); }
});

router.delete('/reports/:id/columns/:columnId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await cfg.deleteColumn(intParam(req.params['columnId']));
    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Filters ───────────────────────────────────────────────────────────────────

router.get('/reports/:id/filters', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await cfg.getFilters(intParam(req.params['id']))); } catch (e) { next(e); }
});

router.post('/reports/:id/filters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    const { filterCode, label, dimensionName } = req.body;
    if (!filterCode || !label || !dimensionName) {
      res.status(400).json({ error: 'filterCode, label, dimensionName are required' }); return;
    }
    const filterId = await cfg.upsertFilter(reportId, req.body, uid(req));
    res.status(201).json(await cfg.getFilterById(filterId));
  } catch (e) { next(e); }
});

router.put('/reports/:id/filters/:filterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    const filterId = intParam(req.params['filterId']);
    if (!req.body.filterCode || !req.body.label || !req.body.dimensionName) {
      res.status(400).json({ error: 'filterCode, label, dimensionName are required' }); return;
    }
    await cfg.upsertFilter(reportId, req.body, uid(req));
    res.json(await cfg.getFilterById(filterId));
  } catch (e) { next(e); }
});

router.delete('/reports/:id/filters/:filterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await cfg.deleteFilter(intParam(req.params['filterId']));
    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Sections ──────────────────────────────────────────────────────────────────

router.get('/reports/:id/sections', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await cfg.getSections(intParam(req.params['id']))); } catch (e) { next(e); }
});

router.post('/reports/:id/sections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    const { sectionCode, label } = req.body;
    if (!sectionCode || !label) { res.status(400).json({ error: 'sectionCode and label are required' }); return; }
    const sectionId = await cfg.upsertSection(reportId, req.body, uid(req));
    res.status(201).json(await cfg.getSectionById(sectionId));
  } catch (e) { next(e); }
});

router.put('/reports/:id/sections/:sectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    const sectionId = intParam(req.params['sectionId']);
    if (!req.body.sectionCode || !req.body.label) {
      res.status(400).json({ error: 'sectionCode and label are required' }); return;
    }
    await cfg.upsertSection(reportId, req.body, uid(req));
    res.json(await cfg.getSectionById(sectionId));
  } catch (e) { next(e); }
});

router.delete('/reports/:id/sections/:sectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await cfg.deleteSection(intParam(req.params['sectionId']));
    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Layout ────────────────────────────────────────────────────────────────────

router.get('/reports/:id/layout', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await cfg.getLayout(intParam(req.params['id'])) ?? null); } catch (e) { next(e); }
});

router.put('/reports/:id/layout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = intParam(req.params['id']);
    await cfg.upsertLayout(id, req.body, uid(req));
    res.json(await cfg.getLayout(id));
  } catch (e) { next(e); }
});

// ── DB Explorer ───────────────────────────────────────────────────────────────

router.get('/db/tables', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await cfg.listDbTables()); } catch (e) { next(e); }
});

router.get('/db/tables/:schema/:table/columns', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { schema, table } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(schema ?? '') || !/^[a-zA-Z0-9_]+$/.test(table ?? '')) {
      res.status(400).json({ error: 'Invalid schema or table name' }); return;
    }
    res.json(await cfg.getTableColumns(schema, table));
  } catch (e) { next(e); }
});

// ── Tasks (Publish step) ──────────────────────────────────────────────────────

router.get('/tasks/:taskId/snapshot/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = intParam(req.params['taskId']);
    if (!taskId) { res.status(400).json({ error: 'Invalid taskId' }); return; }
    const snap = await snapshotSvc.getActiveSnapshot(taskId);
    if (!snap) { res.status(404).json({ error: 'No active snapshot for this task' }); return; }
    res.json(snap);
  } catch (e) { next(e); }
});

router.get('/reports/:id/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    if (!reportId) { res.status(400).json({ error: 'Invalid reportId' }); return; }
    const tasks = await taskSvc.listTasks({ reportId });
    res.json(tasks);
  } catch (e) { next(e); }
});

router.post('/reports/:id/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    if (!reportId) { res.status(400).json({ error: 'Invalid reportId' }); return; }
    const { label } = req.body;
    if (!label || typeof label !== 'string' || !label.trim()) {
      res.status(400).json({ error: 'label is required' }); return;
    }
    // Auto-generate a taskCode from label if not provided
    const taskCode = req.body.taskCode
      || label.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 50);
    const taskId = await taskSvc.createTask({ ...req.body, taskCode, reportId }, uid(req));
    const created = await taskSvc.getTask(taskId);
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.put('/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = intParam(req.params['taskId']);
    if (!taskId) { res.status(400).json({ error: 'Invalid taskId' }); return; }
    await taskSvc.updateTask(taskId, req.body, uid(req));
    res.json(await taskSvc.getTask(taskId));
  } catch (e) { next(e); }
});

router.post('/tasks/:taskId/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = intParam(req.params['taskId']);
    if (!taskId) { res.status(400).json({ error: 'Invalid taskId' }); return; }
    // Use activateTask (not updateTask) so snapshot creation and menu registration are triggered.
    await taskSvc.activateTask(taskId, uid(req));
    res.status(204).send();
  } catch (e) { next(e); }
});

router.post('/tasks/:taskId/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = intParam(req.params['taskId']);
    if (!taskId) { res.status(400).json({ error: 'Invalid taskId' }); return; }
    // Use archiveTask (not updateTask) so menu revocation is triggered.
    await taskSvc.archiveTask(taskId, uid(req));
    res.status(204).send();
  } catch (e) { next(e); }
});

router.post('/tasks/:taskId/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = intParam(req.params['taskId']);
    if (!taskId) { res.status(400).json({ error: 'Invalid taskId' }); return; }
    const newTaskId = await taskSvc.duplicateTask(taskId, uid(req));
    const task = await taskSvc.getTask(newTaskId);
    res.status(201).json(task);
  } catch (e) { next(e); }
});

router.delete('/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = intParam(req.params['taskId']);
    if (!taskId) { res.status(400).json({ error: 'Invalid taskId' }); return; }
    await taskSvc.deleteTask(taskId, uid(req));
    res.status(204).send();
  } catch (e: unknown) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404) { res.status(404).json({ error: (e as Error).message }); return; }
    next(e);
  }
});

// POST /tasks/:taskId/repair ───────────────────────────────────────────────────
// Non-destructive repair for Active tasks created under the broken route that
// had no snapshot and/or no registered MESA navigation item. Safe to call
// repeatedly. Returns a structured result describing exactly what was done.
router.post('/tasks/:taskId/repair', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = intParam(req.params['taskId']);
    if (!taskId) { res.status(400).json({ error: 'Invalid taskId' }); return; }
    const result = await taskSvc.repairTask(taskId, uid(req));
    res.json(result);
  } catch (e: unknown) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404) { res.status(404).json({ error: (e as Error).message }); return; }
    if (code === 400) { res.status(400).json({ error: (e as Error).message }); return; }
    next(e);
  }
});

// ── Menu tree ─────────────────────────────────────────────────────────────────

router.get('/menu-tree', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Call the MESA host navigation API (SQLite-backed, separate service on port 7001)
    const mesappaBase = (process.env['MESAPPA_HOST_URL'] ?? 'http://localhost:7001').replace(/\/$/, '');
    const treeUrl = `${mesappaBase}/api/admin/navigation/tree`;
    const r = await fetch(treeUrl, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!r || !r.ok) { res.json([]); return; }
    const tree = await r.json();
    // Normalise: MESA uses { menuKey, label, children } — map to { code, label, children }
    function normalise(node: any): any {
      return { code: node.menuKey ?? node.code, label: node.label, children: (node.children ?? []).map(normalise) };
    }
    res.json(Array.isArray(tree) ? tree.map(normalise) : []);
  } catch (e) { next(e); }
});

router.post('/menu-items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, label } = req.body;
    if (!code || !label) { res.status(400).json({ error: 'code and label are required' }); return; }
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

// ── Dim Table Direct CRUD ─────────────────────────────────────────────────────

router.get('/dim-table/:schema/:table/rows',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await dimTable.getDimTableRows(req.params['schema']!, req.params['table']!));
    } catch (e) { next(e); }
  },
);

router.post('/dim-table/:schema/:table/rows',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { values } = req.body as { values?: Record<string, string | null> };
      if (!values || typeof values !== 'object') {
        res.status(400).json({ error: 'values is required' }); return;
      }
      await dimTable.insertDimTableRow(req.params['schema']!, req.params['table']!, values);
      res.status(201).json({ ok: true });
    } catch (e) { next(e); }
  },
);

router.put('/dim-table/:schema/:table/rows/:pkCol/:pk',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { values } = req.body as { values?: Record<string, string | null> };
      if (!values || typeof values !== 'object') {
        res.status(400).json({ error: 'values is required' }); return;
      }
      await dimTable.updateDimTableRow(
        req.params['schema']!, req.params['table']!,
        req.params['pkCol']!,  req.params['pk']!,
        values,
      );
      res.json({ ok: true });
    } catch (e) { next(e); }
  },
);

router.delete('/dim-table/:schema/:table/rows/:pkCol/:pk',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await dimTable.deleteDimTableRow(
        req.params['schema']!, req.params['table']!,
        req.params['pkCol']!,  req.params['pk']!,
      );
      res.status(204).send();
    } catch (e) { next(e); }
  },
);

// ── Audit ─────────────────────────────────────────────────────────────────────

router.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportId, eventType, changedBy, limit } = req.query;
    res.json(await audit.getAuditLog({
      reportId:  reportId  ? intParam(String(reportId))  : undefined,
      eventType: eventType ? String(eventType)            : undefined,
      changedBy: changedBy ? String(changedBy)            : undefined,
      limit:     limit     ? intParam(String(limit))      : 100,
    }));
  } catch (e) { next(e); }
});

export default router;
