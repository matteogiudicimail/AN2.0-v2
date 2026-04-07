/**
 * Param Table Routes — endpoint per la gestione delle tabelle _PARAM ESG.
 *
 * Tutti gli endpoint richiedono JWT valido [V2].
 * Input validation eseguita qui prima di delegare al service [V6].
 * Nessuno stack trace nelle risposte al client [V4].
 *
 * OWASP A03 (Injection):
 *   - Schema/table/column validati con regex whitelist nel service
 *   - paramTableId/paramId validati come interi positivi qui
 * OWASP A04 (Insecure Design):
 *   - Il DROP è permesso solo se il chiamante ha accesso al report
 *   (l'ownership del paramTableId implica ownership del report)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import * as svc from '../services/paramTableService';
import { UpsertParamRowDto, CreateParamTableDto, CustomColumnDef } from '../models/paramTable.models';

const router = Router();
router.use(authJwt);

function uid(req: Request): string { return req.user!.sub; }

function parsePositiveInt(s: string | undefined, name: string): number {
  const n = parseInt(s ?? '0', 10);
  if (!n || n <= 0 || !Number.isFinite(n)) {
    const e = new Error(`${name} must be a positive integer`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  return n;
}

function handleError(err: unknown, res: Response, next: NextFunction): void {
  const e = err as Error & { statusCode?: number };
  if (e.statusCode && e.statusCode < 500) {
    res.status(e.statusCode).json({ error: e.message });
  } else {
    next(err);
  }
}

// ── Report-scoped: list + create param tables ─────────────────────────────────

/**
 * GET /configurator/reports/:id/param-tables
 * Lista le tabelle _PARAM registrate per un report.
 */
router.get(
  '/reports/:id/param-tables',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reportId = parsePositiveInt(req.params['id'], 'reportId');
      const tables = await svc.getParamTableRegistry(reportId);
      res.json(tables);
    } catch (e) { handleError(e, res, next); }
  },
);

/**
 * POST /configurator/reports/:id/param-tables
 * Crea (o apre) la tabella _PARAM per una (schema, factTable, column).
 * Body: { schema, factTable, column }
 */
router.post(
  '/reports/:id/param-tables',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reportId = parsePositiveInt(req.params['id'], 'reportId');
      const { schema, factTable, column } = req.body as CreateParamTableDto;

      if (!schema || typeof schema !== 'string' || !schema.trim()) {
        res.status(400).json({ error: 'schema is required' }); return;
      }
      if (!factTable || typeof factTable !== 'string' || !factTable.trim()) {
        res.status(400).json({ error: 'factTable is required' }); return;
      }
      if (!column || typeof column !== 'string' || !column.trim()) {
        res.status(400).json({ error: 'column is required' }); return;
      }

      const info = await svc.ensureParamTable(
        reportId, { schema: schema.trim(), factTable: factTable.trim(), column: column.trim() },
        uid(req),
      );
      res.status(201).json(info);
    } catch (e) { handleError(e, res, next); }
  },
);

// ── DISTINCT values ───────────────────────────────────────────────────────────

/**
 * GET /configurator/db/tables/:schema/:table/columns/:column/distinct?limit=500
 * Restituisce i valori DISTINCT di una colonna.
 */
router.get(
  '/db/tables/:schema/:table/columns/:column/distinct',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { schema, table, column } = req.params as Record<string, string>;
      const rawLimit = parseInt((req.query['limit'] as string) ?? '500', 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 5000) : 500;

      const result = await svc.getDistinctValues(schema, table, column, limit);
      res.json(result);
    } catch (e) { handleError(e, res, next); }
  },
);

// ── Param table operations (by paramTableId) ──────────────────────────────────

/**
 * DELETE /configurator/param-tables/:ptId
 * Elimina la tabella fisica e la riga di registry.
 */
router.delete(
  '/param-tables/:ptId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId = parsePositiveInt(req.params['ptId'], 'paramTableId');
      await svc.dropParamTable(ptId, uid(req));
      res.status(204).send();
    } catch (e) { handleError(e, res, next); }
  },
);

/**
 * PUT /configurator/param-tables/:ptId/custom-columns
 * Aggiorna le definizioni delle colonne custom (JSON in registry).
 * Body: { columns: CustomColumnDef[] }
 */
router.put(
  '/param-tables/:ptId/custom-columns',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId = parsePositiveInt(req.params['ptId'], 'paramTableId');
      const { columns } = req.body as { columns: CustomColumnDef[] };
      if (!Array.isArray(columns)) {
        res.status(400).json({ error: 'columns must be an array' }); return;
      }
      const updated = await svc.updateCustomColumnDefs(ptId, columns, uid(req));
      res.json(updated);
    } catch (e) { handleError(e, res, next); }
  },
);

// ── Rows ──────────────────────────────────────────────────────────────────────

/**
 * GET /configurator/param-tables/:ptId/rows
 */
router.get(
  '/param-tables/:ptId/rows',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId = parsePositiveInt(req.params['ptId'], 'paramTableId');
      res.json(await svc.getParamRows(ptId));
    } catch (e) { handleError(e, res, next); }
  },
);

/**
 * POST /configurator/param-tables/:ptId/rows
 * Aggiunge (o aggiorna per sourceValue) una riga.
 */
router.post(
  '/param-tables/:ptId/rows',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId = parsePositiveInt(req.params['ptId'], 'paramTableId');
      const dto = req.body as UpsertParamRowDto;
      if (!dto.sourceValue || typeof dto.sourceValue !== 'string') {
        res.status(400).json({ error: 'sourceValue is required' }); return;
      }
      if (!dto.label || typeof dto.label !== 'string') {
        res.status(400).json({ error: 'label is required' }); return;
      }
      const row = await svc.upsertParamRow(ptId, dto, uid(req));
      res.status(201).json(row);
    } catch (e) { handleError(e, res, next); }
  },
);

/**
 * PUT /configurator/param-tables/:ptId/rows/:paramId
 * Aggiorna una riga esistente.
 */
router.put(
  '/param-tables/:ptId/rows/:paramId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId    = parsePositiveInt(req.params['ptId'],    'paramTableId');
      const paramId = parsePositiveInt(req.params['paramId'], 'paramId');
      const dto     = req.body as UpsertParamRowDto;

      // Ensure the row exists under this ptId
      const existing = await svc.getParamRowById(ptId, paramId);
      if (!existing) { res.status(404).json({ error: 'Row not found' }); return; }

      // Carry forward sourceValue if not provided in body
      if (!dto.sourceValue) dto.sourceValue = existing.sourceValue;
      if (!dto.label)        dto.label       = existing.label;

      const row = await svc.upsertParamRow(ptId, dto, uid(req));
      res.json(row);
    } catch (e) { handleError(e, res, next); }
  },
);

/**
 * DELETE /configurator/param-tables/:ptId/rows/:paramId
 */
router.delete(
  '/param-tables/:ptId/rows/:paramId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId    = parsePositiveInt(req.params['ptId'],    'paramTableId');
      const paramId = parsePositiveInt(req.params['paramId'], 'paramId');
      await svc.deleteParamRow(ptId, paramId);
      res.status(204).send();
    } catch (e) { handleError(e, res, next); }
  },
);

// ── Seed ──────────────────────────────────────────────────────────────────────

/**
 * POST /configurator/param-tables/:ptId/seed
 * Popola la tabella con i valori DISTINCT mancanti dalla colonna sorgente.
 */
router.post(
  '/param-tables/:ptId/seed',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId = parsePositiveInt(req.params['ptId'], 'paramTableId');
      const result = await svc.seedFromDistinct(ptId, uid(req));
      res.json(result);
    } catch (e) { handleError(e, res, next); }
  },
);

// ── Reorder ───────────────────────────────────────────────────────────────────

/**
 * PUT /configurator/param-tables/:ptId/rows/reorder
 * Riordina le righe per orderedIds.
 * Body: { orderedIds: number[] }
 *
 * NOTE: questo route deve essere dichiarato PRIMA di /:paramId
 * per evitare che "reorder" venga parsato come paramId.
 */
router.put(
  '/param-tables/:ptId/rows/reorder',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId = parsePositiveInt(req.params['ptId'], 'paramTableId');
      const { orderedIds } = req.body as { orderedIds: number[] };
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        res.status(400).json({ error: 'orderedIds must be a non-empty array' }); return;
      }
      if (orderedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        res.status(400).json({ error: 'orderedIds must contain positive integers' }); return;
      }
      await svc.reorderParamRows(ptId, orderedIds, uid(req));
      res.status(204).send();
    } catch (e) { handleError(e, res, next); }
  },
);

/**
 * PATCH /configurator/param-tables/:ptId/rows/:paramId/move
 * Sposta una riga su o giù.
 * Body: { direction: 'up' | 'down' }
 */
router.patch(
  '/param-tables/:ptId/rows/:paramId/move',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptId    = parsePositiveInt(req.params['ptId'],    'paramTableId');
      const paramId = parsePositiveInt(req.params['paramId'], 'paramId');
      const { direction } = req.body as { direction: 'up' | 'down' };
      if (direction !== 'up' && direction !== 'down') {
        res.status(400).json({ error: 'direction must be "up" or "down"' }); return;
      }
      await svc.moveParamRow(ptId, paramId, direction, uid(req));
      res.status(204).send();
    } catch (e) { handleError(e, res, next); }
  },
);

export default router;
