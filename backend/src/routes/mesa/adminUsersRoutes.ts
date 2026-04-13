/**
 * CRUD /api/admin/users + GET /api/admin/roles [V2: authMesa]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../../middleware/authMesa';
import { mesaUsersService } from '../../services/mesa/usersService';

const router = Router();
router.use(authMesa);

// Roles
router.get('/roles', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.json(await mesaUsersService.findAllRoles()); } catch (err) { next(err); }
});

// Users
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.json(await mesaUsersService.findAll()); } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaUsersService.findOne(id)); } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { username, displayName } = req.body as Record<string, unknown>;
  if (typeof username !== 'string' || typeof displayName !== 'string') {
    res.status(400).json({ error: 'username e displayName sono obbligatori' }); return;
  }
  try { res.status(201).json(await mesaUsersService.create(req.body)); } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaUsersService.update(id, req.body)); } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaUsersService.remove(id)); } catch (err) { next(err); }
});

export default router;
