#!/bin/bash

# Kubi AI Minikube Deployment Script (Bash)

echo "Starting Kubi AI Deployment on Minikube..."

# Check for local deployment flag
USE_LOCAL=false
for arg in "$@"; do
    if [ "$arg" = "--local" ] || [ "$arg" = "-l" ] || [ "$arg" = "local" ]; then
        USE_LOCAL=true
        break
    fi
done

if [ "$USE_LOCAL" = true ]; then
    echo "Starting Kubi AI Deployment on Minikube (LOCAL mode)..."
else
    echo "Starting Kubi AI Deployment on Minikube (GLOBAL mode)..."
fi

# Automatically configure Git to use shared .githooks folder
if [ -d ".git" ]; then
    git config core.hooksPath .githooks 2>/dev/null || true
fi

# 1. Check if Minikube is running
if ! minikube status | grep -q "Running"; then
    echo "Minikube is not running. Please start it with 'minikube start'."
    exit 1
fi

if [ "$USE_LOCAL" = true ]; then
    # 2. Build Backend Image
    echo "Building Backend Image..."
    minikube image build -t kubi-backend:latest ./apps/backend

    # 3. Build Frontend Image
    echo "Building Frontend Image..."
    minikube image build -t kubi-frontend:latest ./apps/frontend

    # 3.5 Build Agent Image
    echo "Building Agent Image..."
    minikube image build -t kubi-agent:latest ./apps/agent

    # 4. Apply Manifests with Local Images
    echo "Applying Kubernetes Manifests with local images..."
    kubectl kustomize deploy/k8s/ | \
      sed -E 's|image:[[:space:]]*[^[:space:]]*kubi-backend:[^[:space:]]*|image: kubi-backend:latest|g' | \
      sed -E 's|image:[[:space:]]*[^[:space:]]*kubi-frontend:[^[:space:]]*|image: kubi-frontend:latest|g' | \
      sed -E 's|image:[[:space:]]*[^[:space:]]*kubi-agent:[^[:space:]]*|image: kubi-agent:latest|g' | \
      kubectl apply -f -

    # 5. Force Restart (Ensure latest local images are used)
    echo "Restarting Deployments to pick up new images..."
    kubectl rollout restart deployment kubi-backend -n kubi
    kubectl rollout restart deployment kubi-frontend -n kubi
    kubectl rollout restart deployment kubi-agent -n kubi
else
    # 4. Apply Standard/Global Manifests
    echo "Applying Kubernetes Manifests with global registry images..."
    kubectl apply -k deploy/k8s/
fi

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
