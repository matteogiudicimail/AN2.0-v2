/**
 * Audit Routes — POST /api/audit/cell-history [F13]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import { getCellHistory, getCellDetail } from '../services/auditService';

const router = Router();

router.post('/cell-history', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, unknown>;
    const coords = body['coordinates'] as Record<string, unknown>;

    if (!coords) { res.status(400).json({ error: 'coordinates is required' }); return; }

    const rclAccountKey = String(coords['rclAccountKey'] ?? '').trim();
    if (!rclAccountKey) { res.status(400).json({ error: 'rclAccountKey required' }); return; }

    const loadId = Number(coords['loadId']);
    if (!Number.isInteger(loadId) || loadId <= 0) { res.status(400).json({ error: 'loadId required' }); return; }

    const entityId = Number(coords['entityId']);
    if (!Number.isInteger(entityId) || entityId <= 0) { res.status(400).json({ error: 'entityId required' }); return; }

    const currencyId = Number(coords['currencyId']);
    if (!Number.isInteger(currencyId) || currencyId <= 0) { res.status(400).json({ error: 'currencyId required' }); return; }

    const adjLevelId = coords['adjLevelId'] != null ? Number(coords['adjLevelId']) : undefined;

    res.json(await getCellHistory(rclAccountKey, loadId, entityId, currencyId, adjLevelId));
  } catch (err) { next(err); }
});

router.post('/cell-detail', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, unknown>;
    const coords = body['coordinates'] as Record<string, unknown>;

    if (!coords) { res.status(400).json({ error: 'coordinates is required' }); return; }

    const rclAccountKey = String(coords['rclAccountKey'] ?? '').trim();
    if (!rclAccountKey) { res.status(400).json({ error: 'rclAccountKey required' }); return; }

    const loadId = Number(coords['loadId']);
    if (!Number.isInteger(loadId) || loadId <= 0) { res.status(400).json({ error: 'loadId required' }); return; }

    const entityId = Number(coords['entityId']);
    if (!Number.isInteger(entityId) || entityId <= 0) { res.status(400).json({ error: 'entityId required' }); return; }

    const scopeId = Number(coords['scopeId']);
    if (!Number.isInteger(scopeId) || scopeId <= 0) { res.status(400).json({ error: 'scopeId required' }); return; }

    const currencyId = Number(coords['currencyId']);
    if (!Number.isInteger(currencyId) || currencyId <= 0) { res.status(400).json({ error: 'currencyId required' }); return; }

    const adjLevelId = coords['adjLevelId'] != null ? Number(coords['adjLevelId']) : undefined;

    res.json(await getCellDetail(rclAccountKey, loadId, entityId, scopeId, currencyId, adjLevelId));
  } catch (err) { next(err); }
});

export default router;
