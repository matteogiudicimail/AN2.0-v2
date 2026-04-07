/**
 * Master Data Routes — CRUD for registered dimension/lookup tables.
 *
 * [V2] All endpoints require JWT.
 * [V3] All inputs validated before reaching service.
 * [V4] No internals in error responses.
 * [V6] Logic in masterDataService.
 *
 * Endpoints:
 *   GET    /reports/:id/master-data            — list registered tables
 *   POST   /reports/:id/master-data            — register a new table
 *   DELETE /reports/:id/master-data/:mdId      — unregister
 *   GET    /reports/:id/master-data/:mdId/rows — read rows
 *   POST   /reports/:id/master-data/:mdId/rows — insert row
 *   PUT    /reports/:id/master-data/:mdId/rows/:pk — update row
 *   DELETE /reports/:id/master-data/:mdId/rows/:pk — delete row
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import {
  listMasterDataTables, registerMasterDataTable, unregisterMasterDataTable,
  getMasterDataRows, insertMasterDataRow, updateMasterDataRow, deleteMasterDataRow,
} from '../services/masterDataService';
import { RegisterMasterDataDto, UpsertMasterDataRowDto } from '../models/masterData.models';

const router = Router();

function extractUserId(req: Request): string {
  const u = (req as Request & { user?: { sub?: string; userId?: string } }).user;
  return u?.sub ?? u?.userId ?? 'system';
}

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── List registered tables ───────────────────────────────────────────────────

router.get('/reports/:id/master-data', authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseId(req.params.id);
    if (!reportId) { res.status(400).json({ error: 'reportId non valido' }); return; }
    try { res.json(await listMasterDataTables(reportId)); }
    catch (err) { next(err); }
  },
);

// ── Register a table ─────────────────────────────────────────────────────────

router.post('/reports/:id/master-data', authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseId(req.params.id);
    if (!reportId) { res.status(400).json({ error: 'reportId non valido' }); return; }

    const body = req.body as Record<string, unknown>;

    if (!body.schemaName || typeof body.schemaName !== 'string') {
      res.status(400).json({ error: 'schemaName obbligatorio' }); return;
    }
    if (!body.tableName || typeof body.tableName !== 'string') {
      res.status(400).json({ error: 'tableName obbligatorio' }); return;
    }
    if (!body.label || typeof body.label !== 'string') {
      res.status(400).json({ error: 'label obbligatorio' }); return;
    }
    if (!body.primaryKeyCol || typeof body.primaryKeyCol !== 'string') {
      res.status(400).json({ error: 'primaryKeyCol obbligatorio' }); return;
    }
    if (!Array.isArray(body.editableCols) || !(body.editableCols as unknown[]).every((c) => typeof c === 'string')) {
      res.status(400).json({ error: 'editableCols deve essere un array di stringhe' }); return;
    }

    const dto: RegisterMasterDataDto = {
      schemaName:    body.schemaName as string,
      tableName:     body.tableName as string,
      label:         body.label as string,
      primaryKeyCol: body.primaryKeyCol as string,
      editableCols:  body.editableCols as string[],
    };

    try {
      const id = await registerMasterDataTable(reportId, dto, extractUserId(req));
      res.status(201).json({ masterDataId: id });
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 400 || code === 404) { res.status(code).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── Unregister a table ───────────────────────────────────────────────────────

router.delete('/reports/:id/master-data/:mdId', authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseId(req.params.id);
    const mdId     = parseId(req.params.mdId);
    if (!reportId || !mdId) { res.status(400).json({ error: 'ID non valido' }); return; }
    try {
      await unregisterMasterDataTable(mdId, reportId);
      res.json({ ok: true });
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── Read rows ────────────────────────────────────────────────────────────────

router.get('/reports/:id/master-data/:mdId/rows', authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseId(req.params.id);
    const mdId     = parseId(req.params.mdId);
    if (!reportId || !mdId) { res.status(400).json({ error: 'ID non valido' }); return; }
    try { res.json(await getMasterDataRows(mdId, reportId)); }
    catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── Insert row ───────────────────────────────────────────────────────────────

router.post('/reports/:id/master-data/:mdId/rows', authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseId(req.params.id);
    const mdId     = parseId(req.params.mdId);
    if (!reportId || !mdId) { res.status(400).json({ error: 'ID non valido' }); return; }

    const body = req.body as Record<string, unknown>;
    if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
      res.status(400).json({ error: 'values deve essere un oggetto' }); return;
    }

    const dto: UpsertMasterDataRowDto = { values: body.values as Record<string, string | null> };
    try {
      await insertMasterDataRow(mdId, reportId, dto);
      res.status(201).json({ ok: true });
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 400 || code === 404) { res.status(code).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── Update row ───────────────────────────────────────────────────────────────

router.put('/reports/:id/master-data/:mdId/rows/:pk', authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseId(req.params.id);
    const mdId     = parseId(req.params.mdId);
    if (!reportId || !mdId) { res.status(400).json({ error: 'ID non valido' }); return; }

    const pkValue = req.params.pk;
    if (!pkValue || pkValue.length > 500) { res.status(400).json({ error: 'pk non valido' }); return; }

    const body = req.body as Record<string, unknown>;
    if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
      res.status(400).json({ error: 'values deve essere un oggetto' }); return;
    }

    const dto: UpsertMasterDataRowDto = { values: body.values as Record<string, string | null> };
    try {
      await updateMasterDataRow(mdId, reportId, pkValue, dto);
      res.json({ ok: true });
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 400 || code === 404) { res.status(code).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── Delete row ───────────────────────────────────────────────────────────────

router.delete('/reports/:id/master-data/:mdId/rows/:pk', authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseId(req.params.id);
    const mdId     = parseId(req.params.mdId);
    if (!reportId || !mdId) { res.status(400).json({ error: 'ID non valido' }); return; }

    const pkValue = req.params.pk;
    if (!pkValue || pkValue.length > 500) { res.status(400).json({ error: 'pk non valido' }); return; }

    try {
      await deleteMasterDataRow(mdId, reportId, pkValue);
      res.json({ ok: true });
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

export default router;
