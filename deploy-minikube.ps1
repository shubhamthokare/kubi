param (
    [switch]$Local = $false,
    [switch]$Prod = $false
)

# Parse additional arguments to support both switch and string arguments (e.g. 'local', 'prod')
if ($args -contains "local" -or $args -contains "-l" -or $args -contains "--local") {
    $Local = $true
}
if ($args -contains "prod" -or $args -contains "-p" -or $args -contains "--prod" -or $args -contains "-Prod") {
    $Prod = $true
}

if ($Local) {
    Write-Host "Starting Kubi AI Deployment on Minikube (LOCAL mode)..." -ForegroundColor Cyan
} elseif ($Prod) {
    Write-Host "Starting Kubi AI Deployment on Minikube (PRODUCTION mode)..." -ForegroundColor Cyan
} else {
    Write-Host "Starting Kubi AI Deployment on Minikube (GLOBAL mode)..." -ForegroundColor Cyan
}

# Automatically configure Git to use shared .githooks folder
if (Test-Path ".git") {
    git config core.hooksPath .githooks 2>$null
}

# 1. Check if Minikube is running
$minikubeStatus = minikube status --format='{{.Host}}' 2>$null
if ($minikubeStatus -ne "Running") {
    Write-Host "Minikube is not running. Please start it with 'minikube start'." -ForegroundColor Yellow
    exit 1
}

if ($Local) {
    # 2. Build Backend Image
    Write-Host "Building Backend Image..." -ForegroundColor Green
    minikube image build -t kubi-backend:latest ./apps/backend

    # 3. Build Frontend Image
    Write-Host "Building Frontend Image..." -ForegroundColor Green
    minikube image build -t kubi-frontend:latest ./apps/frontend

    # 4. Build Agent Image
    Write-Host "Building Agent Image..." -ForegroundColor Green
    minikube image build -t kubi-agent:latest ./apps/agent

    # 4. Apply Manifests with Local Overlay
    Write-Host "Applying Kubernetes Manifests using Local Kustomize overlay..." -ForegroundColor Blue
    kubectl apply -k deploy/k8s/overlays/local/

    # 5. Force Restart (Ensure latest images are used)
    Write-Host "Restarting Deployments to pick up new images..." -ForegroundColor Yellow
    kubectl rollout restart deployment kubi-backend -n kubi
    kubectl rollout restart deployment kubi-frontend -n kubi
    kubectl rollout restart deployment kubi-agent -n kubi
} else {
    # 4. Apply Standard/Global Manifests
    Write-Host "Applying Kubernetes Manifests using Production Kustomize overlay..." -ForegroundColor Blue
    kubectl apply -k deploy/k8s/overlays/prod/
}

Write-Host "Deployment Complete!" -ForegroundColor Cyan
Write-Host "--------------------------------------------------"
if ($Local) {
    Write-Host "[LOCAL] Local Domain Access (if hosts file is configured):" -ForegroundColor Green
    Write-Host "  Dashboard:   http://kubi.kontactless.in"
    Write-Host "  Backend API: http://backend.kubi.kontactless.in"
    Write-Host ""
    Write-Host "[PORT] Standard Minikube fallback to access Dashboard:" -ForegroundColor Green
    Write-Host "  minikube service kubi-frontend-service -n kubi"
} else {
    Write-Host "[PROD] Production Access:" -ForegroundColor Green
    Write-Host "  Dashboard:   https://kubi.kontactless.in"
    Write-Host "  Backend API: https://backend.kubi.kontactless.in"
}
Write-Host ""
Write-Host "To access the Kibana UI, run:" -ForegroundColor Cyan
Write-Host "  kubectl port-forward svc/kibana-service -n kubi 5601:5601"
Write-Host "  Then navigate to http://localhost:5601"
Write-Host ""
Write-Host "To see backend logs:" -ForegroundColor Cyan
Write-Host "  kubectl logs -l app=kubi-backend -n kubi -f"
Write-Host "--------------------------------------------------"
