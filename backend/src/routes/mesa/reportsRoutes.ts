/**
 * Reports + Designer endpoints [V2: authMesa]
 * GET/POST /api/reports
 * GET /api/reports/:id, /api/reports/:id/sections, /api/reports/:id/designer
 * POST /api/reports/:id/transition, /api/reports/:id/sections, /api/reports/:id/dimensions
 * PATCH /api/reports/:id/dimensions/:dimId/values
 * DELETE /api/reports/:id/sections/:sId, /api/reports/:id/dimensions/:dimId
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../../middleware/authMesa';
import { mesaReportConfigService } from '../../services/mesa/reportConfigService';

const router = Router();
router.use(authMesa);

router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { res.json(await mesaReportConfigService.findAll()); } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { code, name } = req.body as Record<string, unknown>;
  if (typeof code !== 'string' || typeof name !== 'string') {
    res.status(400).json({ error: 'code e name sono obbligatori' }); return;
  }
  try { res.status(201).json(await mesaReportConfigService.createReport(req.body)); } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaReportConfigService.findOne(id)); } catch (err) { next(err); }
});

router.get('/:id/sections', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaReportConfigService.findSections(id)); } catch (err) { next(err); }
});

router.post('/:id/sections', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  const { code, name } = req.body as Record<string, unknown>;
  if (isNaN(id) || typeof code !== 'string' || typeof name !== 'string') {
    res.status(400).json({ error: 'id, code e name sono obbligatori' }); return;
  }
  try { res.status(201).json(await mesaReportConfigService.createSection(id, req.body)); } catch (err) { next(err); }
});

router.delete('/:id/sections/:sId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const sId = parseInt(req.params['sId'] ?? '', 10);
  if (isNaN(sId)) { res.status(400).json({ error: 'sId non valido' }); return; }
  try { await mesaReportConfigService.deleteSection(sId); res.status(204).send(); } catch (err) { next(err); }
});

router.get('/:id/designer', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { res.json(await mesaReportConfigService.getDesignerConfig(id)); } catch (err) { next(err); }
});

router.post('/:id/dimensions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  const { dimensionId, role } = req.body as Record<string, unknown>;
  if (isNaN(id) || typeof dimensionId !== 'number' || typeof role !== 'string') {
    res.status(400).json({ error: 'id, dimensionId e role sono obbligatori' }); return;
  }
  try { res.status(201).json(await mesaReportConfigService.assignDimension(id, req.body)); } catch (err) { next(err); }
});

router.patch('/:id/dimensions/:dimId/values', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId = parseInt(req.params['id'] ?? '', 10);
  const dimId    = parseInt(req.params['dimId'] ?? '', 10);
  if (isNaN(reportId) || isNaN(dimId)) { res.status(400).json({ error: 'id non valido' }); return; }
  const includedIds = (req.body as any).includedIds ?? [];
  try { await mesaReportConfigService.setDimensionValueInclusion(reportId, dimId, includedIds); res.json({ ok: true }); } catch (err) { next(err); }
});

router.delete('/:id/dimensions/:dimId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId = parseInt(req.params['id'] ?? '', 10);
  const dimId    = parseInt(req.params['dimId'] ?? '', 10);
  if (isNaN(reportId) || isNaN(dimId)) { res.status(400).json({ error: 'id non valido' }); return; }
  try { await mesaReportConfigService.removeDimension(reportId, dimId); res.status(204).send(); } catch (err) { next(err); }
});

router.post('/:id/transition', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params['id'] ?? '', 10);
  const { action, comment } = req.body as Record<string, unknown>;
  if (isNaN(id) || typeof action !== 'string') { res.status(400).json({ error: 'action obbligatorio' }); return; }
  try { res.json(await mesaReportConfigService.transition(id, action as any, comment as string)); } catch (err) { next(err); }
});

export default router;
