#!/usr/bin/env pwsh
# ============================================================
# Kubi Local Dev Starter
# Replaces Minikube Ingress with local nginx Docker container
#
# Domain: kubi.kontactless.in  (resolved via hosts file)
#
# What this script does:
#   1. Disables Minikube ingress addon (one-time, idempotent)
#   2. Patches Windows hosts file with domain aliases
#   3. Starts kubectl port-forwards (backend :8000, agent :8080)
#   4. Starts nginx via Docker Compose (port 80)
#   5. Starts Next.js dev server (port 3001)
#
# Access at:
#   http://kubi.kontactless.in          <- main app
#   http://kubi.kontactless.in/login
#   http://kubi.kontactless.in/register
#   http://backend.kubi.kontactless.in/docs   <- FastAPI docs
#   http://agent.kubi.kontactless.in          <- agent
# ============================================================

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

$REPO_ROOT   = Split-Path -Parent $PSScriptRoot
$FRONTEND_DIR = Join-Path $REPO_ROOT "apps\frontend"
$HOSTS_FILE  = "C:\Windows\System32\drivers\etc\hosts"

$DOMAINS = @(
    "127.0.0.1  kubi.kontactless.in",
    "127.0.0.1  backend.kubi.kontactless.in",
    "127.0.0.1  agent.kubi.kontactless.in"
)

Write-Host ""
Write-Host "===================================================="
Write-Host "  Kubi Local Dev  -- nginx + port-forward mode"
Write-Host "  Domain: kubi.kontactless.in"
Write-Host "===================================================="
Write-Host ""

# ------------------------------------------------------------
# Step 1: Stop stale processes
# ------------------------------------------------------------
Write-Host "[1/6] Stopping stale kubectl port-forwards and nginx..."
Get-Process -Name "kubectl" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Set-Location $PSScriptRoot
docker compose down --remove-orphans 2>$null | Out-Null
Write-Host "      Done."

# ------------------------------------------------------------
# Step 2: Disable ingress addon (idempotent)
# ------------------------------------------------------------
Write-Host "[2/6] Disabling Minikube ingress addon..."
$addonCheck = minikube addons list 2>$null | Select-String "ingress"
if ($null -ne $addonCheck -and $addonCheck -match "enabled") {
    minikube addons disable ingress 2>$null | Out-Null
    Write-Host "      Ingress addon disabled."
} else {
    Write-Host "      Ingress already disabled or minikube offline. Skipping."
}

# ------------------------------------------------------------
# Step 3: Patch Windows hosts file (requires elevation check)
# ------------------------------------------------------------
Write-Host "[3/6] Checking hosts file entries for domain aliases..."
$hostsContent = Get-Content $HOSTS_FILE -ErrorAction SilentlyContinue

$needsUpdate = $false
foreach ($entry in $DOMAINS) {
    $domain = ($entry -split "\s+")[1]
    if ($hostsContent -notmatch [regex]::Escape($domain)) {
        $needsUpdate = $true
        break
    }
}

if ($needsUpdate) {
    Write-Host "      Adding domain entries to hosts file (requires Admin)..."
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
        $marker = "# Kubi local dev"
        Add-Content -Path $HOSTS_FILE -Value ""
        Add-Content -Path $HOSTS_FILE -Value $marker
        foreach ($entry in $DOMAINS) {
            Add-Content -Path $HOSTS_FILE -Value $entry
            Write-Host "      Added: $entry"
        }
    } else {
        Write-Host "      WARNING: Not running as Admin. Add these lines to $HOSTS_FILE manually:" -ForegroundColor Yellow
        foreach ($entry in $DOMAINS) {
            Write-Host "        $entry" -ForegroundColor Cyan
        }
    }
} else {
    Write-Host "      All domain entries already present."
}

# ------------------------------------------------------------
# Step 4: Start kubectl port-forwards as background jobs (listening on 0.0.0.0 for Docker access)
# ------------------------------------------------------------
Write-Host "[4/6] Starting kubectl port-forwards..."

$pfBackend = Start-Job -ScriptBlock {
    kubectl port-forward --address 0.0.0.0 svc/kubi-backend-service 8000:8000 -n kubi
} -Name "pf-backend"

$pfAgent = Start-Job -ScriptBlock {
    kubectl port-forward --address 0.0.0.0 svc/kubi-agent-service 8080:8080 -n kubi
} -Name "pf-agent"

Start-Sleep -Seconds 2
Write-Host "      Backend  -> localhost:8000  (PS Job $($pfBackend.Id))"
Write-Host "      Agent    -> localhost:8080  (PS Job $($pfAgent.Id))"

# ------------------------------------------------------------
# Step 5: Start nginx Docker container
# ------------------------------------------------------------
Write-Host "[5/6] Starting nginx on port 80..."
Set-Location $PSScriptRoot
$composeOut = docker compose up -d 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERROR: docker compose failed!" -ForegroundColor Red
    Write-Host $composeOut -ForegroundColor Red
    Write-Host "      Ensure Docker Desktop is running." -ForegroundColor Yellow
    exit 1
}
docker compose ps
Write-Host "      nginx running -> http://kubi.kontactless.in"

# ------------------------------------------------------------
# Step 6: Start Next.js dev server
# ------------------------------------------------------------
Write-Host "[6/6] Starting Next.js dev server on port 3001..."

$pfFrontend = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    $env:BACKEND_URL = "http://localhost:8000"
    npm run dev -- --port 3001
} -ArgumentList $FRONTEND_DIR -Name "nextjs-dev"

Start-Sleep -Seconds 3
Write-Host "      Frontend -> localhost:3001 (proxied via nginx as http://kubi.kontactless.in)"
Write-Host "      PS Job $($pfFrontend.Id)"

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------
Write-Host ""
Write-Host "===================================================="
Write-Host "  All services started!"
Write-Host ""
Write-Host "  Main App:   http://kubi.kontactless.in"
Write-Host "  Login:      http://kubi.kontactless.in/login"
Write-Host "  Register:   http://kubi.kontactless.in/register"
Write-Host "  API Docs:   http://backend.kubi.kontactless.in/docs"
Write-Host "  Agent:      http://agent.kubi.kontactless.in"
Write-Host "  Backend raw:http://localhost:8000/docs"
Write-Host ""
Write-Host "  Logs:"
Write-Host "    nginx:    docker compose logs -f nginx   (in local-dev/)"
Write-Host "    backend:  Receive-Job $($pfBackend.Id)"
Write-Host "    frontend: Receive-Job $($pfFrontend.Id)"
Write-Host ""
Write-Host "  To stop:    .\stop-local.ps1"
Write-Host "===================================================="
Write-Host ""

Write-Host "Tailing nginx logs (Ctrl+C to exit)..."
Set-Location $PSScriptRoot
docker compose logs -f nginx
