/**
 * CFS Reporting & Writeback + MESA Data Collection — Express entry point
 *
 * Security:
 *  OWASP A05 — helmet(), explicit CORS whitelist, no X-Powered-By, body size limit
 *  V10        — CORS: explicit whitelist from CORS_ORIGINS env, never *
 *  V4         — Central error handler (no stack traces to client)
 *  V2         — authJwt on CFS routes, authMesa on MESA routes
 */
import 'reflect-metadata'; // Required for TypeORM decorators
import http from 'http';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { initPool, closePool } from './config/db';
import { runSchemaMigrations } from './config/schemaMigrations';
import { initMesaDb, closeMesaDb } from './config/mesaDb';
import { runSeed } from './config/seed';
import { initRealtime } from './services/mesa/realtimeGateway';
import apiRoutes from './routes/index';
import { errorHandler } from './middleware/errorHandler';

// MESA routes requiring mergeParams (nested :reportId/:sectionId params)
import mesaDataEntryRoutes from './routes/mesa/dataEntryRoutes';
import mesaExcelRoutes     from './routes/mesa/excelRoutes';
import mesaCommentsRoutes  from './routes/mesa/commentsRoutes';

const app: Application = express();

// ── Security headers [OWASP A05] ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.disable('x-powered-by');

// ── CORS whitelist [V10, OWASP A05] ──────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin && !config.isProduction) return callback(null, true);
    if (origin && config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing [OWASP A04] ─────────────────────────────────────────────────
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));

// ── MESA nested routes (mergeParams) ─────────────────────────────────────────
// These must be registered before the main apiRoutes to correctly resolve
// :reportId/:sectionId params across nested routers.
app.use('/api/reports/:reportId/sections/:sectionId',         mesaDataEntryRoutes);
app.use('/api/reports/:reportId/sections/:sectionId/excel',   mesaExcelRoutes);
app.use('/api/reports/:reportId/sections/:sectionId/comments', mesaCommentsRoutes);

// ── Main routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Centralised error handler [V4] ───────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  errorHandler(err, req, res, next);
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    // CFS database (mssql pool)
    await initPool();
    await runSchemaMigrations();
    if (process.env['SKIP_SEED'] !== 'true') {
      await runSeed();
    } else {
      console.log('[seed] SKIP_SEED=true — seed CFS saltato');
    }

    // MESA database (TypeORM + mssql)
    if (process.env['MESA_DB_SERVER']) {
      await initMesaDb();
    } else {
      console.warn('[mesa-db] MESA_DB_SERVER non configurato — funzionalità MESA disabilitate');
    }
  } catch (err) {
    console.error('[startup] Initialisation failed. Server will not start.', err);
    process.exit(1);
  }

  const httpServer = http.createServer(app);

  // ── Socket.io realtime (MESA) ──────────────────────────────────────────────
  const corsOrigins = config.corsOrigins;
  initRealtime(httpServer, corsOrigins);

  httpServer.listen(config.port, () => {
    console.log(`[server] CFS + MESA API listening on http://localhost:${config.port} [${config.nodeEnv}]`);
    console.log(`[server] CORS origins: ${corsOrigins.join(', ')}`);
  });

  // Graceful shutdown
  async function shutdown(signal: string): Promise<void> {
    console.log(`[server] ${signal} received — shutting down`);
    httpServer.close(async () => {
      await Promise.all([closePool(), closeMesaDb()]);
      console.log('[server] Shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void shutdown('SIGINT'); });
}

void start();

export default app;
