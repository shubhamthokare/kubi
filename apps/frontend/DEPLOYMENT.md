# kubi AI Deployment Guide

This guide outlines how to deploy the kubi AI agent. You can run kubi locally for testing or deploy it directly into a Kubernetes cluster as an in-cluster operational agent.

---

## 1. Local Deployment (Testing & Development)

Running locally is the easiest way to test kubi AI against a remote or local cluster (like Minikube/Docker Desktop).

### Prerequisites
- Python 3.10+
- MongoDB instance (Local or Atlas)
- Active `~/.kube/config` with admin privileges to the target cluster
- Gemini API Key

### Steps
1. **Start MongoDB**:
   ```bash
   docker run -d -p 27017:27017 --name kubi-mongo mongo
   ```
2. **Configure Environment**:
   Inside the `backend/` directory, create a `.env` file:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   MONGODB_URL="mongodb://localhost:27017"
   DATABASE_NAME="kubi"
   GITLAB_PRIVATE_TOKEN="your-gitlab-token" # Optional for Phase 3
   ```
3. **Install Dependencies**:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .\.venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. **Run the API**:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
5. **Test via CLI**:
   In a new terminal window, run:
   ```bash
   python backend/app/cli/cli.py --namespace default
   ```

---

## 2. In-Cluster Kubernetes Deployment (Production)

Deploying kubi AI inside your Kubernetes cluster allows it to automatically use the cluster's internal service account credentials without needing a `kubeconfig` file.

### Prerequisites
You will need to build the Docker image for the backend and push it to a container registry accessible by your cluster.

### A. Build the Docker Image
Create a `Dockerfile` in the `backend/` directory:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```
Build and push:
```bash
docker build -t your-registry/kubi-backend:latest ./backend
docker push your-registry/kubi-backend:latest
```

### B. Kubernetes Manifests

You must grant kubi AI the necessary RBAC permissions to read logs and patch deployments.

**1. Create a `kubi-rbac.yaml` file:**
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kubi-sa
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubi-role
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "patch", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kubi-rolebinding
subjects:
- kind: ServiceAccount
  name: kubi-sa
  namespace: default
roleRef:
  kind: ClusterRole
  name: kubi-role
  apiGroup: rbac.authorization.k8s.io
```

**2. Create a `kubi-deployment.yaml` file:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubi-backend
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kubi-backend
  template:
    metadata:
      labels:
        app: kubi-backend
    spec:
      serviceAccountName: kubi-sa  # Attach the RBAC permissions
      containers:
      - name: kubi-backend
        image: your-registry/kubi-backend:latest
        env:
        - name: GEMINI_API_KEY
          valueFrom:
            secretKeyRef:
              name: kubi-secrets
              key: GEMINI_API_KEY
        - name: MONGODB_URL
          value: "mongodb://your-mongo-service:27017" # Point to your cluster's MongoDB
        ports:
        - containerPort: 8000
```

**3. Deploy to Cluster:**
```bash
# First, create your secrets
kubectl create secret generic kubi-secrets --from-literal=GEMINI_API_KEY=your-api-key

# Apply the manifests
kubectl apply -f kubi-rbac.yaml
kubectl apply -f kubi-deployment.yaml
```

Once deployed, kubi AI will automatically use `config.load_incluster_config()` and will be ready to accept scan requests via its internal Kubernetes Service!
