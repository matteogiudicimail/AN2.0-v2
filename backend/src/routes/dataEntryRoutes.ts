/**
 * Data Entry Routes — scheda di data entry pivot.
 *
 * [V2] JWT required on all endpoints.
 * [V3] reportId validated as integer; DTO validated before reaching service.
 * [V4] No internals in error responses.
 * [V6] Logic in dataEntryService.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import { getDataEntryGrid, saveCell, getCellHistory } from '../services/dataEntryService';
import { ensureManualAdjRow } from '../services/dataEntryAdjService';
import { insertManualRow } from '../services/dataEntryCellService';
import { SaveCellDto, EnsureAdjDto, InsertManualRowDto } from '../models/dataEntry.models';

const router = Router();

// ── GET /reports/:id/data-entry/grid ─────────────────────────────────────────

router.get(
  '/reports/:id/data-entry/grid',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId non valido' });
      return;
    }
    try {
      const grid = await getDataEntryGrid(reportId);
      res.json(grid);
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── PUT /reports/:id/data-entry/cell ─────────────────────────────────────────

router.put(
  '/reports/:id/data-entry/cell',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId non valido' });
      return;
    }

    const body = req.body as Record<string, unknown>;

    // Validate dimensionValues: must be a non-null object
    if (!body.dimensionValues || typeof body.dimensionValues !== 'object' || Array.isArray(body.dimensionValues)) {
      res.status(400).json({ error: 'dimensionValues è obbligatorio e deve essere un oggetto' });
      return;
    }
    const dimValues = body.dimensionValues as Record<string, unknown>;
    // All values must be strings
    for (const [k, v] of Object.entries(dimValues)) {
      if (typeof k !== 'string' || k.length > 128) {
        res.status(400).json({ error: `Chiave dimensione non valida: "${k}"` });
        return;
      }
      if (typeof v !== 'string') {
        res.status(400).json({ error: `Valore dimensione non valido per "${k}"` });
        return;
      }
    }

    // Validate valoreField
    if (!body.valoreField || typeof body.valoreField !== 'string' || body.valoreField.length > 128) {
      res.status(400).json({ error: 'valoreField è obbligatorio' });
      return;
    }

    // Validate value
    if (body.value === undefined || body.value === null) {
      res.status(400).json({ error: 'value è obbligatorio' });
      return;
    }
    const value = String(body.value).slice(0, 4000);

    const dto: SaveCellDto = {
      dimensionValues: dimValues as Record<string, string>,
      valoreField:     body.valoreField as string,
      value,
    };

    const userId: string =
      (req as Request & { user?: { sub?: string; userId?: string; name?: string } }).user?.sub ??
      (req as Request & { user?: { sub?: string; userId?: string; name?: string } }).user?.userId ??
      'system';

    try {
      await saveCell(reportId, dto, userId);
      res.json({ ok: true });
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 400) { res.status(400).json({ error: (err as Error).message }); return; }
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── POST /reports/:id/data-entry/cell-history ────────────────────────────────

router.post(
  '/reports/:id/data-entry/cell-history',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId non valido' });
      return;
    }

    const body = req.body as Record<string, unknown>;

    if (!body.dimensionValues || typeof body.dimensionValues !== 'object' || Array.isArray(body.dimensionValues)) {
      res.status(400).json({ error: 'dimensionValues è obbligatorio' });
      return;
    }
    const dimValues = body.dimensionValues as Record<string, unknown>;
    for (const [k, v] of Object.entries(dimValues)) {
      if (typeof k !== 'string' || k.length > 128 || typeof v !== 'string') {
        res.status(400).json({ error: `Valore dimensione non valido per "${k}"` });
        return;
      }
    }

    if (!body.valoreField || typeof body.valoreField !== 'string' || body.valoreField.length > 128) {
      res.status(400).json({ error: 'valoreField è obbligatorio' });
      return;
    }

    try {
      const history = await getCellHistory(
        reportId,
        dimValues as Record<string, string>,
        body.valoreField as string,
      );
      res.json(history);
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── POST /reports/:id/data-entry/ensure-adj ───────────────────────────────────
// Crea (o riusa) la riga "Rett. Manuale" nella PARAM table del campo righe.

router.post(
  '/reports/:id/data-entry/ensure-adj',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId non valido' });
      return;
    }

    const body = req.body as Record<string, unknown>;

    if (!body.rigaFieldName || typeof body.rigaFieldName !== 'string' || body.rigaFieldName.trim() === '') {
      res.status(400).json({ error: 'rigaFieldName è obbligatorio' });
      return;
    }
    if ((body.rigaFieldName as string).length > 128) {
      res.status(400).json({ error: 'rigaFieldName troppo lungo' });
      return;
    }

    if (!body.parentSourceValue || typeof body.parentSourceValue !== 'string' || body.parentSourceValue.trim() === '') {
      res.status(400).json({ error: 'parentSourceValue è obbligatorio' });
      return;
    }
    if ((body.parentSourceValue as string).length > 500) {
      res.status(400).json({ error: 'parentSourceValue troppo lungo' });
      return;
    }

    const dto: EnsureAdjDto = {
      rigaFieldName:     body.rigaFieldName as string,
      parentSourceValue: body.parentSourceValue as string,
    };

    try {
      const result = await ensureManualAdjRow(reportId, dto);
      res.json(result);
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 400) { res.status(400).json({ error: (err as Error).message }); return; }
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── POST /reports/:id/data-entry/manual-row ───────────────────────────────────
// Inserisce una riga con valori dimensionali specificati e valori NULL nella _WRITE table.

router.post(
  '/reports/:id/data-entry/manual-row',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId non valido' });
      return;
    }

    const body = req.body as Record<string, unknown>;

    if (!body.dimensionValues || typeof body.dimensionValues !== 'object' || Array.isArray(body.dimensionValues)) {
      res.status(400).json({ error: 'dimensionValues è obbligatorio e deve essere un oggetto' });
      return;
    }
    const dimValues = body.dimensionValues as Record<string, unknown>;
    for (const [k, v] of Object.entries(dimValues)) {
      if (typeof k !== 'string' || k.length > 128) {
        res.status(400).json({ error: `Chiave dimensione non valida: "${k}"` });
        return;
      }
      if (typeof v !== 'string') {
        res.status(400).json({ error: `Valore dimensione non valido per "${k}"` });
        return;
      }
    }

    const dto: InsertManualRowDto = { dimensionValues: dimValues as Record<string, string> };

    const userId: string =
      (req as Request & { user?: { sub?: string; userId?: string } }).user?.sub ??
      (req as Request & { user?: { sub?: string; userId?: string } }).user?.userId ??
      'system';

    try {
      await insertManualRow(reportId, dto, userId);
      res.json({ ok: true });
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 400) { res.status(400).json({ error: (err as Error).message }); return; }
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

export default router;
