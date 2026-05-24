# 🚀 Deployment Guide: Kubi AI

This guide provides step-by-step instructions for building and deploying the **Kubi AI** platform across different environments. Kubi AI is designed to run in containerized environments (using Docker Compose) or orchestrated environments (using Kubernetes/Minikube).

---

## 📋 Prerequisites

Before deployment, ensure the following tools are installed and configured:
- **Docker Desktop**: [Download here](https://www.docker.com/products/docker-desktop/) (must be running).
- **kubectl**: [Download here](https://kubernetes.io/docs/tasks/tools/) (required for Kubernetes cluster orchestration).
- **Google Gemini API Key**: Required for AI-driven Root Cause Analysis (RCA).
- **Minikube**: [Download here](https://minikube.sigs.k8s.io/docs/start/) (required for local Kubernetes orchestration).

---

## 🐳 1. Local Container Deployment (Docker Compose)

The fastest way to spin up the entire **Kubi AI** monorepo stack (Next.js Frontend, FastAPI Backend, MongoDB Database, and Agent Daemon) is using our cross-platform Docker deployment scripts.

### Windows (PowerShell)
Execute the script from the repository root:
```powershell
./deploy-docker.ps1
```

### macOS / Linux (Bash)
Make the script executable and execute it from the repository root:
```bash
chmod +x deploy-docker.sh
./deploy-docker.sh
```

### What these scripts do:
1. Validate required environment engines (Docker, Docker Compose).
2. Scan and load configuration parameters from `apps/backend/.env`.
3. Construct the container services in [`deploy/container/docker-compose.yml`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/container/docker-compose.yml).
4. Run the entire multi-container service in detached mode.

---

## ☸️ 2. Local Kubernetes Deployment (Minikube)

We supply automated helper scripts to orchestrate local Kubernetes builds and service tunnels.

### 1. Start Minikube
Open your terminal and boot Minikube:
```bash
minikube start --driver=docker
```

### 2. Execute Deployment Script
Run the platform build sequence from the repository root:

#### Windows (PowerShell)
```powershell
./deploy-minikube.ps1
```

#### macOS / Linux (Bash)
```bash
chmod +x deploy-minikube.sh
./deploy-minikube.sh
```

### 3. Open SRE Dashboard
Once all services roll out successfully, create an ingress tunnel to access the frontend:
```bash
minikube service kubi-frontend-service -n kubi
```
This command maps the Minikube node port to a local address and automatically opens the **Kubi AI Dashboard** in your default web browser.

---

## ☁️ 3. Production/Manual Kubernetes Deployment (Kustomize)

For manual setups or remote cloud-native clusters (EKS, GKE, AKS), use Kustomize to deploy base configurations and resource layers.

### 1. Prepare Environments & Secrets
Kubi AI relies on a secure base configuration. Map your `GEMINI_API_KEY` into your secret overlays inside [`deploy/k8s/be/.env`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/k8s/be/.env):
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Apply Namespace & Cluster Rules
Create the orchestrating namespaces:
```bash
kubectl apply -f deploy/k8s/base/namespace.yaml
kubectl apply -f deploy/k8s/base/configmap.yaml
```

### 3. Deploy Platform Components
Deploy Frontend, Backend, Agent, and Database layers via Kustomize:
```bash
kubectl apply -k deploy/k8s/
```

Verify service rollouts:
```bash
kubectl get deployments -n kubi
kubectl get pods -n kubi
```

---

## 🎯 4. Production Deployment with Helm

**Helm** provides a templated, package-manager approach to Kubernetes deployments. This is the **recommended method for production environments** due to versioning, release management, and easy rollbacks.

### 1. Helm Chart Structure
The Kubi AI Helm chart is located at `deploy/helm/`:
```
deploy/helm/
├── Chart.yaml              # Chart metadata
├── values.yaml             # Default configuration values
├── values-prod.yaml        # Production-specific overrides
├── values-staging.yaml     # Staging-specific overrides
└── templates/              # Kubernetes manifest templates
    ├── namespace.yaml
    ├── configmap.yaml
    ├── secrets.yaml
    ├── backend-deployment.yaml
    ├── frontend-deployment.yaml
    ├── agent-daemonset.yaml
    ├── mongodb-statefulset.yaml
    ├── services.yaml
    └── ingress.yaml
```

### 2. Install Helm Chart (Recommended)

#### Validate the Chart
```bash
helm lint deploy/helm/
```

#### Dry-Run Installation (Verify before deploying)
```bash
helm install kubi deploy/helm/ \
  --namespace kubi \
  --create-namespace \
  --values deploy/helm/values-prod.yaml \
  --dry-run \
  --debug
```

#### Install Helm Release
```bash
helm install kubi deploy/helm/ \
  --namespace kubi \
  --create-namespace \
  --values deploy/helm/values-prod.yaml \
  --wait
```

#### Verify Installation
```bash
helm status kubi -n kubi
helm get values kubi -n kubi
kubectl get all -n kubi
```

### 3. Update Helm Values for Your Environment

Edit `deploy/helm/values-prod.yaml` with your production settings:

```yaml
# Database Configuration
mongodb:
  enabled: true
  auth:
    enabled: true
    password: "your-secure-password"
  persistence:
    size: 50Gi
    storageClass: "fast-ssd"

# Backend Service
backend:
  replicas: 3
  image:
    tag: "v1.0.0"
  env:
    GEMINI_API_KEY: "your-gemini-key"
    LOG_LEVEL: "INFO"
  resources:
    requests:
      memory: "256Mi"
      cpu: "250m"
    limits:
      memory: "512Mi"
      cpu: "500m"

# Frontend Service
frontend:
  replicas: 2
  image:
    tag: "v1.0.0"
  resources:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "256Mi"
      cpu: "200m"

# Agent Service
agent:
  enabled: true
  replicas: 1
  image:
    tag: "v1.0.0"

# Ingress Configuration
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: "kubi.example.com"
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: kubi-tls
      hosts:
        - kubi.example.com

# Elasticsearch
elasticsearch:
  enabled: true
  replicas: 2
  resources:
    limits:
      memory: "1Gi"
    requests:
      memory: "512Mi"
```

### 4. Upgrade an Existing Helm Release

When deploying updates:

```bash
# Update Helm repository (if using remote charts)
helm repo update

# Upgrade release with new values
helm upgrade kubi deploy/helm/ \
  --namespace kubi \
  --values deploy/helm/values-prod.yaml \
  --wait

# Verify upgrade
helm status kubi -n kubi
kubectl rollout status deployment/kubi-backend -n kubi
```

### 5. Rollback a Helm Release

If an upgrade causes issues:

```bash
# View release history
helm history kubi -n kubi

# Rollback to previous release
helm rollback kubi -n kubi

# Rollback to specific revision
helm rollback kubi 2 -n kubi
```

### 6. Helm Release Management

```bash
# List all Helm releases
helm list -n kubi

# Get current release values
helm get values kubi -n kubi

# Get Helm manifest (rendered YAML)
helm get manifest kubi -n kubi

# Test Helm release
helm test kubi -n kubi

# Uninstall Helm release
helm uninstall kubi -n kubi
```

### 7. Setting Up Helm Chart Repository (Optional)

To make Helm charts available publicly:

```bash
# Package the chart
helm package deploy/helm/

# Create index for repository
helm repo index . --url https://charts.kubi.ai

# Publish to GitHub Pages or S3
# (Instructions depend on your hosting choice)

# Users can then install with:
helm repo add kubi https://charts.kubi.ai
helm repo update
helm install kubi kubi/kubi-platform -n kubi --create-namespace
```

---

## ☁️ 5. Google Kubernetes Engine (GKE) Connection & Deployment Guide

This section outlines how to configure, connect, and orchestrate the **Kubi AI** platform in a production **Google Kubernetes Engine (GKE)** cluster.

### 1. Authenticate with Google Cloud Platform (GCP)
Ensure you have the Google Cloud CLI (`gcloud`) installed. Authenticate with your GCP account:
```bash
# Login to your GCP account
gcloud auth login

# Set your active GCP project ID
gcloud config set project <YOUR_PROJECT_ID>
```

### 2. Configure GKE kubectl Authentication
Install the mandatory GKE credentials plugin and switch your active Kubernetes context to your target GKE cluster:
```bash
# Install GKE authentication plugin (required for kubectl >= 1.26)
gcloud components install gke-gcloud-auth-plugin

# Retrieve GKE cluster credentials to automatically update your local ~/.kube/config
gcloud container clusters get-credentials <YOUR_CLUSTER_NAME> \
  --region <YOUR_CLUSTER_REGION> \
  --project <YOUR_PROJECT_ID>

# Verify target context is properly loaded and active
kubectl config current-context
kubectl cluster-info
```

### 3. Orchestrate with GKE SSD Storage Classes
GKE includes standard persistent disk storage classes. When executing Kustomize or Helm installations, verify you map persistent volumes to GKE's native `premium-rwo` (SSD persistent disk) or `standard-rwo` storage classes:

#### Helm GKE Deployment
```bash
# Install with production values, overriding storageClass for MongoDB & Elasticsearch to GKE SSDs
helm install kubi deploy/helm/ \
  --namespace kubi \
  --create-namespace \
  --set mongodb.persistence.storageClass=premium-rwo \
  --set elasticsearch.persistence.storageClass=premium-rwo \
  --values deploy/helm/values-prod.yaml
```

### 4. Configure Public/Internal Dashboard Routing
To expose the **Kubi AI Dashboard** publicly or internally inside GCP:

#### Option A: GCP HTTP(S) Load Balancer (Recommended for Prod)
Update `deploy/helm/values-prod.yaml` or write GKE Ingress annotations:
```yaml
ingress:
  enabled: true
  className: "gce" # Directs GKE to provision a Google Cloud HTTP(S) Load Balancer
  annotations:
    networking.gke.io/managed-certificates: "kubi-cert" # GCP managed SSL
    kubernetes.io/ingress.class: "gce"
```

#### Option B: Quick Public LoadBalancer
For quick staging exposure, patch the frontend Service to type `LoadBalancer`, which instructs GKE to provision a network load balancer:
```bash
# Patch frontend service type
kubectl patch svc kubi-frontend-service -n kubi -p '{"spec": {"type": "LoadBalancer"}}'

# Watch and retrieve the External IP assigned by GCP
kubectl get svc kubi-frontend-service -n kubi --watch
```

### 5. Accessing logs via RBAC in GKE
Ensure that the `kubi-backend` has necessary RBAC to fetch container logs. The Helm chart sets up the standard `ClusterRole` binding in GKE which gives `kubi-backend-sa` permission to `get`, `list`, and `watch` logs across selected namespaces.

---

## 🔍 Troubleshooting

### ❌ 'minikube' is not recognized
On Windows, if PowerShell flags the minikube command as missing, the environment path needs to be appended.
- **Temporary Fix**:
  ```powershell
  $env:Path += ";C:\Program Files\Kubernetes\Minikube"
  ```
- **Permanent Fix**: Add `C:\Program Files\Kubernetes\Minikube` to your Windows User or System Environment Variables under the `Path` keyword.

### ❌ ImagePullBackOff inside Pods
If Kubernetes pods fail to fetch images:
1. Verify your shell is linked directly to the Minikube container daemon:
   ```bash
   eval $(minikube docker-env)
   ```
2. Double check that `imagePullPolicy` in the manifest files is configured as `IfNotPresent`, preventing pods from trying to contact external image registries.

### ❌ MongoDB Connection Failures
Verify the status of your database pod:
```bash
kubectl get pods -n kubi -l app=mongodb
```
If MongoDB restarts, the backend automatically performs reconnect attempts to the host `mongodb-service:27017`.

---
*Updated: May 18, 2026*  
*Deployment Engine Version: 1.0+*
