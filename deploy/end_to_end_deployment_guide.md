# Production GitOps Runbook: End-to-End GKE Deployment with GitLab CI/CD Tunnel

This runbook provides a complete, production-grade guide to configuring, securing, and auto-deploying the **Kubi AI SRE Platform** on **Google Kubernetes Engine (GKE)** using the secure **GitLab CI/CD Agent Tunnel** and **Google Secret Manager (GSM)**.

---

## 🏗️ End-to-End GitOps Architecture

Rather than storing cluster administrative credentials in GitLab or using insecure pull-based agents, this architecture leverages the native **GitLab CI/CD Tunnel** and **External Secrets Operator (ESO)** for a secure, push-based GitOps flow.

```mermaid
graph TD
    subgraph GitLab Cloud
        Dev[Developer Push] -->|1. Commit to main| GL[GitLab Repo: kubi-agent/kubi]
        GL -->|2. Trigger Pipeline| Runner[GitLab Runner]
        Runner -->|3. Build & Push Containers| GAR
    end

    subgraph Google Cloud Platform (GCP)
        GAR[(Google Artifact Registry)]
        GSM[(Google Secret Manager)]
    end

    subgraph GKE Cluster (stone-fortress-338918)
        direction TB
        Agent[GitLab Agent: kubi-cd-agent] <-->|Secure gRPC Tunnel| GL
        Runner -->|4. Deploy via Tunnel context| Agent
        Agent -->|5. Apply manifests| K8sApi[K8s API Server]
        
        K8sApi -->|6. Trigger reconciliation| ESO[External Secrets Operator]
        ESO -->|7. Authenticate via gcpsm-service-account-key| GSM
        ESO -->|8. Fetch GEMINI_API_KEY & GITLAB_PRIVATE_TOKEN| GSM
        ESO -->|9. Create Secret: kubi-secrets| KubiNS[kubi namespace]
        
        KubiNS -->|10. Pull containers| GAR
        KubiNS -->|11. Bind Secrets| Pods[Kubi Pods: backend, frontend, agent]
    end
```

---

## 🛠️ Step 1: Google Cloud Infrastructure & Service Account Setup

To orchestrate GKE and Google Cloud services, we use a dedicated GCP service account **`kubi-sa`** configured with minimum-privilege IAM roles.

### 1. Enable Required Google Cloud APIs
Run this in your terminal to enable Google Secret Manager and Artifact Registry APIs:
```bash
gcloud services enable \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com
```

### 2. Create the Docker Repository in Artifact Registry
Create the registry in the `asia-south1` region:
```bash
gcloud artifacts repositories create kubi-repo \
    --repository-format=docker \
    --location=asia-south1 \
    --description="Kubi Container Registry"
```

### 3. Setup the GCP Service Account & Bind IAM Permissions
The service account `kubi-sa` requires **Artifact Registry Writer** (to push images from the pipeline) and **Secret Manager Secret Accessor** (to allow the GKE cluster to fetch keys):

```bash
# 1. Grant Artifact Registry Writer (Image building/pushing)
gcloud projects add-iam-policy-binding stone-fortress-338918 \
    --member="serviceAccount:kubi-sa@stone-fortress-338918.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

# 2. Grant Secret Manager Secret Accessor (GKE secrets extraction)
gcloud projects add-iam-policy-binding stone-fortress-338918 \
    --member="serviceAccount:kubi-sa@stone-fortress-338918.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 4. Generate the GCP Service Account Key
Generate the authentication JSON key which will be used by both the GitLab Runner and GKE:
```bash
gcloud iam service-accounts keys create gcp-key.json \
    --iam-account=kubi-sa@stone-fortress-338918.iam.gserviceaccount.com
```

---

## 🔒 Step 2: Google Secret Manager Vault Setup

We store sensitive credentials securely inside Google Secret Manager. 

### 1. Create the Secrets
Run the following commands to add your keys (note the case-sensitive names, which match your GKE mappings):

```bash
# 1. Upload the Gemini API Key
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_ACTUAL_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 2. Upload the GitLab Personal Access Token
gcloud secrets create GITLAB_PRIVATE_TOKEN --replication-policy="automatic"
echo -n "YOUR_ACTUAL_GITLAB_ACCESS_TOKEN" | gcloud secrets versions add GITLAB_PRIVATE_TOKEN --data-file=-
```

---

## 🛰️ Step 3: GKE Cluster Bootstrap & Secret Store Authentication

With the cluster active, we install the **External Secrets Operator (ESO)** and bootstrap the secrets authentication layer.

### 1. Install the External Secrets Operator CRDs & Controller
Apply the compiled operator manifests directly to your cluster:
```bash
kubectl apply -f https://github.com/external-secrets/external-secrets/releases/download/v0.9.11/external-secrets.yaml
```

### 2. Load the Service Account Key into GKE
Create a generic secret named `gcpsm-service-account-key` inside GKE's `kube-system` namespace. The operator reads this key to authenticate with Secret Manager:
```bash
kubectl create secret generic gcpsm-service-account-key \
    --from-file=key.json=gcp-key.json \
    -n kube-system
```

### 3. Apply the ClusterSecretStore Manifest
The [`ClusterSecretStore`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/k8s/base/secrets/ClusterSecretStore.yaml) resource connects GKE globally to Google Secret Manager:
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: gcp-secret-store
spec:
  provider:
    gcpsm:
      projectID: stone-fortress-338918
      auth:
        secretRef:
          secretAccessKeySecretRef:
            name: gcpsm-service-account-key
            key: key.json
            namespace: kube-system
```
Apply it to the cluster:
```bash
kubectl apply -f deploy/k8s/base/secrets/ClusterSecretStore.yaml
```

### 4. Apply the ExternalSecret Manifest
The [`ExternalSecret`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/k8s/base/secrets/ExternalSecret.yaml) maps your case-sensitive GCP Secret Manager secrets directly to your local namespace secret `kubi-secrets`:
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: kubi-external-secrets
  namespace: kubi
spec:
  refreshInterval: 15m
  secretStoreRef:
    name: gcp-secret-store
    kind: ClusterSecretStore
  target:
    name: kubi-secrets
    creationPolicy: Owner
  data:
    - secretKey: GEMINI_API_KEY
      remoteRef:
        key: GEMINI_API_KEY
    - secretKey: GITLAB_TOKEN
      remoteRef:
        key: GITLAB_PRIVATE_TOKEN
```
Apply it to the cluster:
```bash
kubectl apply -f deploy/k8s/base/secrets/ExternalSecret.yaml
```

---

## 🦊 Step 4: GitLab CI/CD Variables & Tunnel Setup

### 1. Configure GitLab CI/CD Variables
In GitLab, go to **Settings > CI/CD > Variables** and configure:

1. **`GCP_PROJECT_ID`**:
   * **Value**: `stone-fortress-338918`
2. **`GCP_SERVICE_KEY`**:
   * **Value**: Paste the entire raw JSON contents of your `gcp-key.json` file. *(Our pipeline automatically detects if it is base64-encoded or standard JSON and decodes it safely in-memory).*
3. **`GL_ACCESS_TOKEN`**:
   * **Value**: A GitLab access token with `write_repository` scopes (allows the pipeline to promote image tags).

### 2. Connect Your GitLab Agent
Make sure your running GitLab Agent in GKE is registered in the repository under **Operate > Kubernetes clusters** matching the agent name:
`kubi-cd-agent`

The agent configuration file is saved at:
`.gitlab/agents/kubi-cd-agent/config.yaml`

---

## 🚀 Step 5: The Automated GitOps Pipeline

When code is pushed to your `main` branch, the GitLab CI/CD pipeline triggers the following automated execution loop:

1. **Build Stage:** The runner compiles the `backend`, `frontend`, and `agent` Docker containers, authenticating securely with Google Artifact Registry, and pushes them to your project repository.
2. **GitOps Stage:** The runner:
   * Sets the new image tags in `kustomization.yaml`.
   * Compiles and renders Kustomize manifests into a single, flat `deploy/manifests/hydrated.yaml` file (manifest hydration).
   * **Selects the secure, encrypted gRPC Agent Tunnel context:**
     `kubectl config use-context kubi-agent/kubi:kubi-cd-agent`
   * Deploys the hydrated manifests directly onto GKE:
     `kustomize build . | kubectl apply -f -`
   * Commits the updated tags back to Git with `[skip ci]` to complete the cycle safely.

---

## 🔎 SRE Verification & Troubleshooting Runbook

Run these commands in your local console to check cluster health and debug any GitOps synchronization issues:

### 1. Verify Secret Synchronizations
```bash
# Check if ClusterSecretStore is active and authenticated
kubectl get clustersecretstore gcp-secret-store

# Check if the ExternalSecret is synced and READY is True
kubectl get externalsecret kubi-external-secrets -n kubi

# Verify that the local Kubernetes secret is created and populated
kubectl get secret kubi-secrets -n kubi -o yaml
```

### 2. Check Workload Statuses
```bash
# Monitor GKE pods in the kubi namespace
kubectl get pods -n kubi -w

# Stream logs of the running backend container
kubectl logs -n kubi -l app=kubi-backend -f
```

### 3. Check GitLab Agent Status & Connection Tunnel
```bash
# Check if the GitLab Agent pod is running
kubectl get pods -n gitlab-agent-kubi-cd-agent

# Stream GitLab Agent logs to verify tunnel connections
kubectl logs -n gitlab-agent-kubi-cd-agent -l app.kubernetes.io/name=gitlab-agent --tail=100 -f
```
