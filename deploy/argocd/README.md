# 🌀 ArgoCD GitOps Continuous Delivery & Pipeline Integration

This guide provides a comprehensive walkthrough for installing, configuring, and operating **ArgoCD** as the GitOps agent for the Kubi monorepo. This establishes a fully automated, state-of-the-art continuous delivery pipeline linked with your GitLab CI/CD process.

---

## 🏗️ The GitOps Feedback Loop

The diagram below illustrates how code changes propagate automatically from a developer's commit all the way to a reconciled running state in your local Kubernetes cluster:

```mermaid
graph TD
    subgraph GitLab
        A[Developer pushes commit to 'main'] -->|Trigger Pipeline| B(GitLab CI Pipeline)
        B -->|1. Test & Build| C{Build & Push Images}
        C -->|Docker Registry| D[(Docker Hub Registry - shubhamthokare)]
        B -->|2. GitOps Promotion Job| E[Kustomize Image Tag Update]
        E -->|Writes back to git [skip ci]| F[deploy/k8s/kustomization.yaml]
    end

    subgraph Kubernetes Cluster
        G[ArgoCD Controller] -->|3. Poll & Detect Drift| F
        G -->|4. Sync State| H[Apply to kubi Namespace]
        H -->|5. Rollout Pods| I[kubi-backend]
        H -->|5. Rollout Pods| J[kubi-frontend]
        H -->|5. Rollout Pods| K[kubi-agent]
        I -->|Pull image| D
        J -->|Pull image| D
        K -->|Pull image| D
    end
    
    style GitLab fill:#f3f4f6,stroke:#3b82f6,stroke-width:2px
    style Kubernetes Cluster fill:#eff6ff,stroke:#10b981,stroke-width:2px
```

---

## 🚀 Step-by-Step ArgoCD Deployment

Follow these instructions to spin up ArgoCD and deploy the Kubi applications to your local cluster (e.g., Minikube).

### 1️⃣ Install ArgoCD in the Cluster

Create a dedicated `argocd` namespace and deploy the official ArgoCD manifests:

```bash
# Create the namespace
kubectl create namespace argocd

# Install ArgoCD services (non-HA mode, perfect for development & staging)
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Wait until all pods in the `argocd` namespace are fully running:
```bash
kubectl get pods -n argocd -w
```

---

### 2️⃣ Expose the ArgoCD API Server (Web UI)

To access the ArgoCD dashboard locally, establish a port forward:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```
Now, open your web browser and navigate to: **`https://localhost:8080`**
> [!NOTE]
> Since this is using a self-signed certificate, your browser will display a security warning. It is safe to click **Advanced** -> **Proceed to localhost (unsafe)**.

---

### 3️⃣ Retrieve the Initial Admin Password

The default username is `admin`. Retrieve the auto-generated password via `kubectl`:

```bash
# On Bash/Linux/macOS/Git Bash:
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 --decode; echo

# On Windows PowerShell:
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}")))
```

Use these credentials (`admin` / `<decimated-password>`) to log in to the ArgoCD Web Portal.

---

### 4️⃣ Register Private GitLab Repository (If Applicable)

If your monorepo repository is hosted privately in GitLab, you must configure ArgoCD to allow access:

1. In the ArgoCD UI, navigate to **Settings ⚙️** -> **Repositories**.
2. Click **Connect Repo**.
3. Fill out the credentials:
   - **Connection Method**: HTTPS
   - **Repository URL**: `https://gitlab.com/kubi-agent/kubi.git`
   - **Username**: `oauth2` or your GitLab username
   - **Password**: Your **GitLab Personal Access Token (PAT)** (ensure the PAT has `read_repository` permission).
4. Click **Connect** and verify that the status changes to **Successful**.

---

### 5️⃣ Deploy the Declarative Application Manifest

Apply the pre-configured, declarative `Application` resource. This instructs ArgoCD to watch the repository, automatically target the `deploy/k8s/` folder, create the `kubi` namespace if it doesn't exist, and maintain cluster synchronization:

```bash
# Apply the application manifest from the root directory
kubectl apply -f deploy/argocd/application.yaml
```

Immediately, you will see a new application named `kubi-gitops` appear in your ArgoCD dashboard. Click on it to see the visual topology of your deployed resources (services, deployments, configmaps, secrets, roles, rolebindings).

---

## 🛠️ ArgoCD Management and Verification

### Manual Syncing
By default, the `syncPolicy` has `prune: true` and `selfHeal: true` enabled. However, if you wish to trigger a manual sync via CLI or UI:
```bash
# Sync using the argocd CLI (if installed)
argocd app sync kubi-gitops
```

### Self-Healing & Drift Detection
If you manually delete a Kubi service or Deployment configuration locally via `kubectl delete`, ArgoCD will detect the drift within seconds, mark the cluster state as `OutOfSync`, and immediately re-apply the Git-defined configuration to restore service integrity.

### GitOps Promotion Loop Integration
Whenever GitLab CI completes a successful build, it edits `deploy/k8s/kustomization.yaml` inside your repository and pushes the commit using a `[skip ci]` token. ArgoCD automatically polls Git (every 3 minutes, or instantly via Webhooks) and rolls out a rolling update for the modified microservice pod.

---

## 🔒 Required GitLab CI/CD Variables

To enable the pipeline to build, publish, and promote these images, you must define the following variables in your **GitLab Project Settings** under **Settings ⚙️** -> **CI/CD** -> **Variables**:

1. **`DOCKER_HUB_USERNAME`**: Your Docker Hub username (`shubhamthokare`).
2. **`DOCKER_HUB_PASSWORD`**: Your Docker Hub password or Personal Access Token (PAT).
3. **`GL_ACCESS_TOKEN`**: A GitLab Project Access Token or Personal Access Token with `write_repository` and `api` scopes. This is required by the GitOps Promotion step to write image tag updates back to the `main` branch. Enable the **Masked** and **Protected** attributes on this variable for maximum security.

