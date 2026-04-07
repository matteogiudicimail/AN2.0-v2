/**
 * Task Routes — gestione task e sistema Seaside.
 * Richiede JWT valido. [V2]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import * as taskSvc from '../services/taskService';
import { getTaskLaunchData } from '../services/configuratorService';

const router = Router();
router.use(authJwt);

function getUserId(req: Request): string { return req.user!.sub; }

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, reportId, domain } = req.query;
    const tasks = await taskSvc.listTasks({
      status:   status   ? String(status)                   : undefined,
      reportId: reportId ? parseInt(String(reportId), 10)   : undefined,
      domain:   domain   ? String(domain)                   : undefined,
    });
    res.json(tasks);
  } catch (err) { next(err); }
});

/** GET /api/tasks/:id/launch — restituisce task + definizione report unificati per avviare la griglia */
router.get('/:id/launch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'taskId must be a positive integer' }); return;
    }
    const data = await getTaskLaunchData(id);
    if (!data) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    const task = await taskSvc.getTask(id);
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(task);
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskCode, label, reportId } = req.body;
    if (!taskCode || typeof taskCode !== 'string') {
      res.status(400).json({ error: 'taskCode is required' }); return;
    }
    if (!label || typeof label !== 'string') {
      res.status(400).json({ error: 'label is required' }); return;
    }
    if (!reportId || typeof reportId !== 'number') {
      res.status(400).json({ error: 'reportId is required' }); return;
    }
    const taskId = await taskSvc.createTask(req.body, getUserId(req));
    res.status(201).json(await taskSvc.getTask(taskId));
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    await taskSvc.updateTask(id, req.body, getUserId(req));
    res.json(await taskSvc.getTask(id));
  } catch (err) { next(err); }
});

router.post('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    await taskSvc.activateTask(id, getUserId(req));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    await taskSvc.archiveTask(id, getUserId(req));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
