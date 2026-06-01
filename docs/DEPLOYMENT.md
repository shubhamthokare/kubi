# 📋 Master Deployment & Operations Runbook

This guide is the unified, production-grade master deployment guide for the **Kubi AI Autonomous SRE Platform**. It consolidates all deployment strategies—including **Docker Compose local development**, **local Minikube orchestration**, **manual Kustomize overlays**, and **production GKE cloud deployments with GitOps & Fluent Bit pipelines**—under a single, cohesive handbook.

For a streamlined operations experience, all environments utilize our cross-platform orchestrator wrappers:
*   💻 **Windows PowerShell**: [`./deploy.ps1`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy.ps1)
*   🍎 **macOS / Linux Bash**: [`./deploy.sh`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy.sh)

---

## 🏗️ End-to-End System Topologies

### 1. Local Container Stack (Docker Compose)
In Docker Compose mode, all SRE services run inside an isolated network bridging host boundaries.

```mermaid
graph TD
    subgraph Host Network
        FE_Port[Port 3000] -.-> FE
        BE_Port[Port 8000] -.-> BE
        Kibana_Port[Port 5601] -.-> Kibana
    end

    subgraph Kubi Network
        FE[Kubi Frontend - Next.js] -->|API Calls| BE[Kubi Backend - FastAPI]
        BE -->|Store Metrics| MongoDB[(MongoDB)]
        BE -->|Index Incident Data| ES[(Elasticsearch)]
        Kibana[Kibana] -->|Visualize Logs| ES
        
        Agent[Kubi Agent - Python] -->|Watch APIs| K8s_API[Host Kubernetes cluster]
        Agent -->|Post Incidents| BE
    end

    style FE fill:#f9fafb,stroke:#3b82f6,stroke-width:2px
    style BE fill:#f9fafb,stroke:#3b82f6,stroke-width:2px
    style Agent fill:#f9fafb,stroke:#3b82f6,stroke-width:2px
    style MongoDB fill:#eff6ff,stroke:#10b981,stroke-width:2px
    style ES fill:#eff6ff,stroke:#10b981,stroke-width:2px
    style Kibana fill:#eff6ff,stroke:#10b981,stroke-width:2px
```

### 2. GKE Production GitOps & Hydration Topology
Production pipelines automate container building and secret hydration using Google Secret Manager and External Secrets Operator.

```mermaid
graph TD
    subgraph GitLab_Cloud ["GitLab Cloud"]
        Dev["Developer Push"] -->|1. Commit to main| GL["GitLab Repo"]
        GL -->|2. Trigger Pipeline| Runner["GitLab Runner"]
        Runner -->|3. Build & Push Containers| GAR
    end

    subgraph GCP_Platform ["Google Cloud Platform (GCP)"]
        GAR[("Google Artifact Registry")]
        GSM[("Google Secret Manager")]
    end

    subgraph GKE_Cluster ["GKE Cluster"]
        direction TB
        Agent["GitLab Agent Tunnel"] ---|Secure gRPC Tunnel| GL
        Runner -->|4. Deploy via Tunnel context| Agent
        Agent -->|5. Apply manifests| K8sApi["K8s API Server"]
        
        K8sApi -->|6. Trigger reconciliation| ESO["External Secrets Operator"]
        ESO -->|7. Authenticate via gcpsm-sa-key| GSM
        ESO -->|8. Fetch GEMINI_API_KEY & GITLAB_PRIVATE_TOKEN| GSM
        ESO -->|9. Create Secret: kubi-secrets| KubiNS["kubi namespace"]
        
        KubiNS -->|10. Pull containers| GAR
        KubiNS -->|11. Bind Secrets| Pods["Kubi Pods: backend, frontend, agent"]
    end
```

---

## 📋 General Prerequisites

Ensure the following tools are installed and configured on your host system:
*   **Docker Desktop & Engine**: [Install Docker](https://www.docker.com/products/docker-desktop/) (must be actively running).
*   **kubectl**: [Install kubectl](https://kubernetes.io/docs/tasks/tools/) (target cluster CLI client).
*   **Minikube**: [Install Minikube](https://minikube.sigs.k8s.io/docs/start/) (required for local Kubernetes integration).
*   **Helm**: [Install Helm](https://helm.sh/docs/intro/install/) (required for packaged chart releases).
*   **Google Cloud SDK**: [Install gcloud](https://cloud.google.com/sdk/docs/install) (required for GKE clusters).

---

## ⚡ Deployment Playbooks via Unified Orchestrator

The unified script dynamically bootstraps your targets. If run without arguments, it displays full command helper instructions.

```powershell
# PowerShell helper
./deploy.ps1 -Help

# Bash helper
./deploy.sh --help
```

---

### 1️⃣ Local Docker Compose Stack

This strategy builds and boots the core platform inside a local container network, mapping the local ports:
*   **Frontend Console**: `http://localhost:3000`
*   **FastAPI Backend**: `http://localhost:8000`
*   **Kibana Panel**: `http://localhost:5601`

```bash
# PowerShell
./deploy.ps1 docker

# Bash
./deploy.sh docker
```

#### Manual Alternative
```bash
docker compose -f deploy/container/docker-compose.yml up --build -d
```

---

### 2️⃣ Local Kubernetes In-Cluster Stack (Minikube)

Deploys the production manifest overlays inside your active Minikube cluster and configures port forwarding for immediate access.

```bash
# 1. Boot Minikube node
minikube start --driver=docker

# 2. PowerShell deployment
./deploy.ps1 minikube -Prod

# 3. Bash deployment
./deploy.sh minikube -Prod
```

#### Adapted Host-to-Container Minikube Integration
If you choose to run the agent inside a Docker container while Minikube is on the host, adapt the credentials profile mount paths:
1.  **Configure Loopback Gateways**: Replace target cluster server port configurations from `127.0.0.1:<port>` to `host.docker.internal:<port>`.
2.  **Mount Certificates Read-Only**: Mount your local Minikube certificates root into the container space inside `docker-compose.yml`:
    ```yaml
    volumes:
      - C:\Users\<USERNAME>\.minikube:/root/.minikube:ro
      - ./deploy/kubeconfig:/root/.kube/config:ro
    ```
3.  **Bypass TLS Assertion**: Since certificates are mapped for localhost gateways, configure python cluster clients to ignore assertion matching:
    ```python
    configuration = client.Configuration.get_default_copy()
    configuration.assert_hostname = False
    client.Configuration.set_default(configuration)
    ```

---

### 3️⃣ Production Packaged Releases (Helm Charts)

Using Helm provides linting, version control, structured release rollouts, and single-command rollbacks.

```bash
# 1. Perform static analysis and linting
helm lint deploy/helm/

# 2. Run dry-run compilation checks
helm install kubi deploy/helm/ --namespace kubi --create-namespace --values deploy/helm/values-prod.yaml --dry-run --debug

# 3. Perform production release installation
# PowerShell
./deploy.ps1 helm

# Bash
./deploy.sh helm
```

#### Essential Helm Management Registry
*   **Upgrade Release**:
    ```bash
    helm upgrade kubi deploy/helm/ -n kubi --values deploy/helm/values-prod.yaml --wait
    ```
*   **Rollback Release**:
    ```bash
    # View history log
    helm history kubi -n kubi
    # Rollback to immediate previous or specific version (e.g. version 2)
    helm rollback kubi 2 -n kubi
    ```
*   **Uninstall Stack**:
    ```bash
    helm uninstall kubi -n kubi
    ```

---

### 4️⃣ Production Cloud Infrastructure (Google Kubernetes Engine - GKE)

For provisioning secure cloud-native environments, integrating IAM Service Accounts, and syncing with Google Secret Manager.

```bash
# PowerShell GKE setup
./deploy.ps1 gke

# Bash GKE setup
./deploy.sh gke
```

#### GCP Infrastructure & Secret Vault Mapping Guide

1.  **IAM Roles Assignment**:
    Bind roles to the Operator Service Account so GKE can fetch container layers and resolve Secret Manager values:
    ```bash
    gcloud projects add-iam-policy-binding <GCP_PROJECT_ID> --member="serviceAccount:<SA_NAME>@<GCP_PROJECT_ID>.iam.gserviceaccount.com" --role="roles/artifactregistry.writer"
    gcloud projects add-iam-policy-binding <GCP_PROJECT_ID> --member="serviceAccount:<SA_NAME>@<GCP_PROJECT_ID>.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
    ```
2.  **Add Secrets Vault to GCP**:
    ```bash
    gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
    echo -n "<API_KEY>" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
    ```
3.  **Map Secrets into GKE (External Secrets Operator)**:
    Establish a cluster secret store linking your GCP project, and define mapping contexts:
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
      data:
        - secretKey: GEMINI_API_KEY
          remoteRef:
            key: GEMINI_API_KEY
    ```

#### 🔐 Kubernetes Secrets & Environment Configurations

The `deploy/k8s/secrets/` directory is the single home for Kubernetes secret configurations.

##### 1. Secrets Layout Structure
*   **Local (`deploy/k8s/secrets/local/`)**: Creates a local `kubi-secrets` Kubernetes Secret from checked-in dummy values. Replace values locally before applying:
    ```bash
    kubectl apply -k deploy/k8s/secrets/local
    ```
*   **External (`deploy/k8s/secrets/external/gcp/`)**: Creates the same `kubi-secrets` Kubernetes Secret from GCP Secret Manager through the External Secrets Operator:
    ```bash
    kubectl apply -k deploy/k8s/secrets/external/gcp
    ```

Both local and production paths produce a Secret named `kubi-secrets` so workload manifests can reference one stable secret name. Never commit real API keys, tokens, or passwords to git.

##### 2. Complete Environment Variables Registry

| Variable | Source (K8s Secret) | Description |
| :--- | :--- | :--- |
| **DB_PASSWORD** | `db-password` (key `DB_PASSWORD`) | Database password for the MongoDB instance |
| **RESEND_API_KEY** | `resend-api-key` (key `RESEND_API_KEY`) | API key for Resend email service |
| **JWT_SECRET_KEY** | `jwt-secret` (key `JWT_SECRET_KEY`) | Secret used to sign JWT tokens |
| **GEMINI_API_KEY** | `gemini-api-key` (key `GEMINI_API_KEY`) | API key for the Gemini AI service |
| **GCP_PROJECT_ID** | (environment variable) | GCP project identifier for Secret Manager (empty in dev) |
| **GCP_REGION** | (environment variable) | GCP region/location for Secret Manager (empty in dev) |
| **GITLAB_TOKEN** | `gitlab-token` (key `GITLAB_TOKEN`) | Private token for GitLab API access |
| **ENVIRONMENT** | (static value) | Set to `production` for the prod overlay |
| **ARIZE_SPACE_ID** | `kubi-secrets` (key `ARIZE_SPACE_ID`) | Optional Arize AI space identifier |
| **ARIZE_API_KEY** | `kubi-secrets` (key `ARIZE_API_KEY`) | Optional Arize AI API key |
| **ARIZE_PROJECT_NAME** | (static value) | Arize project name (`kubi-prod-backend`) |
| **SSO_CLIENT_ID** | `kubi-secrets` (key `SSO_CLIENT_ID`) | SSO client identifier |
| **SSO_CLIENT_SECRET** | `kubi-secrets` (key `SSO_CLIENT_SECRET`) | SSO client secret |

> [!NOTE]
> All secret names are referenced in **UPPERCASE** as required by project policy. In development, the `GCP_PROJECT_ID` and `GCP_REGION` variables are left empty; they are populated by the production overlay via GCP Secret Manager.

---


## 🪵 Production Log Forwarding: Fluent Bit

Fluent Bit runs as a cluster-wide DaemonSet inside the `kube-system` namespace. It tails log streams from `/var/log/containers/*.log`, merges Kubernetes pod metadata (labels, namespace, annotations), and routes vectorized entries directly to Elasticsearch.

Apply the daemon config-maps and set coordinates inside your templates:
```bash
kubectl apply -f deploy/fluent-bit-configmap.yaml
kubectl apply -f deploy/fluent-bit-daemonset.yaml
```

---

## 📋 Standard Management Commands

| Operational Task | Commands Registry |
| :--- | :--- |
| **Check Docker Stack status** | `docker compose -f deploy/container/docker-compose.yml ps` |
| **Stream container logs** | `docker compose -f deploy/container/docker-compose.yml logs -f [be/fe]` |
| **Check K8s workload state** | `kubectl get pods -n kubi -o wide` |
| **Check service endpoints** | `kubectl get service -n kubi` |
| **Stream pod stdout logs** | `kubectl logs deployment/kubi-backend -n kubi -f --tail=100` |
| **Trigger manual rollout restart** | `kubectl rollout restart deployment/kubi-backend -n kubi` |

---

## 🔍 Troubleshooting & Resolution Registry

### ❌ Docker Daemon Connection Failures
*   **Symptoms**: `Cannot connect to the Docker daemon. Is the docker daemon running?`
*   **Fix**: Launch Docker Desktop, wait for the daemon initialization phase, and verify with `docker ps`.

### ❌ Elasticsearch Boot Failures (OOM)
*   **Symptoms**: The Elasticsearch pod repeatedly crashes or exits with code `137` (Out of Memory).
*   **Fix**: Local Elasticsearch instances require at least 512MB to 1GB of dedicated heap memory. Increase Docker Desktop system memory allocation (recommend >= 4GB overall allocated resources).

### ❌ TLS Hostname Exception inside local Minikube
*   **Symptoms**: Agent log displays `SSLCertVerificationError: host.docker.internal does not match CA certificates`.
*   **Fix**: Update targeted configuration properties in client definitions to bypass assert hostname validations:
    `configuration.assert_hostname = False`

### ❌ Rate Limit Throttling (429 Too Many Requests)
*   **Symptoms**: Quick REST API updates return a `429` status error code.
*   **Fix**: Ensure `rate_limit_key` is scoped specifically per endpoint path in `security.py` rather than globally per client IP:
    `rate_limit_key = f"{ip}:{request.url.path}"`
