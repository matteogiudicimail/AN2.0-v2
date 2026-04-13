/**
 * Entry Layout Routes — configurazione scheda data entry.
 *
 * GET  /configurator/reports/:id/entry-layout  → layout corrente (null se assente)
 * PUT  /configurator/reports/:id/entry-layout  → crea o aggiorna il layout
 *
 * [V2] JWT obbligatorio.
 * [V3] reportId validato come intero; ConfigJson validato come oggetto.
 * [V4] Nessun dettaglio interno nelle risposte di errore.
 * [V6] Logica di business in entryLayoutService.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authJwt } from '../middleware/authJwt';
import * as svc from '../services/entryLayoutService';
import { EntryAxisItem, EntryValueItem, EntryLayoutConfig, AggregationFn } from '../models/entryLayout.models';

const router = Router();
router.use(authJwt);

function uid(req: Request): string { return req.user!.sub; }

function parsePositiveInt(s: string | undefined, name: string): number {
  const n = parseInt(s ?? '0', 10);
  if (!n || n <= 0 || !Number.isFinite(n)) {
    const e = new Error(`${name} deve essere un intero positivo`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  return n;
}

/** Basic structural validation for an axis item array. */
function validateAxisItems(items: unknown, zone: string): EntryAxisItem[] {
  if (!Array.isArray(items)) throw Object.assign(new Error(`${zone} deve essere un array`), { statusCode: 400 });
  return items.map((item: unknown, i) => {
    const it = item as Record<string, unknown>;
    if (typeof it['fieldName'] !== 'string' || !it['fieldName'].trim()) {
      throw Object.assign(new Error(`${zone}[${i}].fieldName mancante`), { statusCode: 400 });
    }
    const dimTableRaw      = it['dimTable'];
    const lockedMembersRaw = it['lockedMembers'];
    const skipDepthsRaw    = it['skipDepths'];
    const hierDefIdRaw     = it['hierarchyDefId'];
    const roleRaw          = it['role'];
    const defaultValueRaw  = it['defaultValue'];
    const base: EntryAxisItem = {
      fieldName:    it['fieldName'].trim().slice(0, 128),
      label:        String(it['label'] ?? it['fieldName']).slice(0, 200),
      paramTableId: typeof it['paramTableId'] === 'number' ? it['paramTableId'] : null,
      dimTable:     (typeof dimTableRaw === 'string' && dimTableRaw.trim())
                      ? dimTableRaw.trim().slice(0, 200)
                      : null,
    };
    if (Array.isArray(lockedMembersRaw) && lockedMembersRaw.length > 0) {
      base.lockedMembers = lockedMembersRaw
        .filter((m): m is string => typeof m === 'string')
        .map((s) => s.slice(0, 500));
    }
    if (typeof skipDepthsRaw === 'number' && skipDepthsRaw > 0) {
      base.skipDepths = Math.floor(skipDepthsRaw);
    }
    if (typeof hierDefIdRaw === 'number' && hierDefIdRaw > 0) {
      base.hierarchyDefId = Math.floor(hierDefIdRaw);
    }
    if (roleRaw === 'grouping' || roleRaw === 'detail') {
      base.role = roleRaw;
    }
    if (typeof defaultValueRaw === 'string' && defaultValueRaw.trim()) {
      base.defaultValue = defaultValueRaw.trim().slice(0, 500);
    }
    return base;
  });
}

const VALID_AGG: AggregationFn[] = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'NONE'];

/** Basic structural validation for a value item array. */
function validateValueItems(items: unknown): EntryValueItem[] {
  if (!Array.isArray(items)) throw Object.assign(new Error(`valori deve essere un array`), { statusCode: 400 });
  return items.map((item: unknown, i) => {
    const it = item as Record<string, unknown>;
    if (typeof it['fieldName'] !== 'string' || !it['fieldName'].trim()) {
      throw Object.assign(new Error(`valori[${i}].fieldName mancante`), { statusCode: 400 });
    }
    const agg = it['aggregation'];
    return {
      fieldName:   it['fieldName'].trim().slice(0, 128),
      label:       String(it['label'] ?? it['fieldName']).slice(0, 200),
      aggregation: VALID_AGG.includes(agg as AggregationFn) ? (agg as AggregationFn) : 'SUM',
    };
  });
}

// ── GET /reports/:id/entry-layout ──────────────────────────────────────────────

router.get('/reports/:id/entry-layout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parsePositiveInt(req.params['id'], 'reportId');
    const layout = await svc.getEntryLayout(id);
    if (!layout) { res.status(404).json({ error: 'Entry layout non trovato' }); return; }
    res.json(layout);
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode && err.statusCode < 500) { res.status(err.statusCode).json({ error: err.message }); return; }
    next(e);
  }
});

// ── PUT /reports/:id/entry-layout ──────────────────────────────────────────────

router.put('/reports/:id/entry-layout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parsePositiveInt(req.params['id'], 'reportId');
    const body = req.body as Record<string, unknown>;

    if (!body['config'] || typeof body['config'] !== 'object') {
      res.status(400).json({ error: 'config è obbligatorio' }); return;
    }

    const raw = body['config'] as Record<string, unknown>;
    const config: EntryLayoutConfig = {
      filtri:  validateAxisItems(raw['filtri']  ?? [], 'filtri'),
      righe:   validateAxisItems(raw['righe']   ?? [], 'righe'),
      colonne: validateAxisItems(raw['colonne'] ?? [], 'colonne'),
      valori:  validateValueItems(raw['valori'] ?? []),
    };

    const saved = await svc.upsertEntryLayout(id, config, uid(req));
    res.json(saved);
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode && err.statusCode < 500) { res.status(err.statusCode).json({ error: err.message }); return; }
    next(e);
  }
});

export default router;
