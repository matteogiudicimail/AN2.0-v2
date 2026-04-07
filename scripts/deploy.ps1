# ============================================================
# deploy.ps1 — Production build and deployment script
#
# Usage:
#   .\deploy.ps1                         # Full build + deploy
#   .\deploy.ps1 -BackendOnly            # Backend only
#   .\deploy.ps1 -FrontendOnly           # Frontend only
#   .\deploy.ps1 -SkipInstall            # Skip npm ci (faster if deps unchanged)
#   .\deploy.ps1 -RestartService         # Restart Node service after deploy
#
# Prerequisites:
#   - Node.js 18+, npm
#   - NSSM or pm2 installed (for service restart)
#   - .env configured in backend/ (real secrets, NOT .env.example values)
#
# No hardcoded absolute paths: uses $PSScriptRoot [V8, scripts rule]
# ============================================================
[CmdletBinding()]
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$SkipInstall,
    [switch]$RestartService,
    [string]$ServiceName = "CFS-Report-Backend",
    [string]$DeployTarget = ""   # Optional: path to copy artefacts to (e.g. \\server\share\cfs)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root     = Split-Path -Parent $PSScriptRoot
$Backend  = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Dist     = Join-Path $Root "dist"

$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " CFS Reporting — Production Deploy"          -ForegroundColor Cyan
Write-Host " $Timestamp"                                 -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# ── Validate environment ───────────────────────────────────────────────────────

$BackendEnv = Join-Path $Backend ".env"
if (-not (Test-Path $BackendEnv)) {
    Write-Error "backend/.env not found. Copy .env.example and configure real values before deploying."
    exit 1
}

# Warn if .env still contains placeholder values (V1 check)
$EnvContent = Get-Content $BackendEnv -Raw
if ($EnvContent -match "CHANGE_ME" -or $EnvContent -match "your_secret_here") {
    Write-Warning "backend/.env appears to contain placeholder values. Confirm secrets are real before deploying!"
    $confirm = Read-Host "Continue? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") { exit 1 }
}

# ── Backend build ─────────────────────────────────────────────────────────────

if (-not $FrontendOnly) {
    Write-Host ""
    Write-Host "[1/4] Building backend..." -ForegroundColor Yellow

    Push-Location $Backend

    if (-not $SkipInstall) {
        Write-Host "  npm ci..."
        npm ci --prefer-offline
        if ($LASTEXITCODE -ne 0) { Write-Error "npm ci failed"; exit 1 }
    }

    Write-Host "  tsc (TypeScript compile)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Backend TypeScript build failed"; exit 1 }

    Pop-Location

    # Copy backend artefacts to dist/backend
    $DistBackend = Join-Path $Dist "backend"
    if (-not (Test-Path $DistBackend)) { New-Item -ItemType Directory -Path $DistBackend | Out-Null }
    Copy-Item (Join-Path $Backend "dist")   -Destination (Join-Path $DistBackend "dist")  -Recurse -Force
    Copy-Item (Join-Path $Backend "package.json") -Destination $DistBackend -Force
    Copy-Item (Join-Path $Backend "package-lock.json") -Destination $DistBackend -Force
    # NOTE: .env is NOT copied — must be configured at target server [V1]
    Write-Host "  Backend artefacts → dist/backend/" -ForegroundColor Green
}

# ── Frontend build ─────────────────────────────────────────────────────────────

if (-not $BackendOnly) {
    Write-Host ""
    Write-Host "[2/4] Building frontend (production)..." -ForegroundColor Yellow

    Push-Location $Frontend

    if (-not $SkipInstall) {
        Write-Host "  npm ci..."
        npm ci --prefer-offline
        if ($LASTEXITCODE -ne 0) { Write-Error "npm ci failed"; exit 1 }
    }

    Write-Host "  ng build --configuration production..."
    npx ng build cfs-report-shell --configuration production
    if ($LASTEXITCODE -ne 0) { Write-Error "Angular production build failed"; exit 1 }

    Pop-Location

    # Copy frontend artefacts
    $DistFrontend = Join-Path $Dist "frontend"
    if (-not (Test-Path $DistFrontend)) { New-Item -ItemType Directory -Path $DistFrontend | Out-Null }
    Copy-Item (Join-Path $Frontend "dist") -Destination $DistFrontend -Recurse -Force
    Write-Host "  Frontend artefacts → dist/frontend/" -ForegroundColor Green
}

# ── Copy to deploy target ─────────────────────────────────────────────────────

if ($DeployTarget -and (Test-Path $DeployTarget)) {
    Write-Host ""
    Write-Host "[3/4] Copying artefacts to $DeployTarget ..." -ForegroundColor Yellow
    Copy-Item $Dist -Destination $DeployTarget -Recurse -Force
    Write-Host "  Artefacts copied." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[3/4] Skipping remote copy (no -DeployTarget specified or path not found)." -ForegroundColor DarkGray
}

# ── Service restart ───────────────────────────────────────────────────────────

if ($RestartService) {
    Write-Host ""
    Write-Host "[4/4] Restarting service $ServiceName ..." -ForegroundColor Yellow

    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Restart-Service -Name $ServiceName
        Start-Sleep -Seconds 3
        $svc.Refresh()
        if ($svc.Status -eq "Running") {
            Write-Host "  Service $ServiceName restarted and running." -ForegroundColor Green
        } else {
            Write-Error "Service $ServiceName failed to restart. Status: $($svc.Status)"
        }
    } else {
        Write-Warning "Service '$ServiceName' not found. Skipping restart."
        Write-Host "  Manual restart: nssm restart $ServiceName"
        Write-Host "  Or pm2: pm2 restart cfs-backend"
    }
} else {
    Write-Host ""
    Write-Host "[4/4] Skipping service restart (add -RestartService to restart)." -ForegroundColor DarkGray
}

# ── Smoke test ────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Smoke test..." -ForegroundColor Yellow
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5
    if ($resp.status -eq "ok") {
        Write-Host "  /api/health: OK (db=$($resp.db))" -ForegroundColor Green
    } else {
        Write-Warning "  /api/health returned unexpected response: $resp"
    }
} catch {
    Write-Warning "  /api/health not reachable — backend may need manual start or restart."
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " Deploy complete."                            -ForegroundColor Green
Write-Host " Artefacts in: $Dist"                        -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
