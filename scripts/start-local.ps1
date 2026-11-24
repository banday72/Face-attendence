param([switch]$NoStart)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $root "backend"
$frontendRoot = Join-Path $root "frontend"
$backendEnv = Join-Path $backendRoot ".env"
$frontendEnv = Join-Path $frontendRoot ".env.local"

if (-not (Test-Path -LiteralPath $backendEnv)) {
  Copy-Item -LiteralPath (Join-Path $backendRoot ".env.example") -Destination $backendEnv
}

if (-not (Test-Path -LiteralPath $frontendEnv)) {
  Set-Content -LiteralPath $frontendEnv -Value "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1"
}

Push-Location $backendRoot
try {
  py -m alembic upgrade head
  if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
  py -m app.seed
  if ($LASTEXITCODE -ne 0) { throw "Database seed failed." }
}
finally {
  Pop-Location
}

if ($NoStart) {
  Write-Host "Local environment ready. Start the backend and frontend manually."
  exit 0
}

$logDir = Join-Path $root ".dev-logs"
if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$backendProcess = Start-Process -FilePath "py" -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") -WorkingDirectory $backendRoot -RedirectStandardOutput (Join-Path $logDir "backend.out.log") -RedirectStandardError (Join-Path $logDir "backend.err.log") -PassThru
$frontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000") -WorkingDirectory $frontendRoot -RedirectStandardOutput (Join-Path $logDir "frontend.out.log") -RedirectStandardError (Join-Path $logDir "frontend.err.log") -PassThru

Start-Sleep -Seconds 8

try {
  $ready = Invoke-RestMethod -Uri "http://127.0.0.1:8000/ready" -TimeoutSec 5
  Write-Host "Backend ready: $($ready.status), database: $($ready.database)"
}
catch {
  Write-Warning "Backend is starting or failed. Check .dev-logs/backend.err.log"
}

try {
  $page = Invoke-WebRequest -Uri "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 15
  Write-Host "Frontend ready: HTTP $($page.StatusCode) at http://127.0.0.1:3000/login"
}
catch {
  Write-Warning "Frontend is starting or failed. Check .dev-logs/frontend.err.log"
}

Write-Host "Backend PID: $($backendProcess.Id)"
Write-Host "Frontend PID: $($frontendProcess.Id)"
Write-Host "Admin login: admin@university.edu / Admin123!"
