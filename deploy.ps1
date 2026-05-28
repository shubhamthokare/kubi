# ==============================================================================
# Kubi AI - Unified Deployment Orchestrator Script (PowerShell)
# Co-authored by Antigravity (Google DeepMind)
# ==============================================================================

function Show-Help {
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "🚀 Kubi AI - Unified Deployment Orchestrator" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "Usage:"
    Write-Host "  .\deploy.ps1 <target> [options]"
    Write-Host ""
    Write-Host "Targets:"
    Write-Host "  docker (or compose)    Deploy locally using Docker Compose"
    Write-Host "  minikube (or k8s)     Deploy to local Kubernetes/Minikube cluster"
    Write-Host "  helm                   Deploy to Kubernetes using Helm Chart release"
    Write-Host "  gke (or cloud)       Provision and deploy to Google Kubernetes Engine (GKE)"
    Write-Host ""
    Write-Host "Options for 'minikube':"
    Write-Host "  -Local                Build local container images directly inside Minikube"
    Write-Host "                        (otherwise uses standard pre-built global images)"
    Write-Host "  -Prod                 Apply production kustomize overlay deployments in Minikube"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\deploy.ps1 docker"
    Write-Host "  .\deploy.ps1 minikube -Local"
    Write-Host "  .\deploy.ps1 minikube -Prod"
    Write-Host "  .\deploy.ps1 helm"
    Write-Host "  .\deploy.ps1 gke"
    Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
}

# If run without arguments, or with help
if ($args.Count -eq 0 -or $args -contains "--help" -or $args -contains "-h" -or $args -contains "help") {
    Show-Help
    exit 0
}

$target = $args[0]
$remainingArgs = $args[1..($args.Count - 1)]

# PowerShell 5.1 compatibility fallback for empty slices
if ($null -eq $remainingArgs) {
    $remainingArgs = @()
}

switch ($target.ToLower()) {
    "docker" {
        Write-Host "Selected Target: Docker Compose" -ForegroundColor Cyan
        .\deploy-docker.ps1 @remainingArgs
    }
    "compose" {
        Write-Host "Selected Target: Docker Compose" -ForegroundColor Cyan
        .\deploy-docker.ps1 @remainingArgs
    }
    "minikube" {
        Write-Host "Selected Target: Local Kubernetes (Minikube)" -ForegroundColor Cyan
        .\deploy-minikube.ps1 @remainingArgs
    }
    "k8s" {
        Write-Host "Selected Target: Local Kubernetes (Minikube)" -ForegroundColor Cyan
        .\deploy-minikube.ps1 @remainingArgs
    }
    "helm" {
        Write-Host "Selected Target: Helm Release" -ForegroundColor Cyan
        helm upgrade --install kubi deploy/helm/kubi -n kubi --create-namespace --wait @remainingArgs
    }
    "gke" {
        Write-Host "Selected Target: Google Kubernetes Engine (GKE)" -ForegroundColor Cyan
        .\deploy\deploy-gke.ps1 @remainingArgs
    }
    "cloud" {
        Write-Host "Selected Target: Google Kubernetes Engine (GKE)" -ForegroundColor Cyan
        .\deploy\deploy-gke.ps1 @remainingArgs
    }
    default {
        Write-Host "Error: Unknown target '$target'" -ForegroundColor Red
        Write-Host ""
        Show-Help
        exit 1
    }
}
