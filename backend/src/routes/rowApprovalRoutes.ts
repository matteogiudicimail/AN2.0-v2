/**
 * Row Approval Routes — manage per-row approval flags for the data-entry grid.
 *
 * [V2] All endpoints require JWT.
 * [V3] reportId validated as integer; DTO validated before service call.
 * [V4] No internals in error responses.
 * [V6] Logic in rowApprovalService.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import {
  getRowApprovalsArray, setRowApproval, bulkSetRowApproval,
} from '../services/rowApprovalService';

const router = Router();

// Extract userId from JWT [V2]
function extractUserId(req: Request): string {
  const u = (req as Request & { user?: { sub?: string; userId?: string } }).user;
  return u?.sub ?? u?.userId ?? 'system';
}

// ── GET /reports/:id/data-entry/row-approvals ────────────────────────────────

router.get(
  '/reports/:id/data-entry/row-approvals',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId non valido' });
      return;
    }
    try {
      const rows = await getRowApprovalsArray(reportId);
      res.json({ approvedRows: rows });
    } catch (err) { next(err); }
  },
);

// ── PUT /reports/:id/data-entry/row-approval ─────────────────────────────────

router.put(
  '/reports/:id/data-entry/row-approval',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId non valido' });
      return;
    }

    const body = req.body as Record<string, unknown>;

    // Validate dimensionsJson
    if (!body.dimensionsJson || typeof body.dimensionsJson !== 'string' || body.dimensionsJson.length > 8000) {
      res.status(400).json({ error: 'dimensionsJson è obbligatorio (stringa ≤ 8000 char)' });
      return;
    }
    // Must be valid JSON
    try { JSON.parse(body.dimensionsJson as string); } catch {
      res.status(400).json({ error: 'dimensionsJson deve essere JSON valido' });
      return;
    }

    // Validate approved flag
    if (typeof body.approved !== 'boolean') {
      res.status(400).json({ error: 'approved deve essere boolean' });
      return;
    }

    try {
      await setRowApproval(reportId, body.dimensionsJson as string, body.approved as boolean, extractUserId(req));
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

// ── PUT /reports/:id/data-entry/row-approval/bulk ────────────────────────────

router.put(
  '/reports/:id/data-entry/row-approval/bulk',
  authJwt,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      res.status(400).json({ error: 'reportId non valido' });
      return;
    }

    const body = req.body as Record<string, unknown>;

    if (!Array.isArray(body.dimensionsJsonArray) || body.dimensionsJsonArray.length === 0) {
      res.status(400).json({ error: 'dimensionsJsonArray deve essere un array non vuoto' });
      return;
    }
    if (body.dimensionsJsonArray.length > 1000) {
      res.status(400).json({ error: 'dimensionsJsonArray: massimo 1000 elementi per richiesta' });
      return;
    }
    for (const item of body.dimensionsJsonArray as unknown[]) {
      if (typeof item !== 'string' || item.length > 8000) {
        res.status(400).json({ error: 'Ogni elemento di dimensionsJsonArray deve essere una stringa ≤ 8000 char' });
        return;
      }
      try { JSON.parse(item); } catch {
        res.status(400).json({ error: 'Ogni elemento deve essere JSON valido' });
        return;
      }
    }

    if (typeof body.approved !== 'boolean') {
      res.status(400).json({ error: 'approved deve essere boolean' });
      return;
    }

    try {
      await bulkSetRowApproval(
        reportId,
        body.dimensionsJsonArray as string[],
        body.approved as boolean,
        extractUserId(req),
      );
      res.json({ ok: true, count: (body.dimensionsJsonArray as string[]).length });
    } catch (err) { next(err); }
  },
);

export default router;
