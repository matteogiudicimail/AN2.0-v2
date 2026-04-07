/**
 * Dimension routes — supplies lookup data to the frontend filter panel.
 * Routes only validate input and delegate to services [V6].
 * All endpoints require JWT [V2].
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import { getEntitiesForUser } from '../services/entityService';
import { getAllProcesses } from '../services/processService';
import { getAllScopes, getAdjLevelsForScope } from '../services/scopeService';
import { getAllCurrencies } from '../services/currencyService';
import { getAllCostCenters, getAllCOs, getAllCounterparts } from '../services/dimensionService';

const router = Router();
router.use(authJwt);

router.get('/entities', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.sub;
    res.json(await getEntitiesForUser(userId));
  } catch (err) { next(err); }
});

router.get('/processes', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json(await getAllProcesses());
  } catch (err) { next(err); }
});

router.get('/scopes', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json(await getAllScopes());
  } catch (err) { next(err); }
});

router.get('/scopes/:scopeId/adj-levels', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const scopeId = parseInt(req.params['scopeId'] ?? '', 10);
    if (!Number.isInteger(scopeId) || scopeId <= 0) {
      res.status(400).json({ error: 'scopeId must be a positive integer' });
      return;
    }
    res.json(await getAdjLevelsForScope(scopeId));
  } catch (err) { next(err); }
});

router.get('/currencies', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json(await getAllCurrencies());
  } catch (err) { next(err); }
});

router.get('/cost-centers', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json(await getAllCostCenters());
  } catch (err) { next(err); }
});

router.get('/cos', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json(await getAllCOs());
  } catch (err) { next(err); }
});

router.get('/counterparts', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json(await getAllCounterparts());
  } catch (err) { next(err); }
});

export default router;
