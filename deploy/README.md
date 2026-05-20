# 🛠️ Kubi AI: Docker Compose Manual Deployment & Host-Cluster Integration

This guide walks you through manually deploying the Kubi AI platform using **Docker Compose** and successfully integrating it with a host-running **Minikube** Kubernetes cluster on a Windows workstation.

---

## 📐 Networking & Architecture Overview

When running the Kubi platform inside Docker Compose while your Minikube cluster runs directly on the host (e.g., inside a Hyper-V/Docker VM or local network loopback), the services communicate across boundaries using Docker's internal DNS and the host gateway:

```mermaid
graph TD
    subgraph Host Workstation
        Minikube[Minikube Cluster API<br>Port: 61847]
    end

    subgraph Docker Compose Network (kubi-network)
        fe[Next.js Frontend<br>Port: 3000] -- "x-cluster-id Header" --> be[FastAPI Backend<br>Port: 8000]
        be -- "Internal HTTP Proxy" --> agent[Kubi Agent Daemon<br>Port: 8080]
        agent -- "https://host.docker.internal:61847" --> Minikube
    end
```

### 🛰️ Port Registry
*   **MongoDB**: `27018` (Host) -> `27017` (Container) to avoid local host port collisions.
*   **FastAPI Backend (`be`)**: `8000` (Host & Container).
*   **Kubi Agent (`agent`)**: `8080` (Host & Container).
*   **Next.js Frontend (`fe`)**: `3000` (Host) -> `80` (Container).

---

## 🔑 Host-to-Container Authentication (Kubeconfig & Contexts)

Minikube issues local certificates to authenticate client connections. For a containerized client (the Kubi Agent) to verify and speak with the host-running cluster, we must adapt the `kubeconfig` paths and mount the actual certificate files.

### 1. Adapt Kubeconfig Contexts
Your standard local `kubeconfig` uses host-local absolute paths and loopback addresses. Copy your configuration to `deploy/kubeconfig` and modify these key attributes:

> [!IMPORTANT]
> **Key Kubeconfig Modifications Required:**
> *   **Server IP**: Replace `https://127.0.0.1:<port>` with `https://host.docker.internal:<port>`. This allows the agent container to resolve the host loopback interface.
> *   **Certificate Authorities**: Map certificate paths to container-mounted folders (e.g., `/root/.minikube/...`).

#### 📝 Example Adapted `kubeconfig` (`deploy/kubeconfig`):
```yaml
apiVersion: v1
clusters:
- cluster:
    certificate-authority: /root/.minikube/ca.crt
    server: https://host.docker.internal:61847
  name: minikube
contexts:
- context:
    cluster: minikube
    namespace: default
    user: minikube
  name: minikube
current-context: minikube
kind: Config
users:
- name: minikube
  user:
    client-certificate: /root/.minikube/profiles/minikube/client.crt
    client-key: /root/.minikube/profiles/minikube/client.key
```

---

## 📦 Docker Compose Integration Schema

To inject the adapted `kubeconfig` context and client certificates, the `docker-compose.yml` mounts the host certificate profiles read-only and maps `host.docker.internal` to the host gateway:

```yaml
  agent:
    build:
      context: ./agent
      dockerfile: Dockerfile
    container_name: kubi-agent
    ports:
      - "8080:8080"
    environment:
      - KUBI_BACKEND_URL=http://be:8000
      - CLUSTER_ID=local-minikube
      - TARGET_NAMESPACE=default
      - SCAN_INTERVAL=30
    volumes:
      # Mount host Minikube certificate profile directory (read-only)
      - C:\Users\shubh\.minikube:/root/.minikube:ro
      # Mount adapted container-specific kubeconfig
      - ./deploy/kubeconfig:/root/.kube/config:ro
    extra_hosts:
      # Expose host gateway IP to verify loopback TLS
      - "host.docker.internal:host-gateway"
    depends_on:
      - be
    networks:
      - kubi-network
```

---

## 🛡️ TLS Hostname Assertion Bypass

Since the local Minikube CA certificate is issued specifically for localhost (`127.0.0.1`, `kubernetes.default`, etc.), making requests via `host.docker.internal` will normally trigger a TLS Hostname Mismatch exception.

To resolve this while keeping standard certificate validation intact, the agent client disables hostname matching assertions:

```python
# agent/main.py
from kubernetes import client, config

# Load local containerized kubeconfig
config.load_kube_config()

# Disable SSL hostname verification to support host-gateway IP aliases
configuration = client.Configuration.get_default_copy()
configuration.assert_hostname = False
client.Configuration.set_default(configuration)
```

---

## 🚀 Step-by-Step Manual Deployment Playbook

Follow these steps to build, deploy, and verify the platform manually:

### 1. Extract Minikube Port
Find the API port your Minikube cluster is currently running on:
```powershell
kubectl cluster-info
# Expected output: Kubernetes control plane is running at https://127.0.0.1:61847
```

### 2. Update `deploy/kubeconfig`
Open `deploy/kubeconfig` and verify the `server` port matches the command above:
```yaml
server: https://host.docker.internal:61847
```

### 3. Spin Up Docker Compose
Run the orchestrator command to build and launch all microservices in the background:
```bash
docker-compose up -d --build
```

### 4. Verify Container Health
Check the container status to ensure the agent is successfully connecting and streaming logs:
```bash
docker ps
docker-compose logs -f agent
```
*   *Success Indicator:* Logs will output: `Scanning namespace 'default' for incidents...` and fetch cluster status successfully.

### 5. Access and Monitor
Open your browser to [http://localhost:3000](http://localhost:3000) to view incident streams, node telemetry charts, and register additional clusters dynamically using the **Configure** section.
