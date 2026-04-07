/**
 * SQL Server connection pool via mssql.
 *
 * Authentication:
 *   - Windows Auth (primary, on-prem): DB_WINDOWS_AUTH=true
 *     The Node process must run under a Windows account authorised on SQL Server.
 *   - SQL Auth (fallback): DB_WINDOWS_AUTH=false + DB_USER + DB_PASSWORD
 *
 * Pool is a singleton — created on first call to getPool().
 * Call initPool() on startup to surface connection errors early.
 *
 * [V3] All consumer queries must use parameterised statements via dbHelpers.
 * [V4] healthCheck() never throws — returns false on any error.
 */
import sql from 'mssql';
import { config } from './env';

let _pool: sql.ConnectionPool | null = null;

function buildPoolConfig(): sql.config {
  const base: sql.config = {
    server:   config.db.server,
    database: config.db.database,
    options: {
      trustServerCertificate: true,
      enableArithAbort:       true,
    },
    pool: {
      max:             config.db.poolMax,
      min:             config.db.poolMin,
      idleTimeoutMillis: config.db.poolIdleMs,
    },
  };

  if (config.db.windowsAuth) {
    return {
      ...base,
      options: {
        ...base.options,
        trustedConnection: true,
      },
    };
  }

  if (!config.db.user || !config.db.password) {
    throw new Error('[db] SQL Auth requires DB_USER and DB_PASSWORD when DB_WINDOWS_AUTH=false');
  }

  return {
    ...base,
    user:     config.db.user,
    password: config.db.password,
    options: {
      ...base.options,
      encrypt: config.db.encrypt,
    },
  };
}

/**
 * Returns the singleton connection pool.
 * Connects on first call; subsequent calls return the existing pool.
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (!_pool || !_pool.connected) {
    _pool = await new sql.ConnectionPool(buildPoolConfig()).connect();
    _pool.on('error', (err: Error) => {
      console.error('[db] Pool error:', err.message);
    });
    console.log(`[db] Connected to SQL Server: ${config.db.server}/${config.db.database}`);
  }
  return _pool;
}

/**
 * Explicit startup: call in server.ts to fail fast on bad credentials.
 */
export async function initPool(): Promise<void> {
  await getPool();
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
    console.log('[db] Pool closed');
  }
}

/**
 * Health check — returns true if DB is reachable. Never throws. [V4]
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    return true;
  } catch {
    return false;
  }
}
