/**
 * Permission Routes [F14, OWASP A01]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import { getUserPermissions, getAllPermissions, setPermission, isAdmin } from '../services/permissionService';

const router = Router();

router.get('/me', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    res.json(await getUserPermissions(userId));
  } catch (err) { next(err); }
});

router.get('/users', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    if (!(await isAdmin(userId))) {
      res.status(403).json({ error: 'Admin role required' }); return;
    }
    res.json(await getAllPermissions());
  } catch (err) { next(err); }
});

router.post('/', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.user!.sub;
    if (!(await isAdmin(adminId))) {
      res.status(403).json({ error: 'Admin role required' }); return;
    }

    const body = req.body as Record<string, unknown>;
    const userId   = String(body['userId']   ?? '').trim();
    const entityId = Number(body['entityId']);
    const role     = String(body['role']     ?? '').trim();

    if (!userId)                                     { res.status(400).json({ error: 'userId required' }); return; }
    if (!Number.isInteger(entityId) || entityId <= 0) { res.status(400).json({ error: 'entityId required' }); return; }
    if (!role)                                        { res.status(400).json({ error: 'role required' }); return; }

    await setPermission(userId, entityId, role as 'Viewer' | 'Editor' | 'Approver' | 'Admin', adminId);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
