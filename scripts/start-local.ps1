# ============================================================
# start-local.ps1 — Starts backend and frontend for local dev
# Uses $PSScriptRoot so it works from any directory [no hardcoded paths]
# ============================================================
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$Root    = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

Write-Host "=== CFS Reporting — Local Dev Startup ===" -ForegroundColor Cyan
Write-Host "Root: $Root"

# ── Backend ──────────────────────────────────────────────────────────────────
if (-not $FrontendOnly) {
    Write-Host ""
    Write-Host "Starting backend on http://localhost:3000 ..." -ForegroundColor Yellow

    if (-not (Test-Path (Join-Path $Backend "node_modules"))) {
        Write-Host "Installing backend dependencies (npm ci)..."
        Push-Location $Backend
        npm ci
        Pop-Location
    }

    # Copy .env if not present
    $envFile     = Join-Path $Backend ".env"
    $envExample  = Join-Path $Backend ".env.example"
    if (-not (Test-Path $envFile)) {
        Write-Host "No .env found — copying from .env.example"
        Copy-Item $envExample $envFile
        Write-Host "IMPORTANT: Edit backend/.env and set a real JWT_SECRET before use!" -ForegroundColor Red
    }

    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Backend'; npm run dev" -WindowStyle Normal
}

# ── Frontend ──────────────────────────────────────────────────────────────────
if (-not $BackendOnly) {
    Write-Host ""
    Write-Host "Starting frontend on http://localhost:4200 ..." -ForegroundColor Yellow

    if (Test-Path $Frontend) {
        if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
            Write-Host "Installing frontend dependencies (npm ci)..."
            Push-Location $Frontend
            npm ci
            Pop-Location
        }
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Frontend'; npm start" -WindowStyle Normal
    } else {
        Write-Host "Frontend directory not found yet — skipping" -ForegroundColor DarkYellow
    }
}

Write-Host ""
Write-Host "Dev servers starting. Check the opened windows for logs." -ForegroundColor Green
Write-Host "Backend health: http://localhost:3000/api/health"
