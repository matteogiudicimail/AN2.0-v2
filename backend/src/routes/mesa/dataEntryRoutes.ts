/**
 * GET  /api/reports/:reportId/sections/:sectionId/grid
 * POST /api/reports/:reportId/sections/:sectionId/cells
 * [V2: authMesa]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../../middleware/authMesa';
import { mesaDataEntryService } from '../../services/mesa/dataEntryService';

const router = Router({ mergeParams: true });
router.use(authMesa);

router.get('/grid', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId  = parseInt(req.params['reportId']  ?? '', 10);
  const sectionId = parseInt(req.params['sectionId'] ?? '', 10);
  const userId    = req.mesaUser!.sub;
  if (isNaN(reportId) || isNaN(sectionId)) { res.status(400).json({ error: 'parametri non validi' }); return; }
  try { res.json(await mesaDataEntryService.getGrid(reportId, sectionId, userId)); } catch (err) { next(err); }
});

router.post('/cells', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId  = parseInt(req.params['reportId']  ?? '', 10);
  const sectionId = parseInt(req.params['sectionId'] ?? '', 10);
  const userId    = req.mesaUser!.sub;
  const changes   = (req.body as any)?.changes;
  if (isNaN(reportId) || isNaN(sectionId) || !Array.isArray(changes)) {
    res.status(400).json({ error: 'changes[] obbligatorio' }); return;
  }
  try { res.json(await mesaDataEntryService.saveCells(reportId, sectionId, changes, userId)); } catch (err) { next(err); }
});

export default router;
