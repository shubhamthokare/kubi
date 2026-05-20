# Kubi AI Deployment Guide

This guide outlines how to deploy Kubi AI using Kubernetes manifests. This is the recommended way to run Kubi in production or local development (using Minikube/Kind).

---

## 1. Prerequisites
- A Kubernetes cluster (Minikube, Kind, or a Cloud provider like GKE/EKS).
- `kubectl` CLI installed and configured.
- Google Gemini API Key.

---

## 2. Deployment Steps

### A. Namespace Configuration
First, create the dedicated namespace for Kubi AI:
```bash
kubectl apply -f k8s/namespace.yaml
```

### B. Configuration & Secrets
Edit `k8s/secret.yaml` and `k8s/configmap.yaml` to include your configuration and `GEMINI_API_KEY`.

Apply the configuration:
```bash
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
```

### C. Deploy Full Stack (Recommended)
The easiest way to deploy all components is using Kustomize:
```bash
kubectl apply -k k8s/
```

### D. Individual Component Deployment
If you prefer to deploy components individually:

#### MongoDB
```bash
kubectl apply -f k8s/mongodb-pvc.yaml
kubectl apply -f k8s/mongodb-deployment.yaml
kubectl apply -f k8s/mongodb-service.yaml
```

#### Backend Agent
```bash
kubectl apply -f k8s/backend-sa.yaml
kubectl apply -f k8s/backend-role.yaml
kubectl apply -f k8s/backend-binding.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/backend-service.yaml
```

#### Frontend Dashboard
```bash
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
```

---

## 3. Verification

### Check Pod Status
Ensure all pods are running in the `kubi` namespace:
```bash
kubectl get pods -n kubi
```

### Accessing the Dashboard
By default, the frontend service is set to `LoadBalancer`. If you are running locally (e.g., on Minikube), you can use port-forwarding:

```bash
kubectl port-forward svc/kubi-frontend-service 3000:80 -n kubi
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 4. Troubleshooting

### RBAC Issues
If the backend logs show "Forbidden" errors when trying to access the K8s API, ensure the `ServiceAccount` and `ClusterRoleBinding` were applied correctly:
```bash
kubectl describe clusterrolebinding kubi-backend-rolebinding
```

### Database Connection
If the backend fails to connect to MongoDB, verify the `mongodb-service` is reachable:
```bash
kubectl get svc -n kubi
```
The backend expects MongoDB at `mongodb-service:27017` (as defined in `kubi-config`).
