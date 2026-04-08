/**
 * GET  /api/master-data/kpis?sectionId=X
 * GET  /api/master-data/dimensions
 * POST/PUT/DELETE /api/master-data/kpis/:id
 * [V2: authMesa]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../../middleware/authMesa';
import { mesaMasterDataService } from '../../services/mesa/masterDataService';

const router = Router();
router.use(authMesa);

router.get('/kpis', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const sectionId = parseInt(String(req.query['sectionId'] ?? ''), 10);
  if (isNaN(sectionId)) { res.status(400).json({ error: 'sectionId obbligatorio' }); return; }
  try { res.json(await mesaMasterDataService.findKpisBySection(sectionId)); } catch (err) { next(err); }
});

router.get('/dimensions', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.json(await mesaMasterDataService.findAllDimensions()); } catch (err) { next(err); }
});

router.post('/kpis', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { name, sectionId } = req.body as Record<string, unknown>;
  if (typeof name !== 'string' || typeof sectionId !== 'number') {
    res.status(400).json({ error: 'name e sectionId sono obbligatori' }); return;
  }
  try { res.status(201).json(await mesaMasterDataService.createKpi(req.body)); } catch (err) { next(err); }
});

router.put('/kpis/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaMasterDataService.updateKpi(id, req.body)); } catch (err) { next(err); }
});

router.delete('/kpis/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { await mesaMasterDataService.deleteKpi(id); res.status(204).send(); } catch (err) { next(err); }
});

export default router;
