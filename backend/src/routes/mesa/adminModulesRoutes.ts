/**
 * CRUD /api/admin/modules — ApplicationModule management [V2: authMesa]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../../middleware/authMesa';
import { mesaModulesService } from '../../services/mesa/modulesService';

const router = Router();
router.use(authMesa);

router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.json(await mesaModulesService.findAll()); } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaModulesService.findOne(id)); } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.status(201).json(await mesaModulesService.create(req.body)); } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaModulesService.update(id, req.body)); } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaModulesService.remove(id)); } catch (err) { next(err); }
});

export default router;
