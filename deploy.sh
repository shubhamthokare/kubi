#!/usr/bin/env bash
# ==============================================================================
# Kubi AI - Unified Deployment Orchestrator Script (Bash)
# Co-authored by Antigravity (Google DeepMind)
# ==============================================================================
set -euo pipefail

# Color Codes
INFO='\033[0;36m'   # Cyan
SUCCESS='\033[0;32m' # Green
WARNING='\033[0;33m' # Yellow
ERROR='\033[0;31m'   # Red
NC='\033[0m'        # No Color

show_help() {
  echo -e "${INFO}========================================================${NC}"
  echo -e "🚀 ${SUCCESS}Kubi AI - Unified Deployment Orchestrator${NC}"
  echo -e "${INFO}========================================================${NC}"
  echo -e "Usage:"
  echo -e "  ./deploy.sh <target> [options]"
  echo -e ""
  echo -e "Targets:"
  echo -e "  ${SUCCESS}docker${NC} (or ${SUCCESS}compose${NC})    Deploy locally using Docker Compose"
  echo -e "  ${SUCCESS}minikube${NC} (or ${SUCCESS}k8s${NC})     Deploy to local Kubernetes/Minikube cluster"
  echo -e "  ${SUCCESS}helm${NC}                   Deploy to Kubernetes using Helm Chart release"
  echo -e "  ${SUCCESS}gke${NC} (or ${SUCCESS}cloud${NC})       Provision and deploy to Google Kubernetes Engine (GKE)"
  echo -e ""
  echo -e "Options for 'minikube':"
  echo -e "  --local, -l, local    Build local container images directly inside Minikube"
  echo -e "                        (otherwise uses standard pre-built global images)"
  echo -e "  --prod, -p, prod      Apply production kustomize overlay deployments in Minikube"
  echo -e ""
  echo -e "Examples:"
  echo -e "  ./deploy.sh docker"
  echo -e "  ./deploy.sh minikube --local"
  echo -e "  ./deploy.sh minikube --prod"
  echo -e "  ./deploy.sh helm"
  echo -e "  ./deploy.sh gke"
  echo -e "${INFO}--------------------------------------------------------${NC}"
}

# If run without arguments, or with help
if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ] || [ "$1" = "help" ]; then
  show_help
  exit 0
fi

TARGET="$1"
shift # remove target from arguments

case "$TARGET" in
  docker|compose)
    echo -e "${INFO}Selected Target: Docker Compose${NC}"
    ./deploy-docker.sh "$@"
    ;;
  minikube|k8s|k8s-local)
    echo -e "${INFO}Selected Target: Local Kubernetes (Minikube)${NC}"
    ./deploy-minikube.sh "$@"
    ;;
  helm)
    echo -e "${INFO}Selected Target: Helm Release${NC}"
    helm upgrade --install kubi deploy/helm/kubi -n kubi --create-namespace --wait "$@"
    ;;
  gke|cloud)
    echo -e "${INFO}Selected Target: Google Kubernetes Engine (GKE)${NC}"
    ./deploy/deploy-gke.sh "$@"
    ;;
  *)
    echo -e "${ERROR}Error: Unknown target '$TARGET'${NC}"
    echo -e ""
    show_help
    exit 1
    ;;
esac
