# Chess Platform Admin: one-shot launcher.
# Builds the current frontend, installs backend deps, then serves everything on http://localhost:8000
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location "$root\frontend"
try {
    if (-not (Test-Path "node_modules")) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
} finally {
    Pop-Location
}

Push-Location "$root\backend"
try {
Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
python -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }

Write-Host "Starting server on http://localhost:8000 (login: admin / admin)" -ForegroundColor Green
Start-Job -ScriptBlock { Start-Sleep -Seconds 2; Start-Process "http://localhost:8000" } | Out-Null
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
if ($LASTEXITCODE -ne 0) { throw "Server stopped with an error." }
} finally {
Pop-Location
}
