# ==============================================================================
# Kubi AI - Windows PowerShell GKE Cluster Creation & GitOps Bootstrap Script
# ==============================================================================
$ErrorActionPreference = "Stop"

# Keep track of root directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "🚀 Kubi GKE Cluster Provisioner & Bootstrapper (PowerShell)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Check for Active GCP Account and Project configurations
$ActiveAccount = gcloud auth list --filter="status:ACTIVE" --format="value(account)"
if ([string]::IsNullOrEmpty($ActiveAccount)) {
    Write-Error "❌ Error: gcloud authentication is not active. Run 'gcloud auth application-default login'"
}

$GcpProject = gcloud config get-value project 2>$null
if ([string]::IsNullOrEmpty($GcpProject)) {
    Write-Error "❌ Error: GCP project is not configured. Run 'gcloud config set project YOUR_GCP_PROJECT_ID'"
}

Write-Host "🟢 Active GCP Project: $GcpProject" -ForegroundColor Green

# ──────────────────────────────────────────────────────────────────────────────
# 1. Provision GKE Cluster via Terraform
# ──────────────────────────────────────────────────────────────────────────────
Write-Host "`n=== 🛠️ Step 1: Provision GKE via Terraform ===" -ForegroundColor Yellow
Set-Location "$ScriptDir\terraform"

& terraform init
& terraform apply -var="project_id=$GcpProject" -auto-approve

# Extract credentials command output
$GetCredsCmd = terraform output -raw get_credentials_command

# ──────────────────────────────────────────────────────────────────────────────
# 2. Configure Kubectl Context
# ──────────────────────────────────────────────────────────────────────────────
Write-Host "`n=== 🛰️ Step 2: Fetching GKE Cluster Credentials ===" -ForegroundColor Yellow
# Run the credentials fetch command dynamically
Invoke-Expression $GetCredsCmd

# ──────────────────────────────────────────────────────────────────────────────
# 3. Bootstrap Cluster via Ansible (or Kubectl Fallback)
# ──────────────────────────────────────────────────────────────────────────────
Write-Host "`n=== ⚙️ Step 3: Bootstrapping ArgoCD ===" -ForegroundColor Yellow
Set-Location "$ScriptDir\ansible"

$AnsibleExists = Get-Command ansible-playbook -ErrorAction SilentlyContinue
if ($null -eq $AnsibleExists) {
    Write-Host "⚠️ Warning: ansible-playbook not found locally. Running native Kubectl fallback..." -ForegroundColor DarkYellow
    
    # Create namespace if it doesn't exist
    & kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply official community ArgoCD manifests
    Write-Host "Deploying stable ArgoCD community manifests..." -ForegroundColor Gray
    & kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
    
    # Wait for ArgoCD Server to be healthy
    Write-Host "⏳ Waiting for ArgoCD Server deployment to be healthy..." -ForegroundColor Gray
    & kubectl wait --namespace argocd --for=condition=available --timeout=300s deployment/argocd-server
    
    # Apply ArgoCD seeding application manifest
    Write-Host "Seeding Kubi GitOps application manifest..." -ForegroundColor Gray
    & kubectl apply -n argocd -f ../argocd/application.yaml
} else {
    & ansible-playbook -i inventory.ini playbook.yml
}

# ──────────────────────────────────────────────────────────────────────────────
# 4. Deploy Observability & Secrets Stack via Helm
# ──────────────────────────────────────────────────────────────────────────────
Write-Host "`n=== 📊 Step 4: Deploying Observability & Secrets Stack via Helm ===" -ForegroundColor Yellow
Set-Location $ScriptDir

$HelmExists = Get-Command helm -ErrorAction SilentlyContinue
if ($null -ne $HelmExists) {
    Write-Host "Registering and updating Helm chart repositories..." -ForegroundColor Gray
    & helm repo add external-secrets https://charts.external-secrets.io
    & helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    & helm repo update

    Write-Host "Deploying External Secrets Operator (ESO)..." -ForegroundColor Gray
    & helm upgrade --install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

    Write-Host "Deploying Prometheus and Grafana observability stack..." -ForegroundColor Gray
    & helm upgrade --install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f "$ScriptDir\k8s\observability\values-prometheus.yaml"
} else {
    Write-Host "⚠️ Warning: Helm CLI not found locally. Skipping ESO and Prometheus/Grafana deployments." -ForegroundColor DarkYellow
    Write-Host "Please install Helm (e.g. via 'choco install kubernetes-helm' or 'winget install Helm.Helm') to enable automated observability & secrets syncing." -ForegroundColor Gray
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "🎉 Successfully provisioned and bootstrapped your GKE cluster!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
