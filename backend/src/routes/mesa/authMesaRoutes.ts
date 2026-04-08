/**
 * POST /api/auth/login — MESA authentication (no JWT required)
 * [V3] Input validated before use
 */
import { Router, Request, Response, NextFunction } from 'express';
import { mesaAuthService } from '../../services/mesa/authService';

const router = Router();

router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { username, password } = req.body as { username?: unknown; password?: unknown };
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'username e password sono obbligatori' });
    return;
  }
  try {
    const result = await mesaAuthService.login(username.trim(), password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
