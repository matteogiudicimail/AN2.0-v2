/**
 * GET /api/reports/:reportId/audit [V2: authMesa]
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../../middleware/authMesa';
import { mesaAuditService } from '../../services/mesa/auditService';

const router = Router({ mergeParams: true });
router.use(authMesa);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId = parseInt(req.params['reportId'] ?? '', 10);
  if (isNaN(reportId)) { res.status(400).json({ error: 'reportId non valido' }); return; }
  try {
    res.json(await mesaAuditService.findChanges({
      reportId,
      sectionId: req.query['sectionId'] ? parseInt(String(req.query['sectionId']), 10) : undefined,
      from:      req.query['from']      ? String(req.query['from']) : undefined,
      to:        req.query['to']        ? String(req.query['to']) : undefined,
      userId:    req.query['userId']    ? parseInt(String(req.query['userId']), 10) : undefined,
      page:      req.query['page']      ? parseInt(String(req.query['page']), 10) : 1,
      limit:     req.query['limit']     ? parseInt(String(req.query['limit']), 10) : 50,
    }));
  } catch (err) { next(err); }
});

export default router;
