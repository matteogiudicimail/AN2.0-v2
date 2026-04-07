/**
 * Hierarchy Definition Routes
 * Endpoints for managing cfg_HierarchyDef_AN2 entries.
 * Mounted at /api/configurator (shares prefix with configuratorRoutes).
 * Requires JWT [V2]. Input validated before delegating to service [V6].
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import * as hierSvc from '../services/hierarchyDefService';

const router = Router();
router.use(authJwt);

function intParam(s: string | undefined): number { return parseInt(s ?? '0', 10); }

/** GET /api/configurator/reports/:id/hierarchy-defs */
router.get('/reports/:id/hierarchy-defs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    if (!reportId) { res.status(400).json({ error: 'Invalid reportId' }); return; }
    res.json(await hierSvc.listHierarchyDefs(reportId));
  } catch (e) { next(e); }
});

/** POST /api/configurator/reports/:id/hierarchy-defs */
router.post('/reports/:id/hierarchy-defs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = intParam(req.params['id']);
    if (!reportId) { res.status(400).json({ error: 'Invalid reportId' }); return; }
    const { dimTable, childKeyCol, parentKeyCol, labelCol } = req.body;
    if (!dimTable || !childKeyCol || !parentKeyCol || !labelCol) {
      res.status(400).json({ error: 'dimTable, childKeyCol, parentKeyCol, labelCol are required' }); return;
    }
    const saved = await hierSvc.saveHierarchyDef(reportId, req.body);
    res.status(201).json(saved);
  } catch (e) { next(e); }
});

/** PUT /api/configurator/hierarchy-defs/:defId */
router.put('/hierarchy-defs/:defId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const defId = intParam(req.params['defId']);
    if (!defId) { res.status(400).json({ error: 'Invalid defId' }); return; }
    const { dimTable, childKeyCol, parentKeyCol, labelCol } = req.body;
    if (!dimTable || !childKeyCol || !parentKeyCol || !labelCol) {
      res.status(400).json({ error: 'dimTable, childKeyCol, parentKeyCol, labelCol are required' }); return;
    }
    const existing = await hierSvc.getHierarchyDef(defId);
    if (!existing) { res.status(404).json({ error: 'Hierarchy definition not found' }); return; }
    const saved = await hierSvc.saveHierarchyDef(existing.bindingId!, { ...req.body, hierarchyDefId: defId });
    res.json(saved);
  } catch (e) { next(e); }
});

/** DELETE /api/configurator/hierarchy-defs/:defId */
router.delete('/hierarchy-defs/:defId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const defId = intParam(req.params['defId']);
    if (!defId) { res.status(400).json({ error: 'Invalid defId' }); return; }
    await hierSvc.deleteHierarchyDef(defId);
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
