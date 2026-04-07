/**
 * Report Routes — POST /api/report/query
 * V3: full input validation before passing to service.
 * V6: no business logic here — delegates to reportService.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import { executeReport } from '../services/report/reportService';
import { FilterState } from '../models/report.models';
import { getReportDefinitionFull } from '../services/configuratorService';

const router = Router();

function validateFilterState(body: unknown): FilterState {
  if (!body || typeof body !== 'object') {
    throw Object.assign(new Error('Request body must be a JSON object'), { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const fs = b['filterState'] as Record<string, unknown>;
  if (!fs || typeof fs !== 'object') {
    throw Object.assign(new Error('filterState is required'), { status: 400 });
  }

  const entityIds = fs['entityIds'];
  if (!Array.isArray(entityIds) || entityIds.length === 0) {
    throw Object.assign(new Error('filterState.entityIds must be a non-empty array'), { status: 400 });
  }
  for (const id of entityIds) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error('filterState.entityIds must contain positive integers'), { status: 400 });
    }
  }

  const scopeId = Number(fs['scopeId']);
  if (!Number.isInteger(scopeId) || scopeId <= 0) {
    throw Object.assign(new Error('filterState.scopeId must be a positive integer'), { status: 400 });
  }

  const currencyId = Number(fs['currencyId']);
  if (!Number.isInteger(currencyId) || currencyId <= 0) {
    throw Object.assign(new Error('filterState.currencyId must be a positive integer'), { status: 400 });
  }

  const loadIds = fs['loadIds'];
  if (!Array.isArray(loadIds) || loadIds.length === 0) {
    throw Object.assign(new Error('filterState.loadIds must be a non-empty array'), { status: 400 });
  }
  for (const id of loadIds) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error('filterState.loadIds must contain positive integers'), { status: 400 });
    }
  }

  const adjLevelIds = Array.isArray(fs['adjLevelIds'])
    ? (fs['adjLevelIds'] as unknown[]).filter((v) => typeof v === 'number').map(Number)
    : [];

  const costCenterCodes = Array.isArray(fs['costCenterCodes'])
    ? (fs['costCenterCodes'] as unknown[]).filter((v) => typeof v === 'string').map(String)
    : [];

  const coCodes = Array.isArray(fs['coCodes'])
    ? (fs['coCodes'] as unknown[]).filter((v) => typeof v === 'string').map(String)
    : [];

  const counterpartIds = Array.isArray(fs['counterpartIds'])
    ? (fs['counterpartIds'] as unknown[]).filter((v) => typeof v === 'number').map(Number)
    : [];

  const colDimRaw = fs['columnDimension'];
  const columnDimension: FilterState['columnDimension'] =
    (colDimRaw === 'Entity' || colDimRaw === 'AdjLevel') ? colDimRaw : 'Process';

  return {
    entityIds:              entityIds as number[],
    scopeId,
    currencyId,
    loadIds:                loadIds as number[],
    includeManualWriteback: Boolean(fs['includeManualWriteback']),
    adjLevelIds,
    costCenterCodes,
    coCodes,
    counterpartIds,
    columnDimension,
  };
}

/** GET /api/report/definition/:reportId — restituisce metadati + filtri predefiniti */
router.get('/definition/:reportId', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = Number(req.params['reportId']);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId must be a positive integer' });
      return;
    }
    const definition = await getReportDefinitionFull(reportId);
    if (!definition) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }
    res.json(definition);
  } catch (err) {
    next(err);
  }
});

/** POST /api/report/query */
router.post('/query', authJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter = validateFilterState(req.body);
    const result = await executeReport(filter);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
