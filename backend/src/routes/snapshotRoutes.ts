/**
 * Snapshot Routes — endpoints for the frozen-layout snapshot system.
 *
 * [V2] JWT required.
 * [V3] snapshotId validated as positive integer; DTO validated before service.
 * [V4] No stack traces in error responses.
 * [V6] Logic in snapshotService.
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authJwt } from '../middleware/authJwt';
import {
  createSnapshot, getActiveSnapshot, getSnapshot, getSnapshotGrid, saveSnapshotCell,
} from '../services/snapshotService';
import { getTask } from '../services/taskService';
import { exportSnapshotExcel, importSnapshotExcel } from '../services/snapshotExcelService';
import { getCellHistory } from '../services/dataEntryCellService';
import { SaveCellDto } from '../models/dataEntry.models';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB
  fileFilter: (_req, file, cb) => {
    const validMime = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const validExt  = file.originalname.toLowerCase().endsWith('.xlsx');
    if (validMime || validExt) cb(null, true);
    else cb(new Error('Solo file .xlsx accettati'));
  },
});

/** Controlla se userId è fra i writers del task (lista CSV). Aperto a tutti se lista vuota. */
function canWrite(accessWriters: string | null | undefined, userId: string): boolean {
  if (!accessWriters) return true;
  const writers = accessWriters.split(',').map(s => s.trim()).filter(Boolean);
  return writers.length === 0 || writers.includes(userId);
}

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
      const e = err as Error & { statusCode?: number; number?: number };
      if (e.statusCode === 400) { res.status(400).json({ error: e.message }); return; }
      if (e.statusCode === 404) { res.status(404).json({ error: e.message }); return; }
      // SQL Server constraint errors (e.g. NOT NULL, FK violation) — surface as 400
      if (e.number && e.number >= 515 && e.number <= 550) {
        res.status(400).json({ error: `Vincolo database: ${e.message}` }); return;
      }
      next(err);
    }
  },
);

// ── POST /snapshots/:id/excel/export ─────────────────────────────────────────
// Genera un file .xlsx esportabile per la griglia dello snapshot.
// Body: { mode: 'grid' | 'pivot', filters: Record<string, string> }

router.post(
  '/snapshots/:id/excel/export',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const snapshotId = parseInt(req.params.id, 10);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      res.status(400).json({ error: 'snapshotId non valido' }); return;
    }
    const body = req.body as { mode?: string; filters?: unknown };
    const mode = body.mode === 'pivot' ? 'pivot' : 'grid';
    const filters = (typeof body.filters === 'object' && body.filters && !Array.isArray(body.filters))
      ? body.filters as Record<string, string>
      : {};
    try {
      const snap = await getSnapshot(snapshotId);
      if (!snap) { res.status(404).json({ error: 'Snapshot non trovato' }); return; }
      const task  = await getTask(snap.taskId);
      const label = task?.label ?? `Snapshot ${snapshotId}`;
      const grid  = await getSnapshotGrid(snapshotId);
      const buffer = await exportSnapshotExcel({ snapshotId, taskLabel: label, mode, filters, grid });
      const safe   = label.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40);
      const modeTag = mode === 'pivot' ? 'Pivot' : 'Griglia';
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="ESG_Snap${snapshotId}_${safe}_${modeTag}.xlsx"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── POST /snapshots/:id/excel/import ─────────────────────────────────────────
// Importa un file .xlsx precedentemente esportato dal sistema.
// Riservato ai writers del task (accessWriters). [V2]

router.post(
  '/snapshots/:id/excel/import',
  authJwt,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const snapshotId = parseInt(req.params.id, 10);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      res.status(400).json({ error: 'snapshotId non valido' }); return;
    }
    if (!req.file) { res.status(400).json({ error: 'File mancante (campo "file")' }); return; }
    const userId = getUserId(req);
    try {
      const snap = await getSnapshot(snapshotId);
      if (!snap) { res.status(404).json({ error: 'Snapshot non trovato' }); return; }
      const task = await getTask(snap.taskId);
      if (!canWrite(task?.accessWriters, userId)) {
        res.status(403).json({ error: 'Non sei autorizzato a modificare questo report' }); return;
      }
      const result = await importSnapshotExcel(
        snapshotId,
        req.file.buffer,
        (dto: SaveCellDto) => saveSnapshotCell(snapshotId, dto, userId),
      );
      res.json(result);
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 400) { res.status(400).json({ error: (err as Error).message }); return; }
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      next(err);
    }
  },
);

// ── POST /snapshots/:id/cell-history ─────────────────────────────────────────
// Restituisce lo storico degli inserimenti per una cella dello snapshot.

router.post(
  '/snapshots/:id/cell-history',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const snapshotId = parseInt(req.params.id, 10);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      res.status(400).json({ error: 'snapshotId non valido' }); return;
    }

    const body = req.body as Record<string, unknown>;

    if (!body.dimensionValues || typeof body.dimensionValues !== 'object' || Array.isArray(body.dimensionValues)) {
      res.status(400).json({ error: 'dimensionValues è obbligatorio' }); return;
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

    try {
      const snap = await getSnapshot(snapshotId);
      if (!snap) { res.status(404).json({ error: 'Snapshot non trovato' }); return; }

      const history = await getCellHistory(
        snap.reportId,
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

export default router;
