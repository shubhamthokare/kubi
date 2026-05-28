#!/usr/bin/env pwsh
# Stop all Kubi local dev services

Write-Host "Stopping Kubi local dev services..."

Set-Location $PSScriptRoot

# Stop nginx
docker compose down
Write-Host "  nginx stopped."

# Stop kubectl port-forwards
Get-Process -Name "kubectl" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  kubectl port-forwards stopped."

# Stop background PS jobs
Get-Job -Name "pf-backend","pf-agent","nextjs-dev" -ErrorAction SilentlyContinue | Stop-Job | Remove-Job
Write-Host "  Background jobs stopped."

Write-Host "Done."
