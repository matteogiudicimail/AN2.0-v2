/**
 * CRUD /api/admin/navigation — NavigationItem management [V2: authMesa]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../../middleware/authMesa';
import { mesaNavigationService } from '../../services/mesa/navigationService';

const router = Router();

// Public endpoints — navigation structure is not sensitive
router.get('/tree',    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.json(await mesaNavigationService.getTree()); } catch (err) { next(err); }
});
router.get('/modules', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.json(await mesaNavigationService.getModules()); } catch (err) { next(err); }
});

// Protected endpoints — require MESA JWT
router.use(authMesa);

router.get('/',        async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.json(await mesaNavigationService.findAll()); } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const dto = req.body as { menuKey?: unknown; label?: unknown };
  if (typeof dto.menuKey !== 'string' || typeof dto.label !== 'string') {
    res.status(400).json({ error: 'menuKey e label sono obbligatori' }); return;
  }
  try { res.status(201).json(await mesaNavigationService.create(req.body)); } catch (err) { next(err); }
});

router.patch('/reorder', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const items = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: 'body deve essere un array' }); return; }
  try { await mesaNavigationService.reorder(items); res.json({ ok: true }); } catch (err) { next(err); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaNavigationService.update(id, req.body)); } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaNavigationService.update(id, req.body)); } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaNavigationService.remove(id)); } catch (err) { next(err); }
});

export default router;
