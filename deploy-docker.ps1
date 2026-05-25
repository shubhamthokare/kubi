# Kubi AI Docker Deployment Script (PowerShell)

Write-Host "Starting Kubi AI Deployment on Docker..." -ForegroundColor Cyan

# Automatically configure Git to use shared .githooks folder
if (Test-Path ".git") {
    git config core.hooksPath .githooks 2>$null
}

# 1. Check if Docker daemon is running
$dockerCheck = docker info 2>$null
if ($null -eq $dockerCheck) {
    Write-Host "Docker is not running. Please start the Docker daemon first." -ForegroundColor Red
    exit 1
}

# 2. Check and load environment variables from .env
$envFile = "./apps/backend/.env"
if (Test-Path $envFile) {
    Write-Host "Loading environment configurations from $envFile..." -ForegroundColor Cyan
    Get-Content $envFile | Where-Object { $_ -notmatch "^#" -and $_ -match "=" } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        # Resolve any variable expansion if it's the literal '${GEMINI_API_KEY}'
        if ($value -ne "`${GEMINI_API_KEY}") {
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

# If GEMINI_API_KEY is not defined or is placeholder, warn the user
$geminiApiKey = [System.Environment]::GetEnvironmentVariable("GEMINI_API_KEY")
if ([string]::IsNullOrEmpty($geminiApiKey)) {
    Write-Host "Warning: GEMINI_API_KEY is not set or is a placeholder." -ForegroundColor Yellow
    Write-Host "The backend AI remediation feature will not function without a valid key." -ForegroundColor Yellow
}

# 3. Spin up services using Docker Compose
Write-Host "Running Docker Compose build and deployment..." -ForegroundColor Blue
docker compose -f deploy/container/docker-compose.yml up --build -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment Complete! All services started in the background." -ForegroundColor Green
    Write-Host "--------------------------------------------------"
    Write-Host "Access the Dashboard at:" -ForegroundColor Green
    Write-Host "  http://localhost:3000"
    Write-Host ""
    Write-Host "Monitor the status of your services:" -ForegroundColor Cyan
    Write-Host "  docker compose -f deploy/container/docker-compose.yml ps"
    Write-Host ""
    Write-Host "To view live logs:" -ForegroundColor Cyan
    Write-Host "  Backend: docker compose -f deploy/container/docker-compose.yml logs -f be"
    Write-Host "  Agent:   docker compose -f deploy/container/docker-compose.yml logs -f agent"
    Write-Host ""
    Write-Host "To shut down the deployment:" -ForegroundColor Yellow
    Write-Host "  docker compose -f deploy/container/docker-compose.yml down"
    Write-Host "--------------------------------------------------"
} else {
    Write-Host "Docker Compose failed to start services. Please check the logs above." -ForegroundColor Red
    exit 1
}
