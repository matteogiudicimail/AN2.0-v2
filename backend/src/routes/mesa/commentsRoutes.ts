/**
 * GET/POST/DELETE /api/reports/:reportId/sections/:sectionId/comments [V2: authMesa]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../../middleware/authMesa';
import { mesaCommentsService } from '../../services/mesa/commentsService';

const router = Router({ mergeParams: true });
router.use(authMesa);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId  = parseInt(req.params['reportId']  ?? '', 10);
  const sectionId = parseInt(req.params['sectionId'] ?? '', 10);
  const kpiId     = parseInt(String(req.query['kpiId'] ?? ''), 10);
  if (isNaN(reportId) || isNaN(sectionId) || isNaN(kpiId)) {
    res.status(400).json({ error: 'reportId, sectionId e kpiId sono obbligatori' }); return;
  }
  const dvId = req.query['dimensionValueId'] ? parseInt(String(req.query['dimensionValueId']), 10) : undefined;
  try { res.json(await mesaCommentsService.list(reportId, sectionId, kpiId, dvId)); } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId  = parseInt(req.params['reportId']  ?? '', 10);
  const sectionId = parseInt(req.params['sectionId'] ?? '', 10);
  const userId    = req.mesaUser!.sub;
  const { kpiId, text } = req.body as Record<string, unknown>;
  if (isNaN(reportId) || isNaN(sectionId) || typeof kpiId !== 'number' || typeof text !== 'string') {
    res.status(400).json({ error: 'kpiId e text sono obbligatori' }); return;
  }
  try { res.status(201).json(await mesaCommentsService.create(reportId, sectionId, req.body, userId)); } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id     = parseInt(req.params['id'] ?? '', 10);
  const userId = req.mesaUser!.sub;
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { await mesaCommentsService.delete(id, userId); res.status(204).send(); } catch (err) { next(err); }
});

export default router;
