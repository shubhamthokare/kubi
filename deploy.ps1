param(
    [Parameter(Position = 0)]
    [string]$Scenario,
    [switch]$Help,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Show-Usage {
    Write-Host "Kubi deployment runner"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\deploy.ps1 <scenario> [options]"
    Write-Host ""
    Write-Host "  Use --help or -Help to show this help menu."
    Write-Host ""
    Write-Host "Scenarios:"
    Write-Host "  start-local        Start the local dev services (nginx, port-forwards, frontend)"
    Write-Host "  stop-local         Stop all running local dev services"
    Write-Host "  docker             Build and run the Docker Compose stack"
    Write-Host "  minikube-local     Build local images in Minikube and apply local overlay"
    Write-Host "  minikube-prod      Apply the production Kustomize overlay to Minikube/current cluster"
    Write-Host "  helm               Install or upgrade the Helm chart"
    Write-Host "  gke                Run the GKE provision/bootstrap script"
    Write-Host "  render-local       Render the local Kustomize overlay"
    Write-Host "  render-prod        Render the production Kustomize overlay"
    Write-Host "  secrets-local      Apply local dummy Kubernetes secrets"
    Write-Host "  secrets-gcp        Apply GCP External Secrets resources"
    Write-Host "  generate-secrets   Generate dummy secret templates (<local|gcp>)"
    Write-Host ""
    Write-Host "Aliases:"
    Write-Host "  start, dev -> start-local"
    Write-Host "  stop -> stop-local"
    Write-Host "  compose -> docker"
    Write-Host "  local, k8s-local -> minikube-local"
    Write-Host "  prod, k8s-prod -> minikube-prod"
    Write-Host "  external-gcp -> secrets-gcp"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\deploy.ps1 start-local"
    Write-Host "  .\deploy.ps1 stop-local"
    Write-Host "  .\deploy.ps1 render-local"
    Write-Host "  .\deploy.ps1 secrets-local"
    Write-Host "  .\deploy.ps1 minikube-local"
    Write-Host "  .\deploy.ps1 helm --set backend.env.geminiApiKey=dummy"
    Write-Host "  .\deploy.ps1 gke"
}

function Require-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Invoke-Kustomize($Path) {
    if (Get-Command kubectl -ErrorAction SilentlyContinue) {
        kubectl kustomize $Path
        return
    }
    if (Get-Command kustomize -ErrorAction SilentlyContinue) {
        kustomize build $Path
        return
    }
    throw "kubectl or kustomize is required to render Kustomize overlays."
}

# Automatically configure Git to use shared .githooks folder
if (Test-Path ".git") {
    try {
        git config core.hooksPath .githooks 2>$null
    } catch {
        Write-Host "Warning: Could not configure Git hooks path; continuing deployment." -ForegroundColor Yellow
    }
}

if ($Help -or [string]::IsNullOrWhiteSpace($Scenario) -or $Scenario -in @("-h", "--help", "help", "-help") -or ($Rest -and ($Rest -contains "--help" -or $Rest -contains "-h" -or $Rest -contains "help"))) {
    Show-Usage
    exit 0
}

function Initialize-And-Propagate-Secrets {
    $RootEnv = "$Root\.env"
    $RootExample = "$Root\.example.env"
    $BackendEnv = "$Root\apps\backend\.env"
    
    # 1. Bootstrapping / Centralizing secrets
    if (-not (Test-Path $RootEnv)) {
        if (Test-Path $BackendEnv) {
            Write-Host "Centralizing existing secrets from $BackendEnv to $RootEnv..." -ForegroundColor Cyan
            Copy-Item $BackendEnv $RootEnv
        } else {
            Write-Host "Creating master .env from template at $RootEnv..." -ForegroundColor Cyan
            Copy-Item $RootExample $RootEnv
            Write-Host "[Warning] Created centralized .env with dummy values. Please configure your actual secrets in $RootEnv!" -ForegroundColor Yellow
        }
    }
    
    # 1.5. Self-heal missing local & GCP secrets files from templates
    $LocalEnvSecrets = "$Root\deploy\k8s\secrets\local\.env.local"
    $LocalExampleSecrets = "$Root\.example.env.local"
    if (-not (Test-Path $LocalEnvSecrets) -and (Test-Path $LocalExampleSecrets)) {
        $dir = Split-Path -Parent $LocalEnvSecrets
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }
        Copy-Item $LocalExampleSecrets $LocalEnvSecrets
    }
    $GcpEnvSecrets = "$Root\deploy\k8s\secrets\external\gcp\.env.gcp"
    $GcpExampleSecrets = "$Root\.example.env.gcp"
    if (-not (Test-Path $GcpEnvSecrets) -and (Test-Path $GcpExampleSecrets)) {
        $dir = Split-Path -Parent $GcpEnvSecrets
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }
        Copy-Item $GcpExampleSecrets $GcpEnvSecrets
    }

    # 2. Load environment variables into current session
    Write-Host "Loading master secrets from $RootEnv..." -ForegroundColor Cyan
    Get-Content $RootEnv | Where-Object { $_ -notmatch "^#" -and $_ -match "=" } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($key -eq "KUBECONFIG" -and $value.StartsWith("~/")) {
            $value = Join-Path $HOME $value.Substring(2)
        }
        if ($value -ne "`${$parts[0].Trim()}" -and $value -ne "`$${parts[0].Trim()}") {
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }

    # Local overlay URL defaults. These can still be overridden in the root .env.
    $LocalDomain = [System.Environment]::GetEnvironmentVariable("LOCAL_DOMAIN")
    if ([string]::IsNullOrWhiteSpace($LocalDomain)) {
        $LocalDomain = "kubi.kontactless.in"
    }
    $LocalUrlDefaults = @{
        "FRONTEND_URL" = "http://$LocalDomain"
        "BACKEND_URL" = "http://backend.$LocalDomain"
        "AGENT_URL" = "http://agent.$LocalDomain"
    }
    foreach ($entry in $LocalUrlDefaults.GetEnumerator()) {
        $existing = [System.Environment]::GetEnvironmentVariable($entry.Key)
        if ([string]::IsNullOrWhiteSpace($existing)) {
            [System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value)
        }
    }
    $FrontendDefaults = @{
        "NEXT_PUBLIC_API_URL" = "$([System.Environment]::GetEnvironmentVariable("BACKEND_URL"))/api"
        "NEXT_PUBLIC_APP_URL" = [System.Environment]::GetEnvironmentVariable("FRONTEND_URL")
        "NEXT_PUBLIC_AGENT_URL" = [System.Environment]::GetEnvironmentVariable("AGENT_URL")
        "APP_URL" = [System.Environment]::GetEnvironmentVariable("FRONTEND_URL")
    }
    foreach ($entry in $FrontendDefaults.GetEnumerator()) {
        $existing = [System.Environment]::GetEnvironmentVariable($entry.Key)
        if ([string]::IsNullOrWhiteSpace($existing)) {
            [System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value)
        }
    }

    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("EMAIL_PROVIDER"))) {
        [System.Environment]::SetEnvironmentVariable("EMAIL_PROVIDER", "auto")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("SMTP_HOST"))) {
        [System.Environment]::SetEnvironmentVariable("SMTP_HOST", "smtp.resend.com")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("SMTP_PORT"))) {
        [System.Environment]::SetEnvironmentVariable("SMTP_PORT", "465")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("SMTP_USERNAME"))) {
        [System.Environment]::SetEnvironmentVariable("SMTP_USERNAME", "resend")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("SMTP_USE_SSL"))) {
        [System.Environment]::SetEnvironmentVariable("SMTP_USE_SSL", "true")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("SMTP_USE_TLS"))) {
        [System.Environment]::SetEnvironmentVariable("SMTP_USE_TLS", "false")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("EMAIL_SENDER_MONTHLY_LIMIT"))) {
        [System.Environment]::SetEnvironmentVariable("EMAIL_SENDER_MONTHLY_LIMIT", "3000")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("EMAIL_SENDER_SWITCH_AFTER"))) {
        [System.Environment]::SetEnvironmentVariable("EMAIL_SENDER_SWITCH_AFTER", "2900")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("EMAIL_SENDER_USAGE_COLLECTION"))) {
        [System.Environment]::SetEnvironmentVariable("EMAIL_SENDER_USAGE_COLLECTION", "email_sender_usage")
    }
    if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("SMTP_PASSWORD"))) {
        $resendApiKey = [System.Environment]::GetEnvironmentVariable("RESEND_API_KEY")
        if (-not [string]::IsNullOrWhiteSpace($resendApiKey)) {
            [System.Environment]::SetEnvironmentVariable("SMTP_PASSWORD", $resendApiKey)
        }
    }

    $senderPool = [System.Environment]::GetEnvironmentVariable("EMAIL_SENDER_POOL")
    if (-not [string]::IsNullOrWhiteSpace($senderPool)) {
        Write-Host "Email sender pool configured; monthly switch threshold: $([System.Environment]::GetEnvironmentVariable("EMAIL_SENDER_SWITCH_AFTER"))" -ForegroundColor Gray
    }

    # 3. Propagate relevant secrets to each component based on schema
    $Schema = @{
        "apps/backend/.env" = @(
            "ENVIRONMENT", "PROJECT_NAME", "LOG_LEVEL", "GEMINI_API_KEY", 
            "MONGODB_URL", "DATABASE_NAME", "GITLAB_API_URL", "GITLAB_PRIVATE_TOKEN", "GITLAB_TOKEN",
            "AGENT_URL", "CORS_ORIGINS", "CORS_ORIGIN_REGEX", "ELASTICSEARCH_HOST", 
            "ELASTICSEARCH_INDEX", "ELASTICSEARCH_INDEX_LOGS", "ELASTICSEARCH_INDEX_EVENTS", 
            "ELASTICSEARCH_INDEX_RCA", "ELASTICSEARCH_INDEX_REMEDIATION", "ELASTICSEARCH_USERNAME", 
            "ELASTICSEARCH_PASSWORD", "ELASTICSEARCH_API_KEY", "ELASTICSEARCH_SHARDS", 
            "ELASTICSEARCH_REPLICAS", "EMAIL_PROVIDER", "RESEND_API_KEY", "EMAIL_FROM",
            "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_USE_SSL", "SMTP_USE_TLS",
            "EMAIL_SENDER_POOL", "EMAIL_SENDER_MONTHLY_LIMIT", "EMAIL_SENDER_SWITCH_AFTER",
            "EMAIL_SENDER_USAGE_COLLECTION",
            "OTP_EXPIRY_MINUTES",
            "JWT_SECRET_KEY", "ARIZE_SPACE_ID", "ARIZE_API_KEY", "ARIZE_PROJECT_NAME", 
            "GLOBAL_DOMAIN", "LOCAL_DOMAIN", "SERVICE_SUBDOMAIN", "DOMAIN_NAME"
        )
        "apps/agent/.env" = @(
            "CLUSTER_ID", "TARGET_NAMESPACE", "SCAN_INTERVAL", "KUBECONFIG", 
            "KUBI_BACKEND_URL", "GEMINI_API_KEY", "LOG_LEVEL", "ARIZE_SPACE_ID", 
            "ARIZE_API_KEY", "ARIZE_PROJECT_NAME", "PHOENIX_COLLECTOR_ENDPOINT"
        )
        "apps/frontend/.env.local" = @(
            "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_AGENT_URL"
        )
        "deploy/k8s/secrets/local/.env.local" = @(
            "DB_PASSWORD", "RESEND_API_KEY", "SMTP_PASSWORD", "EMAIL_SENDER_POOL", "JWT_SECRET_KEY", "GEMINI_API_KEY",
            "GITLAB_TOKEN", "ARIZE_SPACE_ID", "ARIZE_API_KEY", "SSO_CLIENT_ID", "SSO_CLIENT_SECRET"
        )
        "deploy/local/playwright/.env" = @(
            "MONGODB_URL", "DATABASE_NAME", "APP_URL"
        )
        "deploy/k8s/overlays/local/.env" = @(
            "BACKEND_URL", "AGENT_URL", "FRONTEND_URL", "EMAIL_PROVIDER", "EMAIL_FROM",
            "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_USE_SSL", "SMTP_USE_TLS",
            "EMAIL_SENDER_MONTHLY_LIMIT", "EMAIL_SENDER_SWITCH_AFTER", "EMAIL_SENDER_USAGE_COLLECTION"
        )
    }

    $Schema.GetEnumerator() | ForEach-Object {
        $targetRel = $_.Key
        $allowedKeys = $_.Value
        $targetPath = Join-Path $Root $targetRel
        
        $dir = Split-Path -Parent $targetPath
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }

        # Filter lines from RootEnv matching allowed keys or comments/empty lines
        $content = Get-Content $RootEnv
        $filteredContent = @()
        foreach ($line in $content) {
            $trimmed = $line.Trim()
            if ($trimmed.StartsWith("#") -or [string]::IsNullOrWhiteSpace($trimmed)) {
                $filteredContent += $line
                continue
            }
            if ($trimmed -match "=") {
                $key = ($trimmed -split "=", 2)[0].Trim()
                if ($key -in $allowedKeys) {
                    $filteredContent += $line
                }
            }
        }

        $existingKeys = @{}
        foreach ($line in $filteredContent) {
            $trimmed = $line.Trim()
            if ($trimmed -match "=" -and -not $trimmed.StartsWith("#")) {
                $existingKey = ($trimmed -split "=", 2)[0].Trim()
                $existingKeys[$existingKey] = $true
            }
        }
        foreach ($key in $allowedKeys) {
            if (-not $existingKeys.ContainsKey($key)) {
                $value = [System.Environment]::GetEnvironmentVariable($key)
                if (-not [string]::IsNullOrWhiteSpace($value)) {
                    $filteredContent += "$key=$value"
                }
            }
        }

        $filteredContent | Set-Content $targetPath -Force
        Write-Host "Synchronized: $targetRel (filtered)" -ForegroundColor Gray
    }
}

# Run secret management and propagation
Initialize-And-Propagate-Secrets

switch ($Scenario.ToLowerInvariant()) {
    { $_ -in @("docker", "compose") } {
        Write-Host "Starting Kubi AI Deployment on Docker..." -ForegroundColor Cyan

        # 1. Check if Docker daemon is running
        $dockerCheck = docker info 2>$null
        if ($null -eq $dockerCheck) {
            Write-Host "Docker is not running. Please start the Docker daemon first." -ForegroundColor Red
            exit 1
        }

        # If GEMINI_API_KEY is not defined or is placeholder, warn the user
        $geminiApiKey = [System.Environment]::GetEnvironmentVariable("GEMINI_API_KEY")
        if ([string]::IsNullOrEmpty($geminiApiKey) -or $geminiApiKey -eq "dummy") {
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
            Write-Host "  $([System.Environment]::GetEnvironmentVariable("FRONTEND_URL"))"
            Write-Host "  http://localhost:3000"
            Write-Host "Backend API:" -ForegroundColor Green
            Write-Host "  $([System.Environment]::GetEnvironmentVariable("BACKEND_URL"))"
            Write-Host "  http://localhost:8000"
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
        break
    }
    { $_ -in @("minikube-local", "k8s-local", "local") } {
        Write-Host "Starting Kubi AI Deployment on Minikube (LOCAL mode)..." -ForegroundColor Cyan

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

        # 5. Apply Manifests with Local Overlay
        Write-Host "Applying Kubernetes Manifests using Local Kustomize overlay..." -ForegroundColor Blue
        kubectl apply -k deploy/k8s/overlays/local/

        # 6. Force Restart (Ensure latest images are used)
        Write-Host "Restarting Deployments to pick up new images..." -ForegroundColor Yellow
        kubectl rollout restart deployment kubi-backend -n kubi
        kubectl rollout restart deployment kubi-frontend -n kubi
        kubectl rollout restart deployment kubi-agent -n kubi

        Write-Host "Deployment Complete!" -ForegroundColor Cyan
        Write-Host "--------------------------------------------------"
        Write-Host "[LOCAL] Local Domain Access (if hosts file is configured):" -ForegroundColor Green
        Write-Host "  Dashboard:   http://kubi.kontactless.in"
        Write-Host "  Backend API: http://backend.kubi.kontactless.in"
        Write-Host ""
        Write-Host "[PORT] Standard Minikube fallback to access Dashboard:" -ForegroundColor Green
        Write-Host "  minikube service kubi-frontend-service -n kubi"
        Write-Host ""
        Write-Host "To access the Kibana UI, run:" -ForegroundColor Cyan
        Write-Host "  kubectl port-forward svc/kibana-service -n kubi 5601:5601"
        Write-Host "  Then navigate to http://localhost:5601"
        Write-Host ""
        Write-Host "To see backend logs:" -ForegroundColor Cyan
        Write-Host "  kubectl logs -l app=kubi-backend -n kubi -f"
        Write-Host "--------------------------------------------------"
        break
    }
    { $_ -in @("minikube-prod", "k8s-prod", "prod") } {
        Write-Host "Starting Kubi AI Deployment on Minikube (PRODUCTION mode)..." -ForegroundColor Cyan

        # 1. Check if Minikube is running
        $minikubeStatus = minikube status --format='{{.Host}}' 2>$null
        if ($minikubeStatus -ne "Running") {
            Write-Host "Minikube is not running. Please start it with 'minikube start'." -ForegroundColor Yellow
            exit 1
        }

        # 2. Apply Standard/Global Manifests
        Write-Host "Applying Kubernetes Manifests using Production Kustomize overlay..." -ForegroundColor Blue
        kubectl apply -k deploy/k8s/overlays/prod/

        Write-Host "Deployment Complete!" -ForegroundColor Cyan
        Write-Host "--------------------------------------------------"
        Write-Host "[PROD] Production Access:" -ForegroundColor Green
        Write-Host "  Dashboard:   https://kubi.kontactless.in"
        Write-Host "  Backend API: https://backend.kubi.kontactless.in"
        Write-Host ""
        Write-Host "To access the Kibana UI, run:" -ForegroundColor Cyan
        Write-Host "  kubectl port-forward svc/kibana-service -n kubi 5601:5601"
        Write-Host "  Then navigate to http://localhost:5601"
        Write-Host ""
        Write-Host "To see backend logs:" -ForegroundColor Cyan
        Write-Host "  kubectl logs -l app=kubi-backend -n kubi -f"
        Write-Host "--------------------------------------------------"
        break
    }
    "helm" {
        Require-Command helm
        helm upgrade --install kubi deploy/helm/kubi -n kubi --create-namespace --wait @Rest
        break
    }
    "gke" {
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host "[GKE] Kubi GKE Cluster Provisioner and Bootstrapper (PowerShell)" -ForegroundColor Cyan
        Write-Host "========================================================" -ForegroundColor Cyan

        # 1. Check for Active GCP Account and Project configurations
        $ActiveAccount = gcloud auth list --filter="status:ACTIVE" --format="value(account)"
        if ([string]::IsNullOrEmpty($ActiveAccount)) {
            Write-Error "[Error] gcloud authentication is not active. Run 'gcloud auth application-default login'"
        }

        $GcpProject = gcloud config get-value project 2>$null
        if ([string]::IsNullOrEmpty($GcpProject)) {
            Write-Error "[Error] GCP project is not configured. Run 'gcloud config set project YOUR_GCP_PROJECT_ID'"
        }

        Write-Host "[Info] Active GCP Project: $GcpProject" -ForegroundColor Green

        # 1. Provision GKE Cluster via Terraform
        Write-Host "`n=== [Step 1] Provision GKE via Terraform ===" -ForegroundColor Yellow
        Set-Location "$Root\terraform"

        & terraform init
        & terraform apply -var="project_id=$GcpProject" -auto-approve

        # Extract credentials command output
        $GetCredsCmd = terraform output -raw get_credentials_command

        # 2. Configure Kubectl Context
        Write-Host "`n=== [Step 2] Fetching GKE Cluster Credentials ===" -ForegroundColor Yellow
        # Run the credentials fetch command dynamically
        Set-Location $Root
        Invoke-Expression $GetCredsCmd

        # 3. Bootstrap Cluster via ArgoCD (or Kubectl Fallback)
        Write-Host "`n=== [Step 3] Bootstrapping ArgoCD ===" -ForegroundColor Yellow
        Set-Location "$Root\ansible"

        $AnsibleExists = Get-Command ansible-playbook -ErrorAction SilentlyContinue
        if ($null -eq $AnsibleExists) {
            Write-Host "[Warning] ansible-playbook not found locally. Running native Kubectl fallback..." -ForegroundColor DarkYellow
            
            # Create namespace if it doesn't exist
            & kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
            
            # Apply official community ArgoCD manifests
            Write-Host "Deploying stable ArgoCD community manifests..." -ForegroundColor Gray
            & kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
            
            # Wait for ArgoCD Server to be healthy
            Write-Host "Waiting for ArgoCD Server deployment to be healthy..." -ForegroundColor Gray
            & kubectl wait --namespace argocd --for=condition=available --timeout=300s deployment/argocd-server
            
            # Apply ArgoCD seeding application manifest
            Write-Host "Seeding Kubi GitOps application manifest..." -ForegroundColor Gray
            & kubectl apply -n argocd -f ../argocd/application.yaml
        } else {
            & ansible-playbook -i inventory.ini playbook.yml
        }

        # 4. Deploy Observability & Secrets Stack via Helm
        Write-Host "`n=== [Step 4] Deploying Observability and Secrets Stack via Helm ===" -ForegroundColor Yellow
        Set-Location $Root

        $HelmExists = Get-Command helm -ErrorAction SilentlyContinue
        if ($null -ne $HelmExists) {
            Write-Host "Registering and updating Helm chart repositories..." -ForegroundColor Gray
            & helm repo add external-secrets https://charts.external-secrets.io
            & helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
            & helm repo update

            Write-Host "Deploying External Secrets Operator (ESO)..." -ForegroundColor Gray
            & helm upgrade --install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

            Write-Host "Deploying Prometheus and Grafana observability stack..." -ForegroundColor Gray
            & helm upgrade --install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f "$Root\k8s\observability\values-prometheus.yaml"
        } else {
            Write-Host "[Warning] Helm CLI not found locally. Skipping ESO and Prometheus/Grafana deployments." -ForegroundColor DarkYellow
            Write-Host "Please install Helm to enable automated observability and secrets syncing." -ForegroundColor Gray
        }

        Write-Host "`n========================================================" -ForegroundColor Green
        Write-Host "[Success] Successfully provisioned and bootstrapped your GKE cluster!" -ForegroundColor Green
        Write-Host "========================================================" -ForegroundColor Green
        break
    }
    "render-local" {
        Invoke-Kustomize "deploy/k8s/overlays/local"
        break
    }
    "render-prod" {
        Invoke-Kustomize "deploy/k8s/overlays/prod"
        break
    }
    "secrets-local" {
        Require-Command kubectl
        kubectl apply -k deploy/k8s/secrets/local @Rest
        break
    }
    { $_ -in @("secrets-gcp", "external-gcp") } {
        Require-Command kubectl
        kubectl apply -k deploy/k8s/secrets/external/gcp @Rest
        break
    }
    { $_ -in @("start-local", "start", "dev") } {
        $FRONTEND_DIR = Join-Path $Root "apps\frontend"
        $HOSTS_FILE  = "C:\Windows\System32\drivers\etc\hosts"
        $DOMAINS = @(
            "127.0.0.1  kubi.kontactless.in",
            "127.0.0.1  backend.kubi.kontactless.in",
            "127.0.0.1  agent.kubi.kontactless.in"
        )

        Write-Host ""
        Write-Host "====================================================" -ForegroundColor Cyan
        Write-Host "  Kubi Local Dev  -- nginx + port-forward mode" -ForegroundColor Cyan
        Write-Host "  Domain: kubi.kontactless.in" -ForegroundColor Cyan
        Write-Host "====================================================" -ForegroundColor Cyan
        Write-Host ""

        # Step 1: Stop stale processes
        Write-Host "[1/6] Stopping stale kubectl port-forwards and nginx..."
        Get-Process -Name "kubectl" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        docker compose down --remove-orphans 2>$null | Out-Null
        Write-Host "      Done."

        # Step 2: Disable ingress addon (idempotent)
        Write-Host "[2/6] Disabling Minikube ingress addon..."
        $addonCheck = minikube addons list 2>$null | Select-String "ingress"
        if ($null -ne $addonCheck -and $addonCheck -match "enabled") {
            minikube addons disable ingress 2>$null | Out-Null
            Write-Host "      Ingress addon disabled."
        } else {
            Write-Host "      Ingress already disabled or minikube offline. Skipping."
        }

        # Step 3: Patch Windows hosts file
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

        # Step 4: Start kubectl port-forwards
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

        # Step 5: Start nginx Docker container
        Write-Host "[5/6] Starting nginx on port 80..."
        $composeOut = docker compose up -d 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "      ERROR: docker compose failed!" -ForegroundColor Red
            Write-Host $composeOut -ForegroundColor Red
            Write-Host "      Ensure Docker Desktop is running." -ForegroundColor Yellow
            exit 1
        }
        docker compose ps
        Write-Host "      nginx running -> http://kubi.kontactless.in"

        # Step 6: Start Next.js dev server
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

        Write-Host ""
        Write-Host "====================================================" -ForegroundColor Green
        Write-Host "  All services started!" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Main App:   http://kubi.kontactless.in"
        Write-Host "  Login:      http://kubi.kontactless.in/login"
        Write-Host "  Register:   http://kubi.kontactless.in/register"
        Write-Host "  API Docs:   http://backend.kubi.kontactless.in/docs"
        Write-Host "  Agent:      http://agent.kubi.kontactless.in"
        Write-Host "  Backend raw:http://localhost:8000/docs"
        Write-Host ""
        Write-Host "  To stop:    .\deploy.ps1 stop-local" -ForegroundColor Green
        Write-Host "====================================================" -ForegroundColor Green
        Write-Host ""

        Write-Host "Tailing nginx logs (Ctrl+C to exit)..."
        docker compose logs -f nginx
        break
    }
    { $_ -in @("stop-local", "stop") } {
        Write-Host "Stopping Kubi local dev services..." -ForegroundColor Cyan
        docker compose down
        Write-Host "  nginx stopped."

        Get-Process -Name "kubectl" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Host "  kubectl port-forwards stopped."

        Get-Job -Name "pf-backend","pf-agent","nextjs-dev" -ErrorAction SilentlyContinue | Stop-Job | Remove-Job
        Write-Host "  Background jobs stopped."
        Write-Host "Done."
        break
    }
    "generate-secrets" {
        $SubMode = "all"
        if ($Rest -and $Rest.Count -gt 0) {
            $SubMode = $Rest[0].ToLowerInvariant()
        }
        
        $Targets = @()
        if ($SubMode -eq "local") {
            $Targets += [PSCustomObject]@{
                Source = ".example.env.local"
                Target = "deploy/k8s/secrets/local/.env.local"
            }
        } elseif ($SubMode -eq "gcp") {
            $Targets += [PSCustomObject]@{
                Source = ".example.env.gcp"
                Target = "deploy/k8s/secrets/external/gcp/.env.gcp"
            }
        } elseif ($SubMode -eq "all") {
            $Targets += [PSCustomObject]@{
                Source = ".example.env.local"
                Target = "deploy/k8s/secrets/local/.env.local"
            }
            $Targets += [PSCustomObject]@{
                Source = ".example.env.gcp"
                Target = "deploy/k8s/secrets/external/gcp/.env.gcp"
            }
        } else {
            Write-Host "Kubi secret template helper"
            Write-Host ""
            Write-Host "Usage:"
            Write-Host "  .\deploy.ps1 generate-secrets [local|gcp]"
            Write-Host "  (Omitting argument will generate both templates by default)"
            Write-Host ""
            Write-Host "Sources & Outputs:"
            Write-Host "  local:"
            Write-Host "    Source: .example.env.local"
            Write-Host "    Target: deploy/k8s/secrets/local/.env.local"
            Write-Host "  gcp:"
            Write-Host "    Source: .example.env.gcp"
            Write-Host "    Target: deploy/k8s/secrets/external/gcp/.env.gcp"
            exit 0
        }

        foreach ($item in $Targets) {
            $TargetPath = Join-Path $Root $item.Target
            if (Test-Path $TargetPath) {
                Write-Host "Already exists: $($item.Target)"
            } else {
                Copy-Item (Join-Path $Root $item.Source) $TargetPath
                Write-Host "Created $($item.Target) with dummy values."
            }
        }
        exit 0
    }
    default {
        Write-Host "Unknown scenario '$Scenario'." -ForegroundColor Red
        Write-Host ""
        Show-Usage
        exit 1
    }
}
