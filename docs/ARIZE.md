# 🛰️ Arize AX & Phoenix Tracing Observability Guide

Arize tracing provides production-grade observability and telemetry instrumentation for **Kubi AI**. It tracks incoming HTTP requests, external client calls (Kubernetes API, GitLab APIs), and Google Gemini LLM reasoning paths. This enables deep diagnostics of autonomous SRE operations, tracing prompts, responses, latency, and token consumption.

---

## 🏗️ Observability Architecture

The tracing architecture seamlessly instruments our core microservices using **OpenTelemetry** and the **OpenInference** libraries.

| Component | Telemetry Traced | Exporter Modes | Status |
| :--- | :--- | :--- | :--- |
| **Backend Service** (`apps/backend`) | HTTP requests, Google Gemini LLM API calls, HTTP client calls (requests/httpx), database metadata | **Arize Cloud** or **Local Phoenix / OTel** | ✅ Enabled |
| **Agent Daemon** (`apps/agent`) | Background namespace status checks, outgoing API requests, K8s SDK calls | **Arize Cloud** or **Local Phoenix / OTel** | ✅ Enabled |
| **Dashboard UI** (`apps/frontend`) | Skipped for initial rollout, pending future integration | N/A | ⏸️ Pending |

### Critical Initialization Order
Because OpenTelemetry instruments libraries by dynamically wrapping imports, **tracing MUST be imported and initialized before any other imports occur** in the applications' entrypoints (`main.py` files).
- In [`apps/backend/main.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/main.py):
  ```python
  from app.core.arize_tracing import initialize_arize_tracing
  initialize_arize_tracing()
  # Other imports follow...
  ```
- In [`apps/agent/main.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/agent/main.py):
  ```python
  from arize_tracing import initialize_arize_tracing
  initialize_arize_tracing()
  # Other imports follow...
  ```

---

## ⚡ Setup & Quick Start

Our unified tracing configuration dynamically operates in **two modes**:

### Mode A: Local Observability (Arize Phoenix / Local OTel)
If you want to view LLM spans and execution traces locally on your developer machine, you can run an open-source local Arize Phoenix collector and direct Kubi AI to export to it.

1. **Start the local Phoenix server**:
   ```bash
   pip install arize-phoenix
   python -m phoenix.server.main serve
   ```
   This will start the UI dashboard at `http://localhost:6006`.

2. **Configure local environment variables**:
   Add this to your local `.env` configuration:
   ```env
   PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006/v1/traces
   ```
   *(Alternatively, you can route to standard OTLP collectors using `OTEL_EXPORTER_OTLP_ENDPOINT`).*

---

### Mode B: Enterprise Production Observability (Arize Cloud)
For production-grade monitoring, configure direct exports securely to your cloud Arize account.

1. **Retrieve Arize Space Credentials**:
   * Create or log in to your account at [Arize AI Cloud](https://cloud.arize.com).
   * Go to **Space Settings** → **API Details**.
   * Copy your `ARIZE_SPACE_ID` and generate an `ARIZE_API_KEY`.

2. **Configure credentials**:
   Add your credentials to the respective `.env` files:
   
   **Backend Settings (`apps/backend/.env`)**
   ```env
   ENVIRONMENT=production
   ARIZE_SPACE_ID=your_arize_space_id
   ARIZE_API_KEY=your_arize_api_key
   ARIZE_PROJECT_NAME=kubi-backend
   ```

   **Agent Settings (`apps/agent/.env`)**
   ```env
   ENVIRONMENT=production
   ARIZE_SPACE_ID=your_arize_space_id
   ARIZE_API_KEY=your_arize_api_key
   ARIZE_PROJECT_NAME=kubi-agent
   ```

---

## 🔒 Security & Sensitive Data Redaction

Security and compliance are maintained through strict data filtering policies implemented in `arize_tracing.py`. We sanitize trace records locally *before* they are transmitted to any external collector or cloud endpoint.

### 1. HTTP Header Redaction
All trace spans automatically replace sensitive HTTP headers with a `[REDACTED]` placeholder:
- `Authorization`
- `X-API-Key` / `api-key` / `gemini-api-key`
- `Cookie`
- `X-CSRF-Token`
- `X-Auth-Token`
- `gitlab-private-token`

### 2. Dictionary/Payload Data Redaction
Any API body payloads, configurations, or parameters containing key-value pairs matching sensitive terms are automatically scrubbed:
- `password`
- `api_key`
- `token`
- `secret`
- `authorization`

---

## 🐳 Containerized & Cluster Deployments

Our deployments are pre-configured to handle optional telemetry credentials out-of-the-box.

### 1. Kubernetes Manifests (Minikube / Production)
Telemetry environment variables are mapped to the pods dynamically in [`deploy/k8s/be/deployment.yaml`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/k8s/be/deployment.yaml) and [`deploy/k8s/agent/agent-deployment.yaml`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/k8s/agent/agent-deployment.yaml):

```yaml
env:
- name: ENVIRONMENT
  value: "production"
- name: ARIZE_SPACE_ID
  valueFrom:
    secretKeyRef:
      name: kubi-secrets
      key: ARIZE_SPACE_ID
      optional: true  # Pod starts up safely even if keys are absent
- name: ARIZE_API_KEY
  valueFrom:
    secretKeyRef:
      name: kubi-secrets
      key: ARIZE_API_KEY
      optional: true
- name: ARIZE_PROJECT_NAME
  value: "kubi-prod-backend"
```

To supply credentials, simply define them in your local config [deploy/k8s/base/.env](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/k8s/base/.env) before running deployment script. Kustomize will securely generate the cluster secrets.

### 2. Docker Compose
Both `be` and `agent` services are configured in [`deploy/container/docker-compose.yml`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/container/docker-compose.yml) to pass:
* `ENVIRONMENT`
* `ARIZE_SPACE_ID`
* `ARIZE_API_KEY`
* `ARIZE_PROJECT_NAME`
* `PHOENIX_COLLECTOR_ENDPOINT`

Export these in your environment, and Docker will route spans seamlessly.

---

## 🆘 Troubleshooting

### Graceful Warning Logs
If neither Cloud credentials nor Local endpoints are provided, Kubi AI prints a clean warning during container boot and runs normally with tracing disabled:
```log
Arize tracing not initialized: ENVIRONMENT is production but neither Arize Cloud credentials (ARIZE_SPACE_ID, ARIZE_API_KEY) nor local collector endpoints (PHOENIX_COLLECTOR_ENDPOINT) are set.
```

### Traces Not Showing in Dashboard
1. **Verify Environment Variables**: Check that the variables are correctly set inside the container:
   ```bash
   kubectl exec -it <pod-name> -n kubi -- env | grep -E "ARIZE|PHOENIX"
   ```
2. **Check Port Bindings (Local Mode)**: If exporting locally to Phoenix, verify your local Phoenix container or process is listening and reachable at the specified endpoint port.
3. **Outbound Firewall Restrictions**: Verify your cluster namespace allows outbound HTTPS communication:
   ```bash
   kubectl exec -it <pod-name> -n kubi -- curl https://api.arize.com/health
   ```
