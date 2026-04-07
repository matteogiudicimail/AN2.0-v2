import { Router, Request, Response } from 'express';
import { healthCheck } from '../config/db';

/**
 * GET /api/health
 * No authentication required (V2 exemption).
 * Returns 200 if DB is reachable, 503 otherwise.
 * Never exposes DB details to the client [V4].
 */
const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const dbOk = await healthCheck();
  if (dbOk) {
    res.status(200).json({ status: 'ok', db: 'reachable' });
  } else {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

export default router;
