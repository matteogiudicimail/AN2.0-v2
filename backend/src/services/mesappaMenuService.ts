/**
 * MESAPPA Menu Service — registra / revoca voci di menu nel sistema MESAPPA host.
 *
 * L'host MESAPPA espone l'API /admin/navigation (NavigationItem) per la gestione
 * dinamica delle voci di menu. Questo servizio chiama quell'API al momento
 * dell'attivazione/archiviazione di un Task ESG.
 *
 * Quando un task ha parentMenuCode impostato (es. "cfs-report"), viene creata una
 * voce di navigazione figlia sotto quel nodo; altrimenti il task appare nella
 * sezione "ESG Reports" della sidebar tramite il listing dei task attivi.
 *
 * Configurazione richiesta (.env):
 *   MESAPPA_HOST_URL  — URL base dell'host, es. http://mesappa-server:8080
 *   MESAPPA_API_KEY   — chiave API per autorizzare le chiamate verso l'host
 *
 * Se MESAPPA_HOST_URL non è impostato il servizio registra un warning e
 * restituisce senza errore (compatibilità ambienti di sviluppo). [V4]
 */

import https from 'https';
import http  from 'http';
import { URL } from 'url';
import { config } from '../config/env';

// ── Configurazione ─────────────────────────────────────────────────────────────

const MESAPPA_HOST_URL = config.mesappa.hostUrl;
const MESAPPA_API_KEY  = config.mesappa.apiKey;

// ── HTTP helper ────────────────────────────────────────────────────────────────

interface CallResult { ok: boolean; data?: unknown }

function callMesappa(
  method:  'GET' | 'POST' | 'DELETE',
  path:    string,
  body?:   unknown,
): Promise<CallResult> {
  if (!MESAPPA_HOST_URL) {
    console.warn('[mesappaMenu] MESAPPA_HOST_URL non configurato — skip');
    return Promise.resolve({ ok: false });
  }

  return new Promise((resolve) => {
    const url      = new URL(path, MESAPPA_HOST_URL + '/');
    const isHttps  = url.protocol === 'https:';
    const bodyStr  = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = {
      'Content-Type':   'application/json',
      'X-Api-Key':      MESAPPA_API_KEY,
      'Content-Length': Buffer.byteLength(bodyStr).toString(),
    };

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers,
    };

    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk: string) => { raw += chunk; });
      res.on('end', () => {
        const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
        if (!ok) console.warn(`[mesappaMenu] HTTP ${res.statusCode} per ${method} ${path}`);
        let data: unknown;
        try { data = raw ? JSON.parse(raw) : undefined; } catch { data = undefined; }
        resolve({ ok, data });
      });
    });

    req.on('error', (err: Error) => {
      console.error(`[mesappaMenu] Errore rete verso MESAPPA host: ${err.message}`);
      resolve({ ok: false });
    });

    req.setTimeout(5000, () => {
      console.error('[mesappaMenu] Timeout chiamata MESAPPA host');
      req.destroy();
      resolve({ ok: false });
    });

    if (bodyStr && method !== 'GET') req.write(bodyStr);
    req.end();
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Finds the numeric NavigationItem id for a given menuKey, or null if not found. */
async function findNavItemId(menuKey: string): Promise<number | null> {
  const result = await callMesappa('GET', '/api/admin/navigation');
  if (!result.ok || !Array.isArray(result.data)) return null;
  const items = result.data as Array<{ id: number; menuKey: string }>;
  return items.find((i) => i.menuKey === menuKey)?.id ?? null;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MenuEnsureResult {
  /** Whether a POST to the host was actually attempted. */
  attempted:     boolean;
  /** True if the item is now present in the nav tree (created or already existed). */
  registered:    boolean;
  /** True if the item was found to already exist before we attempted to create it. */
  alreadyExisted: boolean;
  /** Human-readable reason when attempted=false or registered=false. Null on success. */
  skippedReason: string | null;
}

// ── API pubblica ───────────────────────────────────────────────────────────────

/**
 * Registra una voce di menu nel sistema MESAPPA per il task attivato.
 *
 * Se parentMenuCode è impostato → crea un NavigationItem figlio sotto quel nodo.
 * Se parentMenuCode è null/vuoto → nessun NavigationItem viene creato; il task
 * apparirà automaticamente nella sezione "ESG Reports" della sidebar tramite
 * l'endpoint /cfs-api/tasks?status=Active&domain=ESG.
 *
 * Non lancia eccezioni — eventuali errori sono solo loggati.
 */
export async function registerMenuItem(task: {
  taskId:         number;
  taskCode:       string;
  label:          string;
  reportId:       number;
  menuItemCode:   string | null;
  parentMenuCode: string | null;
  routeUrl:       string | null;
  contextFilters: Record<string, unknown> | null;
  allowedRoles:   string | null;
}): Promise<void> {
  if (!task.menuItemCode) {
    console.warn(`[mesappaMenu] Task ${task.taskCode}: menuItemCode non impostato — skip`);
    return;
  }

  // Without parentMenuCode the task surfaces via the tasks listing API — nothing to do here.
  if (!task.parentMenuCode) return;

  const parentId = await findNavItemId(task.parentMenuCode);
  if (parentId === null) {
    console.warn(`[mesappaMenu] parentMenuCode "${task.parentMenuCode}" non trovato nell'albero di navigazione`);
    return;
  }

  // Auto-generate route if not explicitly set
  const route = task.routeUrl ?? `/esg-task/${task.taskId}`;

  const ok = await callMesappa('POST', '/api/admin/navigation', {
    menuKey:   task.menuItemCode,
    label:     task.label,
    route,
    parentId,
    isActive:  true,
    sortOrder: 999,
  });

  if (ok.ok) {
    console.info(`[mesappaMenu] Voce menu "${task.menuItemCode}" registrata sotto "${task.parentMenuCode}"`);
  }
}

/**
 * Revoca la voce di menu associata al task archiviato.
 * Trova il NavigationItem per menuKey e lo elimina.
 * Non lancia eccezioni — eventuali errori sono solo loggati.
 */
export async function revokeMenuItem(menuItemCode: string | null): Promise<void> {
  if (!menuItemCode) return;

  const id = await findNavItemId(menuItemCode);
  if (id === null) {
    // Item doesn't exist in nav tree (was in ESG section, not registered) — nothing to do.
    return;
  }

  const ok = await callMesappa('DELETE', `/api/admin/navigation/${id}`);
  if (ok.ok) {
    console.info(`[mesappaMenu] Voce menu "${menuItemCode}" (id=${id}) revocata dall'host`);
  }
}

/**
 * Idempotent menu registration used by the repair endpoint.
 *
 * Unlike `registerMenuItem` (fire-and-forget, void), this function:
 *  - checks preconditions and returns a precise skip reason when they fail
 *  - checks whether the nav item already exists before posting (no duplicate creation)
 *  - returns a structured result so the caller can report exact state to the admin
 *
 * Does NOT throw — all failures are encoded in the result.
 */
export async function ensureMenuItemRegistered(task: {
  taskId:         number;
  taskCode:       string;
  label:          string;
  menuItemCode:   string | null;
  parentMenuCode: string | null;
  routeUrl:       string | null;
}): Promise<MenuEnsureResult> {
  const SKIP = (reason: string): MenuEnsureResult =>
    ({ attempted: false, registered: false, alreadyExisted: false, skippedReason: reason });

  if (!task.menuItemCode) {
    return SKIP('menuItemCode non impostato');
  }
  if (!task.parentMenuCode) {
    return SKIP('parentMenuCode non impostato — task visibile nella sezione ESG Reports senza voce di navigazione dedicata');
  }
  if (!MESAPPA_HOST_URL) {
    return SKIP('MESAPPA_HOST_URL non configurato');
  }

  // Idempotency: item already registered — do not post a duplicate.
  let existingId: number | null = null;
  try { existingId = await findNavItemId(task.menuItemCode); } catch { /* treat as null */ }
  if (existingId !== null) {
    return { attempted: false, registered: true, alreadyExisted: true, skippedReason: null };
  }

  // Resolve parent node.
  let parentId: number | null = null;
  try { parentId = await findNavItemId(task.parentMenuCode); } catch { /* treat as null */ }
  if (parentId === null) {
    return {
      attempted: true, registered: false, alreadyExisted: false,
      skippedReason: `parentMenuCode "${task.parentMenuCode}" non trovato nell'albero di navigazione`,
    };
  }

  const route  = task.routeUrl ?? `/esg-task/${task.taskId}`;
  const result = await callMesappa('POST', '/api/admin/navigation', {
    menuKey:   task.menuItemCode,
    label:     task.label,
    route,
    parentId,
    isActive:  true,
    sortOrder: 999,
  });

  if (result.ok) {
    console.info(`[mesappaMenu] Repair: voce menu "${task.menuItemCode}" registrata sotto "${task.parentMenuCode}"`);
  } else {
    console.warn(`[mesappaMenu] Repair: registrazione fallita per "${task.menuItemCode}"`);
  }

  return {
    attempted:     true,
    registered:    result.ok,
    alreadyExisted: false,
    skippedReason: result.ok ? null : 'Chiamata HTTP al host MESAPPA fallita o risposta non 2xx',
  };
}
