import * as dotenv from 'dotenv';

dotenv.config();

// Validate JWT configuration on startup — fail fast [OWASP A02, A07]
const jwtSecret    = process.env['JWT_SECRET']     ?? '';
const jwtPublicKey = process.env['JWT_PUBLIC_KEY'] ?? '';
if (!jwtSecret && !jwtPublicKey) {
  throw new Error('JWT_SECRET or JWT_PUBLIC_KEY must be set in environment variables');
}

// Validate SQL Server configuration
const dbServer   = process.env['DB_SERVER']   ?? '';
const dbDatabase = process.env['DB_DATABASE'] ?? '';
if (!dbServer || !dbDatabase) {
  throw new Error('DB_SERVER and DB_DATABASE must be set in environment variables');
}

const windowsAuth = (process.env['DB_WINDOWS_AUTH'] ?? 'false').toLowerCase() === 'true';

export const config = {
  port:    parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  jwt: {
    secret:    jwtSecret,
    publicKey: jwtPublicKey,
    issuer:    process.env['JWT_ISSUER']   ?? '',
    audience:  process.env['JWT_AUDIENCE'] ?? '',
    algorithm: jwtSecret ? ('HS256' as const) : ('RS256' as const),
  },

  db: {
    server:      dbServer,
    database:    dbDatabase,
    windowsAuth,
    user:        process.env['DB_USER']     ?? '',
    password:    process.env['DB_PASSWORD'] ?? '',
    encrypt:     (process.env['DB_ENCRYPT'] ?? 'false').toLowerCase() === 'true',
    poolMax:     parseInt(process.env['DB_POOL_MAX']     ?? '10', 10),
    poolMin:     parseInt(process.env['DB_POOL_MIN']     ?? '0',  10),
    poolIdleMs:  parseInt(process.env['DB_POOL_IDLE_MS'] ?? '30000', 10),
  },

  corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  mesaJwtSecret: process.env['MESA_JWT_SECRET'] ?? '',

  mesappa: {
    /** URL base dell'host MESAPPA per la registrazione delle voci menu Seaside.
     *  Es. http://mesappa-server:8080 — lasciare vuoto in sviluppo locale senza host. */
    hostUrl: (process.env['MESAPPA_HOST_URL'] ?? '').replace(/\/$/, ''),
    /** Chiave API per autorizzare le chiamate verso l'host MESAPPA. */
    apiKey:  process.env['MESAPPA_API_KEY'] ?? '',
  },

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;

export const isDev = (): boolean => config.nodeEnv !== 'production';

if (config.isProduction) {
  console.info('[config] Production mode active');
}
