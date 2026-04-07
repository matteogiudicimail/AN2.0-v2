# CFS Reporting Plugin — Deployment Guide

**Version:** 1.0
**Date:** 2026-03-26

---

## Overview

This guide covers deployment of the CFS Reporting Plugin in an on-premises MESAPPA environment.

**Architecture:**
```
[Browser / MESAPPA Host]
       │ Module Federation
       ▼
[IIS — static Angular files (port 80/443)]
       │ /api/* proxy
       ▼
[Node.js Express Backend (port 3000)]
       │ node:sqlite (POC) / mssql (production)
       ▼
[SQLite file (POC) / SQL Server on-prem (production)]
```

---

## Prerequisites

### Server Requirements
- Windows Server 2019+ or Windows 10/11
- Node.js 18 LTS (or 20 LTS)
- IIS 10+ with URL Rewrite module (for reverse proxy or static file serving)
- .NET Hosting Bundle (if using IIS in-process)
- NSSM 2.24+ (to run Node as a Windows Service) — download from https://nssm.cc

### For Production (SQL Server)
- SQL Server 2019+ on-prem or SQL Server Express
- Windows Authentication or SQL Auth user with minimum privileges:
  - `SELECT`, `INSERT`, `UPDATE` on `app_*` tables
  - `SELECT` on `tCFS_*` / `vCFS_*` views

---

## Step 1 — Repository Setup

```powershell
# Clone or extract the repository to a permanent location
cd C:\Apps
git clone <repo-url> CFS-Report
cd CFS-Report
```

---

## Step 2 — Backend Configuration

### 2a. Copy and configure .env

```powershell
cd C:\Apps\CFS-Report\backend
copy .env.example .env
notepad .env
```

Configure these required values:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Backend listen port | `3000` |
| `JWT_SECRET` | HMAC secret (≥32 chars) for dev/test | `<random-hex-64-chars>` |
| `JWT_PUBLIC_KEY` | RSA/EC public key for MESAPPA JWT validation | `<PEM or empty>` |
| `JWT_ISSUER` | Expected `iss` claim | `mesappa-host` |
| `JWT_AUDIENCE` | Expected `aud` claim | `cfs-report` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `https://mesappa.company.com` |
| `DB_PATH` | Path to SQLite file (POC only) | `./data/cfs.db` |
| `NODE_ENV` | `production` | `production` |

**Important (V1):** `.env` must NEVER be committed to version control.

### 2b. Install dependencies and build

```powershell
cd C:\Apps\CFS-Report\backend
npm ci --production=false
npm run build
```

### 2c. Verify build

```powershell
node dist/server.js
# Should print: [server] CFS API listening on http://localhost:3000 [production]
# Ctrl+C to stop
```

---

## Step 3 — Install Node Backend as Windows Service (NSSM)

```powershell
# Install NSSM service
nssm install CFS-Report-Backend "C:\Program Files\nodejs\node.exe" "C:\Apps\CFS-Report\backend\dist\server.js"
nssm set CFS-Report-Backend AppDirectory "C:\Apps\CFS-Report\backend"
nssm set CFS-Report-Backend AppEnvironmentExtra "NODE_ENV=production"
nssm set CFS-Report-Backend DisplayName "CFS Report Backend"
nssm set CFS-Report-Backend Description "CFS Reporting & Writeback API"
nssm set CFS-Report-Backend Start SERVICE_AUTO_START
nssm set CFS-Report-Backend AppStdout "C:\Apps\CFS-Report\logs\backend-out.log"
nssm set CFS-Report-Backend AppStderr "C:\Apps\CFS-Report\logs\backend-err.log"

# Create logs directory
New-Item -ItemType Directory -Path "C:\Apps\CFS-Report\logs" -Force

# Start the service
nssm start CFS-Report-Backend
```

### Verify service

```powershell
Get-Service CFS-Report-Backend
# Status should be: Running

# Smoke test
Invoke-RestMethod http://localhost:3000/api/health
# Expected: { status: 'ok', db: 'reachable' }
```

---

## Step 4 — Frontend Build

```powershell
cd C:\Apps\CFS-Report\frontend
npm ci
npx ng build cfs-report-shell --configuration production
```

Artefacts are in `frontend/dist/cfs-report-shell/`.

---

## Step 5 — IIS Configuration

### Option A: IIS serves frontend + reverse-proxies /api to Node

1. Install IIS URL Rewrite and ARR (Application Request Routing) modules.

2. Create an IIS site pointing to `C:\Apps\CFS-Report\frontend\dist\cfs-report-shell\`.

3. Add `web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- Proxy /api/* to Node backend -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:3000/api/{R:1}" />
        </rule>
        <!-- Angular HTML5 routing fallback -->
        <rule name="Angular Routes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

4. In IIS, enable ARR proxy at server level: `Application Request Routing` → `Enable proxy`.

### Option B: Separate IIS sites

- Frontend: IIS site on port 443, serving Angular static files.
- Backend: Node on port 3000, NOT exposed to internet, accessed only internally.
- Update `CORS_ORIGINS` in `.env` to include the frontend IIS URL.

---

## Step 6 — HTTPS / TLS

For production, always terminate TLS at IIS:

1. Obtain a certificate (Let's Encrypt, internal CA, or commercial).
2. Bind HTTPS on port 443 in IIS site bindings.
3. Add HTTP → HTTPS redirect rule.
4. Node backend runs on HTTP internally (localhost only) — no direct external access.

---

## Step 7 — Module Federation Integration with MESAPPA Host

1. The CFS plugin is exposed as a Module Federation remote. The remote entry URL is:
   ```
   https://<your-server>/remoteEntry.js
   ```

2. In the MESAPPA host's `webpack.config.js` or `module-federation.config.js`:
   ```javascript
   remotes: {
     'cfs-report': 'cfs_report@https://<your-server>/remoteEntry.js',
   }
   ```

3. Load `CfsReportModule` and pass `InputData`:
   ```typescript
   inputData = {
     token: mesappaJwtToken,  // JWT from MESAPPA auth
     apiBaseUrl: 'https://<your-server>/api',
     role: userRole,          // 'Viewer' | 'Editor' | 'Approver' | 'Admin'
     userId: userId,
   };
   ```

---

## Step 8 — POC → SQL Server Migration

When transitioning from SQLite to SQL Server:

1. **Install mssql driver:**
   ```
   npm install mssql msnodesqlv8
   ```

2. **Update `backend/.env`:**
   ```
   DB_TYPE=sqlserver
   DB_SERVER=.\SQLEXPRESS   # or your SQL Server instance
   DB_DATABASE=CFS_Reporting
   DB_TRUSTED_CONNECTION=true   # Windows Auth
   # Or for SQL Auth:
   # DB_USER=cfs_app_user
   # DB_PASSWORD=<from secrets manager>
   ```

3. **Replace `backend/src/config/db.ts`** — swap `DatabaseSync` for `mssql` ConnectionPool.

4. **Adapt SQL syntax:**
   - `?` parameters → `@param` named parameters
   - `INTEGER PRIMARY KEY AUTOINCREMENT` → `INT IDENTITY(1,1) PRIMARY KEY`
   - `TEXT` → `NVARCHAR(MAX)` or `NVARCHAR(n)`
   - `REAL` → `DECIMAL(18,2)`
   - `INTEGER DEFAULT 0/1` → `BIT DEFAULT 0/1`
   - `Version INTEGER` → Consider `ROWVERSION` for better concurrency

5. **Remove seed scripts** — `tCFS_*` and `vCFS_*` tables already exist in production SQL Server.

6. **Run DDL** for `app_*` tables (`sql/001_create_app_tables.sql`) adapted for SQL Server syntax.

---

## Deployment Script

Use the automated deploy script:

```powershell
cd C:\Apps\CFS-Report
.\scripts\deploy.ps1 -RestartService
# With deploy target:
.\scripts\deploy.ps1 -DeployTarget "\\server\share\cfs" -RestartService
```

---

## Post-Deploy Checklist

- [ ] `GET /api/health` returns `{"status":"ok","db":"reachable"}`
- [ ] Frontend loads at `https://<server>/`
- [ ] Filter panel populates (entities, processes, scopes, currencies)
- [ ] Report loads with correct P&L structure
- [ ] Negative values shown in red (F08)
- [ ] Tree expand/collapse works (F02)
- [ ] Cell edit persists on reload (F05)
- [ ] Aggregate edit creates synthetic row (F06/F07)
- [ ] Conflict dialog appears on concurrent edit (F11)
- [ ] Cell history right-click works (F13)
- [ ] Process lock rejects edits (F15)
- [ ] HTTPS in place; HTTP redirects to HTTPS
- [ ] CORS only allows MESAPPA origin (no `*`)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Backend not starting | Check `logs/backend-err.log`; verify `.env` exists and `NODE_ENV=production` |
| DB not reachable | Check `DB_PATH` file exists and is writable; for SQL Server: check Windows Auth / credentials |
| CORS errors in browser | Add frontend URL to `CORS_ORIGINS` in `.env` |
| JWT 401 errors | Check `JWT_SECRET` / `JWT_PUBLIC_KEY` matches MESAPPA host; verify `JWT_ISSUER` and `JWT_AUDIENCE` |
| Module Federation fails to load | Check `remoteEntry.js` URL accessible; verify Angular version compatibility |
| Budget warnings in build | Non-blocking; SCSS can be optimised if needed |

---

## Security Hardening (Production)

- Run Node service under a dedicated service account with minimum OS privileges.
- Set filesystem permissions: only service account can read `.env` and `data/*.db`.
- Enable Windows Firewall: port 3000 accessible only from localhost (IIS on same server).
- Rotate `JWT_SECRET` / `JWT_PUBLIC_KEY` on a schedule.
- Monitor `logs/` for repeated 401/403/500 responses (possible attack).
- Backup `data/cfs.db` (SQLite) or `app_*` tables (SQL Server) daily.
