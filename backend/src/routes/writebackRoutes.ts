/**
 * Writeback Routes — async version (mssql)
 * POST /api/writeback/save    — save leaf or aggregate delta
 * POST /api/writeback/revert  — revert a delta
 *
 * V3: all inputs validated before service call.
 * V6: no business logic in routes.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import { canWrite, isAdmin } from '../services/entityService';
import { saveLeafDelta, saveAggregateDelta, revertDelta } from '../services/writeback/writebackService';
import { lockProcess, unlockProcess, isProcessLocked } from '../services/writeback/processLockService';
import { WritebackRequest } from '../models/writeback.models';

const router = Router();

function validateWritebackRequest(body: unknown): WritebackRequest {
  if (!body || typeof body !== 'object') {
    throw Object.assign(new Error('Request body must be a JSON object'), { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const rclAccountKey = String(b['rclAccountKey'] ?? '').trim();
  if (!rclAccountKey) throw Object.assign(new Error('rclAccountKey is required'), { status: 400 });

  const loadId = Number(b['loadId']);
  if (!Number.isInteger(loadId) || loadId <= 0)
    throw Object.assign(new Error('loadId must be a positive integer'), { status: 400 });

  const entityId = Number(b['entityId']);
  if (!Number.isInteger(entityId) || entityId <= 0)
    throw Object.assign(new Error('entityId must be a positive integer'), { status: 400 });

  const scopeId = Number(b['scopeId']);
  if (!Number.isInteger(scopeId) || scopeId <= 0)
    throw Object.assign(new Error('scopeId must be a positive integer'), { status: 400 });

  const currencyId = Number(b['currencyId']);
  if (!Number.isInteger(currencyId) || currencyId <= 0)
    throw Object.assign(new Error('currencyId must be a positive integer'), { status: 400 });

  const newValue = Number(b['newValue']);
  if (isNaN(newValue) || !isFinite(newValue))
    throw Object.assign(new Error('newValue must be a finite number'), { status: 400 });

  const currentVersion = Number(b['currentVersion'] ?? 0);
  const annotation = typeof b['annotation'] === 'string' ? b['annotation'].trim() : undefined;
  const parentRclKey = typeof b['parentRclKey'] === 'string' ? b['parentRclKey'].trim() : undefined;
  const adjLevelId = b['adjLevelId'] != null ? Number(b['adjLevelId']) : undefined;

  return {
    rclAccountKey, loadId, entityId, scopeId, currencyId, newValue, currentVersion,
    annotation, parentRclKey,
    adjLevelId: adjLevelId != null && !isNaN(adjLevelId) ? adjLevelId : undefined,
    dimAcc01Code: typeof b['dimAcc01Code'] === 'string' ? b['dimAcc01Code'] : null,
    dimAcc02Code: typeof b['dimAcc02Code'] === 'string' ? b['dimAcc02Code'] : null,
    counterpart:  typeof b['counterpart']  === 'string' ? b['counterpart']  : null,
  };
}

/** POST /api/writeback/save */
router.post('/save', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const request = validateWritebackRequest(req.body);

    if (!(await canWrite(userId, request.entityId))) {
      res.status(403).json({ error: 'Insufficient permissions for this entity' });
      return;
    }

    const isLeaf = !request.parentRclKey;
    const result = isLeaf
      ? await saveLeafDelta(request, userId)
      : await saveAggregateDelta(request, userId);

    if (result.processLocked) {
      res.status(409).json({ error: 'Process is locked', processLocked: true });
      return;
    }
    if (result.conflict) {
      res.status(409).json({ error: 'Concurrent edit conflict', conflict: result.conflict });
      return;
    }

    res.status(201).json(result.writebackResponse);
  } catch (err) { next(err); }
});

/** GET /api/writeback/process-lock/:loadId */
router.get('/process-lock/:loadId', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const loadId = Number(req.params['loadId']);
    if (!Number.isInteger(loadId) || loadId <= 0) {
      res.status(400).json({ error: 'loadId must be a positive integer' }); return;
    }
    res.json({ loadId, isLocked: await isProcessLocked(loadId) });
  } catch (err) { next(err); }
});

/** POST /api/writeback/process-lock/:loadId — Admin only */
router.post('/process-lock/:loadId', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const loadId = Number(req.params['loadId']);
    if (!Number.isInteger(loadId) || loadId <= 0) {
      res.status(400).json({ error: 'loadId must be a positive integer' }); return;
    }
    if (!(await isAdmin(userId))) {
      res.status(403).json({ error: 'Admin role required to lock/unlock processes' }); return;
    }
    await lockProcess(loadId, userId);
    res.json({ loadId, isLocked: true });
  } catch (err) { next(err); }
});

/** DELETE /api/writeback/process-lock/:loadId — Admin only */
router.delete('/process-lock/:loadId', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const loadId = Number(req.params['loadId']);
    if (!Number.isInteger(loadId) || loadId <= 0) {
      res.status(400).json({ error: 'loadId must be a positive integer' }); return;
    }
    if (!(await isAdmin(userId))) {
      res.status(403).json({ error: 'Admin role required to lock/unlock processes' }); return;
    }
    await unlockProcess(loadId, userId);
    res.json({ loadId, isLocked: false });
  } catch (err) { next(err); }
});

/** POST /api/writeback/revert */
router.post('/revert', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const body = req.body as Record<string, unknown>;
    const deltaId = Number(body['deltaId']);
    if (!Number.isInteger(deltaId) || deltaId <= 0) {
      res.status(400).json({ error: 'deltaId must be a positive integer' }); return;
    }
    await revertDelta(deltaId, userId);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
