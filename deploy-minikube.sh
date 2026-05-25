#!/bin/bash

# Kubi AI Minikube Deployment Script (Bash)

echo "Starting Kubi AI Deployment on Minikube..."

# Automatically configure Git to use shared .githooks folder
if [ -d ".git" ]; then
    git config core.hooksPath .githooks 2>/dev/null || true
fi

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

# 4. Apply Manifests
echo "Applying Kubernetes Manifests..."
kubectl apply -k deploy/k8s/
minikube service kubi-frontend-service -n kubi
# echo "Deployment Complete!"
# echo "--------------------------------------------------"
# echo "To access the dashboard, run:"
# echo "  minikube service kubi-frontend-service -n kubi"
# echo ""
# echo "To see logs:"
# echo "  kubectl logs -l app=kubi-backend -n kubi -f"
# echo "--------------------------------------------------"
