# Chess Platform Admin: one-shot launcher.
# Builds the frontend if needed, installs backend deps, then serves everything on http://localhost:8000
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not (Test-Path "$root\frontend\dist\index.html")) {
    Write-Host "Building frontend..." -ForegroundColor Cyan
    Push-Location "$root\frontend"
    if (-not (Test-Path "node_modules")) { npm install }
    npm run build
    Pop-Location
}

Push-Location "$root\backend"
Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
python -m pip install -q -r requirements.txt

Write-Host "Starting server on http://localhost:8000 (login: admin / admin)" -ForegroundColor Green
Start-Job -ScriptBlock { Start-Sleep -Seconds 2; Start-Process "http://localhost:8000" } | Out-Null
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Pop-Location
