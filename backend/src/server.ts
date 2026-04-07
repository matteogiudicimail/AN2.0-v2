/**
 * CFS Reporting & Writeback — Express entry point
 *
 * Security measures:
 *  OWASP A05 — helmet(), explicit CORS whitelist, no X-Powered-By, body size limit
 *  V10        — CORS: explicit whitelist from CORS_ORIGINS env, never *
 *  V4         — Central error handler (no stack traces to client)
 *  V2         — authJwt middleware applied to all routes except /health
 */
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { initPool, closePool } from './config/db';
import { runSeed } from './config/seed';
import apiRoutes from './routes/index';
import { errorHandler } from './middleware/errorHandler';

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

// ── Routes ────────────────────────────────────────────────────────────────────
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
    await initPool();
    if (process.env['SKIP_SEED'] !== 'true') {
      await runSeed();
    } else {
      console.log('[seed] SKIP_SEED=true — seed saltato');
    }
  } catch (err) {
    console.error('[startup] Initialisation failed. Server will not start.', err);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[server] CFS API listening on http://localhost:${config.port} [${config.nodeEnv}]`);
    console.log(`[server] CORS origins: ${config.corsOrigins.join(', ')}`);
  });

  // Graceful shutdown
  async function shutdown(signal: string): Promise<void> {
    console.log(`[server] ${signal} received — shutting down`);
    server.close(async () => {
      await closePool();
      console.log('[server] Shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { shutdown('SIGINT'); });
}

start();

export default app;
