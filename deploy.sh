#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Kubi deployment runner

Usage:
  ./deploy.sh <scenario> [options]

Scenarios:
  start-local        Start the local dev services (nginx, port-forwards, frontend)
  stop-local         Stop all running local dev services
  docker             Build and run the Docker Compose stack
  minikube-local     Build local images in Minikube and apply local overlay
  minikube-prod      Apply the production Kustomize overlay to Minikube/current cluster
  helm               Install or upgrade the Helm chart
  gke                Run the GKE provision/bootstrap script
  render-local       Render the local Kustomize overlay
  render-prod        Render the production Kustomize overlay
  secrets-local      Apply local dummy Kubernetes secrets
  secrets-gcp        Apply GCP External Secrets resources
  generate-secrets   Generate dummy secret templates ([local|gcp])

Aliases:
  start, dev -> start-local
  stop -> stop-local
  compose -> docker
  local, k8s-local -> minikube-local
  prod, k8s-prod -> minikube-prod
  external-gcp -> secrets-gcp

Examples:
  ./deploy.sh start-local
  ./deploy.sh stop-local
  ./deploy.sh render-local
  ./deploy.sh secrets-local
  ./deploy.sh minikube-local
  ./deploy.sh helm --set backend.env.geminiApiKey=dummy
  ./deploy.sh gke
EOF
}

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command '$1' was not found in PATH." >&2
    exit 1
  }
}

render_kustomize() {
  local path="$1"
  if command -v kubectl >/dev/null 2>&1; then
    kubectl kustomize "$path"
  elif command -v kustomize >/dev/null 2>&1; then
    kustomize build "$path"
  else
    echo "kubectl or kustomize is required to render Kustomize overlays." >&2
    exit 1
  fi
}

# Automatically configure Git to use shared .githooks folder
if [ -d ".git" ]; then
    git config core.hooksPath .githooks 2>/dev/null || true
fi

has_help=false
for arg in "$@"; do
  if [ "$arg" = "--help" ] || [ "$arg" = "-h" ] || [ "$arg" = "help" ] || [ "$arg" = "-help" ]; then
    has_help=true
  fi
done

if [ $# -eq 0 ] || [ "$has_help" = true ]; then
  usage
  exit 0
fi

initialize_and_propagate_secrets() {
  local root_env="$ROOT/.env"
  local root_example="$ROOT/.example.env"
  local backend_env="$ROOT/apps/backend/.env"

  # 1. Centralization bootstrapping
  if [ ! -f "$root_env" ]; then
    if [ -f "$backend_env" ]; then
      echo "Centralizing existing secrets from $backend_env to $root_env..."
      cp "$backend_env" "$root_env"
    else
      echo "Creating master .env from template at $root_env..."
      cp "$root_example" "$root_env"
      echo "⚠️ Created centralized .env with dummy values. Please configure your actual secrets in $root_env!"
    fi
  fi

  # 1.5. Self-heal missing local & GCP secrets files from templates
  if [ ! -f "$ROOT/deploy/k8s/secrets/local/.env.local" ] && [ -f "$ROOT/.example.env.local" ]; then
    mkdir -p "$ROOT/deploy/k8s/secrets/local"
    cp "$ROOT/.example.env.local" "$ROOT/deploy/k8s/secrets/local/.env.local"
  fi
  if [ ! -f "$ROOT/deploy/k8s/secrets/external/gcp/.env.gcp" ] && [ -f "$ROOT/.example.env.gcp" ]; then
    mkdir -p "$ROOT/deploy/k8s/secrets/external/gcp"
    cp "$ROOT/.example.env.gcp" "$ROOT/deploy/k8s/secrets/external/gcp/.env.gcp"
  fi

  # 2. Load env variables into current session
  echo "Loading master secrets from $root_env..."
  while IFS= read -r line || [ -n "$line" ]; do
    local trimmed="${line#"${line%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    if [[ "$trimmed" =~ ^# ]] || [[ -z "$trimmed" ]] || [[ "$trimmed" != *"="* ]]; then
      continue
    fi

    local key="${trimmed%%=*}"
    local value="${trimmed#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "$value" == "\${"* ]]; then
      continue
    fi
    export "$key=$value"
  done < "$root_env"

  # Local overlay URL defaults. These can still be overridden in the root .env.
  local local_domain="${LOCAL_DOMAIN:-kubi.kontactless.in}"
  export FRONTEND_URL="${FRONTEND_URL:-http://$local_domain}"
  export BACKEND_URL="${BACKEND_URL:-http://backend.$local_domain}"
  export AGENT_URL="${AGENT_URL:-http://agent.$local_domain}"
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-$BACKEND_URL/api}"
  export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-$FRONTEND_URL}"
  export NEXT_PUBLIC_AGENT_URL="${NEXT_PUBLIC_AGENT_URL:-$AGENT_URL}"
  export APP_URL="${APP_URL:-$FRONTEND_URL}"
  export EMAIL_PROVIDER="${EMAIL_PROVIDER:-auto}"
  export SMTP_HOST="${SMTP_HOST:-smtp.resend.com}"
  export SMTP_PORT="${SMTP_PORT:-465}"
  export SMTP_USERNAME="${SMTP_USERNAME:-resend}"
  export SMTP_USE_SSL="${SMTP_USE_SSL:-true}"
  export SMTP_USE_TLS="${SMTP_USE_TLS:-false}"
  export EMAIL_SENDER_MONTHLY_LIMIT="${EMAIL_SENDER_MONTHLY_LIMIT:-3000}"
  export EMAIL_SENDER_SWITCH_AFTER="${EMAIL_SENDER_SWITCH_AFTER:-2900}"
  export EMAIL_SENDER_USAGE_COLLECTION="${EMAIL_SENDER_USAGE_COLLECTION:-email_sender_usage}"
  export SMTP_PASSWORD="${SMTP_PASSWORD:-${RESEND_API_KEY:-}}"
  if [ -n "${EMAIL_SENDER_POOL:-}" ]; then
    echo "Email sender pool configured; monthly switch threshold: ${EMAIL_SENDER_SWITCH_AFTER}"
  fi

  # 3. Propagate relevant secrets to each component based on schema
  local backend_keys="ENVIRONMENT PROJECT_NAME LOG_LEVEL GEMINI_API_KEY MONGODB_URL DATABASE_NAME GITLAB_API_URL GITLAB_PRIVATE_TOKEN GITLAB_TOKEN AGENT_URL CORS_ORIGINS CORS_ORIGIN_REGEX ELASTICSEARCH_HOST ELASTICSEARCH_INDEX ELASTICSEARCH_INDEX_LOGS ELASTICSEARCH_INDEX_EVENTS ELASTICSEARCH_INDEX_RCA ELASTICSEARCH_INDEX_REMEDIATION ELASTICSEARCH_USERNAME ELASTICSEARCH_PASSWORD ELASTICSEARCH_API_KEY ELASTICSEARCH_SHARDS ELASTICSEARCH_REPLICAS EMAIL_PROVIDER RESEND_API_KEY EMAIL_FROM SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_PASSWORD SMTP_USE_SSL SMTP_USE_TLS EMAIL_SENDER_POOL EMAIL_SENDER_MONTHLY_LIMIT EMAIL_SENDER_SWITCH_AFTER EMAIL_SENDER_USAGE_COLLECTION OTP_EXPIRY_MINUTES JWT_SECRET_KEY ARIZE_SPACE_ID ARIZE_API_KEY ARIZE_PROJECT_NAME GLOBAL_DOMAIN LOCAL_DOMAIN SERVICE_SUBDOMAIN DOMAIN_NAME"
  local agent_keys="CLUSTER_ID TARGET_NAMESPACE SCAN_INTERVAL KUBECONFIG KUBI_BACKEND_URL GEMINI_API_KEY LOG_LEVEL ARIZE_SPACE_ID ARIZE_API_KEY ARIZE_PROJECT_NAME PHOENIX_COLLECTOR_ENDPOINT"
  local frontend_keys="NEXT_PUBLIC_API_URL NEXT_PUBLIC_APP_URL NEXT_PUBLIC_AGENT_URL"
  local k8s_keys="DB_PASSWORD RESEND_API_KEY SMTP_PASSWORD EMAIL_SENDER_POOL JWT_SECRET_KEY GEMINI_API_KEY GITLAB_TOKEN ARIZE_SPACE_ID ARIZE_API_KEY SSO_CLIENT_ID SSO_CLIENT_SECRET"
  local playwright_keys="MONGODB_URL DATABASE_NAME APP_URL"

  propagate_filtered() {
    local target="$1"
    local allowed_keys="$2"
    mkdir -p "$(dirname "$target")"
    
    # Empty/create the target file
    > "$target"
    
    while IFS= read -r line || [ -n "$line" ]; do
      # If line is comment or empty, write it
      if [[ "$line" =~ ^[[:space:]]*# ]] || [[ "$line" =~ ^[[:space:]]*$ ]]; then
        echo "$line" >> "$target"
        continue
      fi
      
      # Extract key
      if [[ "$line" =~ = ]]; then
        local key=$(echo "$line" | cut -d= -f1 | xargs)
        # Check if key is in the allowed keys list
        if [[ " $allowed_keys " =~ " $key " ]]; then
          echo "$line" >> "$target"
        fi
      fi
    done < "$root_env"

    for key in $allowed_keys; do
      if ! grep -qE "^[[:space:]]*$key=" "$target"; then
        local value="${!key:-}"
        if [ -n "$value" ]; then
          echo "$key=$value" >> "$target"
        fi
      fi
    done
    echo "Synchronized: ${target#$ROOT/} (filtered)"
  }

  propagate_filtered "$ROOT/apps/backend/.env" "$backend_keys"
  propagate_filtered "$ROOT/apps/agent/.env" "$agent_keys"
  propagate_filtered "$ROOT/apps/frontend/.env.local" "$frontend_keys"
  propagate_filtered "$ROOT/deploy/k8s/secrets/local/.env.local" "$k8s_keys"
  propagate_filtered "$ROOT/deploy/local/playwright/.env" "$playwright_keys"
  propagate_filtered "$ROOT/deploy/k8s/overlays/local/.env" "BACKEND_URL AGENT_URL FRONTEND_URL EMAIL_PROVIDER EMAIL_FROM SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_USE_SSL SMTP_USE_TLS EMAIL_SENDER_MONTHLY_LIMIT EMAIL_SENDER_SWITCH_AFTER EMAIL_SENDER_USAGE_COLLECTION"
}

# Run secrets setup
initialize_and_propagate_secrets

scenario="$1"
shift || true

# Color codes
INFO='\033[0;36m'   # Cyan
SUCCESS='\033[0;32m' # Green
WARNING='\033[0;33m' # Yellow
ERROR='\033[0;31m'   # Red
NC='\033[0m'        # No Color

case "$scenario" in
  docker|compose)
    echo -e "${INFO}Starting Kubi AI Deployment on Docker...${NC}"

    # 1. Check if Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        echo -e "${ERROR}Docker is not running. Please start the Docker daemon first.${NC}"
        exit 1
    fi

    # If GEMINI_API_KEY is not defined or is placeholder, warn the user
    if [ -z "${GEMINI_API_KEY:-}" ] || [ "${GEMINI_API_KEY:-}" = "dummy" ] || [ "${GEMINI_API_KEY:-}" = "\${GEMINI_API_KEY}" ]; then
        echo -e "${WARNING}Warning: GEMINI_API_KEY is not set or is a placeholder.${NC}"
        echo -e "${WARNING}The backend AI remediation feature will not function without a valid key.${NC}"
    fi

    # 3. Spin up services using Docker Compose
    echo -e "${INFO}Running Docker Compose build and deployment...${NC}"
    docker compose -f deploy/container/docker-compose.yml up --build -d

    if [ $? -eq 0 ]; then
        echo -e "${SUCCESS}Deployment Complete! All services started in the background.${NC}"
        echo -e "--------------------------------------------------"
        echo -e "${SUCCESS}Access the Dashboard at:${NC}"
        echo -e "  ${FRONTEND_URL}"
        echo -e "  http://localhost:3000"
        echo -e "${SUCCESS}Backend API:${NC}"
        echo -e "  ${BACKEND_URL}"
        echo -e "  http://localhost:8000"
        echo -e ""
        echo -e "${INFO}Monitor the status of your services:${NC}"
        echo -e "  docker compose -f deploy/container/docker-compose.yml ps"
        echo -e ""
        echo -e "${INFO}To view live logs:${NC}"
        echo -e "  Backend: docker compose -f deploy/container/docker-compose.yml logs -f be"
        echo -e "  Agent:   docker compose -f deploy/container/docker-compose.yml logs -f agent"
        echo -e ""
        echo -e "${WARNING}To shut down the deployment:${NC}"
        echo -e "  docker compose -f deploy/container/docker-compose.yml down"
        echo -e "--------------------------------------------------"
    else
        echo -e "${ERROR}Docker Compose failed to start services. Please check the logs above.${NC}"
        exit 1
    fi
    ;;

  minikube-local|k8s-local|local)
    echo "Starting Kubi AI Deployment on Minikube (LOCAL mode)..."

    # 1. Check if Minikube is running
    if ! minikube status | grep -q "Running"; then
        echo "Minikube is not running. Please start it with 'minikube start'."
        exit 1
    fi

    # 2. Build Backend Image
    echo "Building Backend Image..."
    minikube image build -t kubi-backend:latest ./apps/backend

    # 3. Build Frontend Image
    echo "Building Frontend Image..."
    minikube image build -t kubi-frontend:latest ./apps/frontend

    # 3.5 Build Agent Image
    echo "Building Agent Image..."
    minikube image build -t kubi-agent:latest ./apps/agent

    # 4. Apply Manifests with Local Overlay
    echo "Applying Kubernetes Manifests using Local Kustomize overlay..."
    kubectl apply -k deploy/k8s/overlays/local/

    # 5. Force Restart (Ensure latest local images are used)
    echo "Restarting Deployments to pick up new images..."
    kubectl rollout restart deployment kubi-backend -n kubi
    kubectl rollout restart deployment kubi-frontend -n kubi
    kubectl rollout restart deployment kubi-agent -n kubi

    minikube service kubi-frontend-service -n kubi
    echo "Deployment Complete!"
    echo "--------------------------------------------------"
    echo "To access the Kubi Frontend dashboard, run:"
    echo "  minikube service kubi-frontend-service -n kubi"
    echo ""
    echo "To access the Kibana UI, run:"
    echo "  kubectl port-forward svc/kibana-service -n kubi 5601:5601"
    echo "  Then navigate to http://localhost:5601"
    echo ""
    echo "To see backend logs:"
    echo "  kubectl logs -l app=kubi-backend -n kubi -f"
    echo "--------------------------------------------------"
    ;;

  minikube-prod|k8s-prod|prod)
    echo "Starting Kubi AI Deployment on Minikube (PRODUCTION mode)..."

    # 1. Check if Minikube is running
    if ! minikube status | grep -q "Running"; then
        echo "Minikube is not running. Please start it with 'minikube start'."
        exit 1
    fi

    # 2. Apply Standard/Global Manifests
    echo "Applying Kubernetes Manifests using Production Kustomize overlay..."
    kubectl apply -k deploy/k8s/overlays/prod/

    minikube service kubi-frontend-service -n kubi
    echo "Deployment Complete!"
    echo "--------------------------------------------------"
    echo "To access the Kubi Frontend dashboard, run:"
    echo "  minikube service kubi-frontend-service -n kubi"
    echo ""
    echo "To access the Kibana UI, run:"
    echo "  kubectl port-forward svc/kibana-service -n kubi 5601:5601"
    echo "  Then navigate to http://localhost:5601"
    echo ""
    echo "To see backend logs:"
    echo "  kubectl logs -l app=kubi-backend -n kubi -f"
    echo "--------------------------------------------------"
    ;;

  helm)
    need helm
    helm upgrade --install kubi deploy/helm/kubi -n kubi --create-namespace --wait "$@"
    ;;

  gke)
    echo "========================================================"
    echo "🚀 Kubi GKE Cluster Provisioner & Bootstrapper"
    echo "========================================================"

    # Check for GCP credentials
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
      echo "❌ Error: gcloud authentication is not active."
      echo "Please run: gcloud auth application-default login"
      exit 1
    fi

    GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo "")}"
    if [ -z "$GCP_PROJECT" ]; then
      echo "❌ Error: GCP project is not configured in gcloud CLI."
      echo "Please run: gcloud config set project YOUR_GCP_PROJECT_ID"
      exit 1
    fi

    echo "🟢 Active GCP Project: $GCP_PROJECT"

    # 1. Provision GKE Cluster via Terraform
    echo -e "\n=== 🛠️ Step 1: Provision GKE via Terraform ==="
    cd "$ROOT/terraform"

    terraform init
    terraform apply -var="project_id=$GCP_PROJECT" -auto-approve

    # Extract credentials command output
    GET_CREDS_CMD=$(terraform output -raw get_credentials_command)

    # 2. Configure Kubectl Context
    echo -e "\n=== 🛰️ Step 2: Fetching Cluster Credentials ==="
    cd "$ROOT"
    eval "$GET_CREDS_CMD"

    # 3. Bootstrap Cluster via ArgoCD
    echo -e "\n=== ⚙️ Step 3: Bootstrapping ArgoCD via Ansible ==="
    cd "$ROOT/ansible"

    if ! command -v ansible-playbook &>/dev/null; then
      echo "⚠️ Warning: ansible-playbook not found locally."
      echo "Applying manifests directly using kubectl fallback..."
      kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
      kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
      echo "⏳ Waiting for ArgoCD server deployment..."
      kubectl wait --namespace argocd --for=condition=available --timeout=300s deployment/argocd-server
      kubectl apply -n argocd -f ../argocd/application.yaml
    else
      ansible-playbook -i inventory.ini playbook.yml
    fi

    # 4. Deploy Observability & Secrets Stack via Helm
    echo -e "\n=== 📊 Step 4: Deploying Observability & Secrets Stack via Helm ==="
    cd "$ROOT"

    if command -v helm &>/dev/null; then
      echo "Registering and updating Helm chart repositories..."
      helm repo add external-secrets https://charts.external-secrets.io
      helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
      helm repo update

      echo "Deploying External Secrets Operator (ESO)..."
      helm upgrade --install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

      echo "Deploying Prometheus and Grafana observability stack..."
      helm upgrade --install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f "$ROOT/k8s/observability/values-prometheus.yaml"
    else
      echo "⚠️ Warning: Helm CLI not found locally. Skipping ESO and Prometheus/Grafana deployments."
      echo "Please install Helm (e.g. 'curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash') to enable automated observability & secrets syncing."
    fi

    echo -e "\n========================================================"
    echo "🎉 Successfully provisioned and bootstrapped your cluster!"
    echo "========================================================"
    ;;

  render-local)
    render_kustomize deploy/k8s/overlays/local
    ;;

  render-prod)
    render_kustomize deploy/k8s/overlays/prod
    ;;

  secrets-local)
    need kubectl
    kubectl apply -k deploy/k8s/secrets/local "$@"
    ;;

  secrets-gcp|external-gcp)
    need kubectl
    kubectl apply -k deploy/k8s/secrets/external/gcp "$@"
    ;;

  start-local|start|dev)
    echo -e "===================================================="
    echo -e "  Kubi Local Dev  -- nginx + port-forward mode"
    echo -e "  Domain: kubi.kontactless.in"
    echo -e "===================================================="
    echo

    # Step 1: Stop stale processes
    echo "[1/6] Stopping stale kubectl port-forwards and nginx..."
    pkill -f "port-forward" 2>/dev/null || true
    docker compose down --remove-orphans >/dev/null 2>&1 || true
    echo "      Done."

    # Step 2: Disable ingress addon (idempotent)
    echo "[2/6] Disabling Minikube ingress addon..."
    if command -v minikube &>/dev/null; then
      if minikube addons list 2>/dev/null | grep -q "ingress: enabled"; then
        minikube addons disable ingress >/dev/null 2>&1 || true
        echo "      Ingress addon disabled."
      else
        echo "      Ingress already disabled or minikube offline."
      fi
    else
      echo "      Minikube command not found. Skipping."
    fi

    # Step 3: Patch hosts file
    echo "[3/6] Checking hosts file entries for domain aliases..."
    HOSTS_FILE="/etc/hosts"
    DOMAINS=("kubi.kontactless.in" "backend.kubi.kontactless.in" "agent.kubi.kontactless.in")
    needs_update=false
    for domain in "${DOMAINS[@]}"; do
      if ! grep -q "$domain" "$HOSTS_FILE" 2>/dev/null; then
        needs_update=true
      fi
    done

    if [ "$needs_update" = true ]; then
      echo "      Adding domain entries to hosts file (requires sudo)..."
      if [ "$EUID" -ne 0 ]; then
        echo -e "      ${WARNING}WARNING: Not running as root. Add these lines to $HOSTS_FILE manually or run with sudo:${NC}"
        for domain in "${DOMAINS[@]}"; do
          echo "        127.0.0.1  $domain"
        done
      else
        echo -e "\n# Kubi local dev" >> "$HOSTS_FILE"
        for domain in "${DOMAINS[@]}"; do
          echo "127.0.0.1  $domain" >> "$HOSTS_FILE"
          echo "      Added: 127.0.0.1  $domain"
        done
      fi
    else
      echo "      All domain entries already present."
    fi

    # Step 4: Start kubectl port-forwards
    echo "[4/6] Starting kubectl port-forwards..."
    need kubectl
    kubectl port-forward --address 0.0.0.0 svc/kubi-backend-service 8000:8000 -n kubi >/dev/null 2>&1 &
    PF_BE_PID=$!
    kubectl port-forward --address 0.0.0.0 svc/kubi-agent-service 8080:8080 -n kubi >/dev/null 2>&1 &
    PF_AG_PID=$!
    sleep 2
    echo "      Backend  -> localhost:8000  (PID $PF_BE_PID)"
    echo "      Agent    -> localhost:8080  (PID $PF_AG_PID)"

    # Step 5: Start nginx Docker container
    echo "[5/6] Starting nginx on port 80..."
    if ! docker compose up -d; then
      echo -e "${ERROR}ERROR: docker compose failed! Ensure Docker is running.${NC}"
      exit 1
    fi
    echo "      nginx running -> http://kubi.kontactless.in"

    # Step 6: Start Next.js dev server
    echo "[6/6] Starting Next.js dev server on port 3001..."
    BACKEND_URL="http://localhost:8000" npm --prefix "$ROOT/apps/frontend" run dev -- --port 3001 >/dev/null 2>&1 &
    FE_PID=$!
    sleep 3
    echo "      Frontend -> localhost:3001 (proxied via nginx as http://kubi.kontactless.in) (PID $FE_PID)"

    echo
    echo -e "===================================================="
    echo -e "  All services started!"
    echo
    echo -e "  Main App:   http://kubi.kontactless.in"
    echo -e "  Login:      http://kubi.kontactless.in/login"
    echo -e "  Register:   http://kubi.kontactless.in/register"
    echo -e "  API Docs:   http://backend.kubi.kontactless.in/docs"
    echo -e "  Agent:      http://agent.kubi.kontactless.in"
    echo -e "  Backend raw:http://localhost:8000/docs"
    echo
    echo -e "  To stop:    ./deploy.sh stop-local"
    echo -e "===================================================="
    echo
    echo "Tailing nginx logs (Ctrl+C to exit)..."
    docker compose logs -f nginx
    ;;

  stop-local|stop)
    echo "Stopping Kubi local dev services..."
    docker compose down
    echo "  nginx stopped."
    
    # Kill port forwards and frontends
    pkill -f "port-forward" 2>/dev/null || true
    pkill -f "next-dev" 2>/dev/null || true
    pkill -f "next/dist/bin/next" 2>/dev/null || true
    echo "  kubectl port-forwards and background jobs stopped."
    echo "Done."
    ;;

  generate-secrets)
    mode="${1:-all}"

    generate() {
      local src="$1"
      local dest="$2"
      if [ -f "$dest" ]; then
        echo "Already exists: $dest"
      else
        cp "$src" "$dest"
        echo "Created $dest with dummy values."
      fi
    }

    case "$mode" in
      local)
        generate ".example.env.local" "deploy/k8s/secrets/local/.env.local"
        ;;
      gcp)
        generate ".example.env.gcp" "deploy/k8s/secrets/external/gcp/.env.gcp"
        ;;
      all)
        generate ".example.env.local" "deploy/k8s/secrets/local/.env.local"
        generate ".example.env.gcp" "deploy/k8s/secrets/external/gcp/.env.gcp"
        ;;
      help|-h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown mode '$mode'." >&2
        exit 1
        ;;
    esac
    ;;

  *)
    echo "Unknown scenario '$scenario'." >&2
    echo
    usage
    exit 1
    ;;
esac
