/**
 * Auth Routes — development helpers only.
 * GET /api/auth/dev-token — returns a signed JWT for local dev testing.
 *
 * This endpoint is disabled in production (returns 404).
 * It must NEVER be exposed in a production build.
 */
import { Router, Request, Response } from 'express';
import { createDevToken } from '../middleware/authJwt';
import { config } from '../config/env';

const router = Router();

router.get('/dev-token', (_req: Request, res: Response) => {
  if (config.isProduction) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const token = createDevToken('dev-user');
  res.json({ token, expiresIn: '24h', userId: 'dev-user' });
});

export default router;
