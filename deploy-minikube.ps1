# Kubi AI Minikube Deployment Script

Write-Host "Starting Kubi AI Deployment on Minikube..." -ForegroundColor Cyan

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

# 2. Build Backend Image
Write-Host "Building Backend Image..." -ForegroundColor Green
minikube image build -t kubi-backend:latest ./apps/backend

# 3. Build Frontend Image
Write-Host "Building Frontend Image..." -ForegroundColor Green
minikube image build -t kubi-frontend:latest ./apps/frontend

# 4. Build Agent Image
Write-Host "Building Agent Image..." -ForegroundColor Green
minikube image build -t kubi-agent:latest ./apps/agent

# 4. Apply Manifests
Write-Host "Applying Kubernetes Manifests..." -ForegroundColor Blue
kubectl apply -k deploy/k8s/

# 5. Force Restart (Ensure latest images are used)
Write-Host "Restarting Deployments to pick up new images..." -ForegroundColor Yellow
kubectl rollout restart deployment kubi-backend -n kubi
kubectl rollout restart deployment kubi-frontend -n kubi

Write-Host "Deployment Complete!" -ForegroundColor Cyan
Write-Host "--------------------------------------------------"
Write-Host "To access the dashboard, run:"
Write-Host "  minikube service kubi-frontend-service -n kubi"
Write-Host ""
Write-Host "To see logs:"
Write-Host "  kubectl logs -l app=kubi-backend -n kubi -f"
Write-Host "--------------------------------------------------"
