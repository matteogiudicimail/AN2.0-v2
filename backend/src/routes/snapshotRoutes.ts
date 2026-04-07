/**
 * Snapshot Routes — endpoints for the frozen-layout snapshot system.
 *
 * [V2] JWT required.
 * [V3] snapshotId validated as positive integer; DTO validated before service.
 * [V4] No stack traces in error responses.
 * [V6] Logic in snapshotService.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import {
  createSnapshot, getActiveSnapshot, getSnapshotGrid, saveSnapshotCell,
} from '../services/snapshotService';
import { SaveCellDto } from '../models/dataEntry.models';

const router = Router();

function getUserId(req: Request): string {
  return (req as Request & { user?: { sub?: string; userId?: string } }).user?.sub
    ?? (req as Request & { user?: { sub?: string; userId?: string } }).user?.userId
    ?? 'system';
}

// ── POST /tasks/:taskId/snapshot ──────────────────────────────────────────────
// Crea (o ricrea) uno snapshot per il task.

router.post(
  '/tasks/:taskId/snapshot',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const taskId = parseInt(req.params.taskId, 10);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      res.status(400).json({ error: 'taskId non valido' }); return;
    }
    const { reportId } = req.body as { reportId?: unknown };
    if (!reportId || typeof reportId !== 'number' || reportId <= 0) {
      res.status(400).json({ error: 'reportId è obbligatorio' }); return;
    }
    try {
      const snapshotId = await createSnapshot(taskId, reportId, getUserId(req));
      res.json({ snapshotId });
    } catch (err) { next(err); }
  },
);

// ── GET /tasks/:taskId/snapshot/active ────────────────────────────────────────
// Restituisce lo snapshot attivo per un task.

router.get(
  '/tasks/:taskId/snapshot/active',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const taskId = parseInt(req.params.taskId, 10);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      res.status(400).json({ error: 'taskId non valido' }); return;
    }
    try {
      const snap = await getActiveSnapshot(taskId);
      if (!snap) { res.status(404).json({ error: 'Nessuno snapshot attivo trovato' }); return; }
      res.json(snap);
    } catch (err) { next(err); }
  },
);

// ── GET /snapshots/:id/grid ───────────────────────────────────────────────────
// Carica la griglia dallo snapshot congelato.

router.get(
  '/snapshots/:id/grid',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const snapshotId = parseInt(req.params.id, 10);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      res.status(400).json({ error: 'snapshotId non valido' }); return;
    }
    try {
      const grid = await getSnapshotGrid(snapshotId);
      res.json(grid);
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── PUT /snapshots/:id/cell ───────────────────────────────────────────────────
// Salva il valore di una cella usando il layout congelato dello snapshot.

router.put(
  '/snapshots/:id/cell',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const snapshotId = parseInt(req.params.id, 10);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      res.status(400).json({ error: 'snapshotId non valido' }); return;
    }

    const body = req.body as Record<string, unknown>;

    if (!body.dimensionValues || typeof body.dimensionValues !== 'object' || Array.isArray(body.dimensionValues)) {
      res.status(400).json({ error: 'dimensionValues è obbligatorio e deve essere un oggetto' }); return;
    }
    const dimValues = body.dimensionValues as Record<string, unknown>;
    for (const [k, v] of Object.entries(dimValues)) {
      if (typeof k !== 'string' || k.length > 128 || typeof v !== 'string') {
        res.status(400).json({ error: `Valore dimensione non valido per "${k}"` }); return;
      }
    }

    if (!body.valoreField || typeof body.valoreField !== 'string' || body.valoreField.length > 128) {
      res.status(400).json({ error: 'valoreField è obbligatorio' }); return;
    }
    if (body.value === undefined || body.value === null) {
      res.status(400).json({ error: 'value è obbligatorio' }); return;
    }

    const dto: SaveCellDto = {
      dimensionValues: dimValues as Record<string, string>,
      valoreField:     body.valoreField as string,
      value:           String(body.value).slice(0, 4000),
    };

    try {
      await saveSnapshotCell(snapshotId, dto, getUserId(req));
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
