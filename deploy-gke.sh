#!/usr/bin/env bash
# ==============================================================================
# Kubi AI - Unified GKE Cluster Creation & GitOps Bootstrap Script
# ==============================================================================
set -euo pipefail

# Ensure we are in the script's root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

# ──────────────────────────────────────────────────────────────────────────────
# 1. Provision GKE Cluster via Terraform
# ──────────────────────────────────────────────────────────────────────────────
echo -e "\n=== 🛠️ Step 1: Provision GKE via Terraform ==="
cd "$SCRIPT_DIR/terraform"

terraform init
terraform apply -var="project_id=$GCP_PROJECT" -auto-approve

# Extract credentials command output
GET_CREDS_CMD=$(terraform output -raw get_credentials_command)

# ──────────────────────────────────────────────────────────────────────────────
# 2. Configure Kubectl Context
# ──────────────────────────────────────────────────────────────────────────────
echo -e "\n=== 🛰️ Step 2: Fetching Cluster Credentials ==="
eval "$GET_CREDS_CMD"

# ──────────────────────────────────────────────────────────────────────────────
# 3. Bootstrap Cluster via Ansible
# ──────────────────────────────────────────────────────────────────────────────
echo -e "\n=== ⚙️ Step 3: Bootstrapping ArgoCD via Ansible ==="
cd "$SCRIPT_DIR/ansible"

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

# ──────────────────────────────────────────────────────────────────────────────
# 4. Deploy Observability & Secrets Stack via Helm
# ──────────────────────────────────────────────────────────────────────────────
echo -e "\n=== 📊 Step 4: Deploying Observability & Secrets Stack via Helm ==="
cd "$SCRIPT_DIR"

if command -v helm &>/dev/null; then
  echo "Registering and updating Helm chart repositories..."
  helm repo add external-secrets https://charts.external-secrets.io
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
  helm repo update

  echo "Deploying External Secrets Operator (ESO)..."
  helm upgrade --install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

  echo "Deploying Prometheus and Grafana observability stack..."
  helm upgrade --install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f "$SCRIPT_DIR/k8s/observability/values-prometheus.yaml"
else
  echo "⚠️ Warning: Helm CLI not found locally. Skipping ESO and Prometheus/Grafana deployments."
  echo "Please install Helm (e.g. 'curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash') to enable automated observability & secrets syncing."
fi

echo -e "\n========================================================"
echo "🎉 Successfully provisioned and bootstrapped your cluster!"
echo "========================================================"
