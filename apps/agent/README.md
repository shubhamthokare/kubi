# 🤖 Kubi Agent Service

Kubernetes background agent for Kubi AI, continuously monitoring cluster health, collecting telemetry, and communicating pod failure events to the backend for AI-driven remediation.

---

## 📋 Overview

The Kubi Agent is a lightweight Python service that runs in your Kubernetes cluster (or locally for development) and:
- Monitors pod health every 30 seconds (configurable)
- Detects crash loops, OOMKills, ImagePullBackOff, and other failure patterns
- Collects pod logs, events, and metrics
- Sends incident data to the Kubi Backend for AI analysis
- Supports multi-namespace scanning
- Integrates with Kubernetes RBAC for secure operation

---

## 🔧 Tech Stack

- **Framework**: FastAPI 0.100+
- **Kubernetes Client**: kubernetes-python 27.0+
- **Language**: Python 3.9+
- **HTTP**: Requests / HTTPX
- **Monitoring**: Prometheus metrics (optional)

---

## 📦 Installation

### Prerequisites
- Python 3.9+
- kubectl configured and accessible
- Kubernetes cluster (or Minikube locally)
- Access to Kubi Backend API

### Setup Steps

```bash
# 1. Navigate to agent directory
cd apps/agent

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create .env file
cp .env.example .env

# 6. Configure environment variables
# Edit .env and set KUBI_BACKEND_URL and GEMINI_API_KEY
```

---

## 🚀 Running the Agent

### Local Development (against Kubernetes cluster)

```bash
# 1. Ensure kubeconfig is configured
kubectl config current-context

# 2. Set environment variables
export KUBI_BACKEND_URL=http://localhost:8000
export GEMINI_API_KEY=dummy

# 3. Run agent
python main.py
```

### With Custom Logging
```bash
python main.py --log-level DEBUG
```

### Specify Kubernetes Context
```bash
KUBECONFIG=~/.kube/config python main.py --context minikube
```

### Running as Background Service
```bash
nohup python main.py > agent.log 2>&1 &
```

---

## 📁 Project Structure

```
apps/agent/
├── main.py                  # FastAPI application entry point
├── scanner.py              # Kubernetes health monitoring logic
├── incident_detector.py    # Failure pattern detection
├── telemetry_collector.py  # Log and event collection
├── backend_client.py       # Backend API communication
├── arize_tracing.py        # Observability setup
├── requirements.txt        # Python dependencies
├── .env.example           # Environment variables template
├── tests/                 # Unit and integration tests
└── LICENSE                # MIT License
```

---

## 🔌 Environment Variables

Create a `.env` file with the following variables:

```env
# Cluster Identity
CLUSTER_ID=kubi-production-cluster

# Kubernetes Configuration
TARGET_NAMESPACE=*                          # '*' = all namespaces
SCAN_INTERVAL=30                           # Seconds between scans
KUBECONFIG=~/.kube/config                  # Path to kubeconfig

# Backend Service
KUBI_BACKEND_URL=http://localhost:8000     # Local dev
# KUBI_BACKEND_URL=http://kubi-backend-service:8000  # In-cluster

# AI & API Keys
GEMINI_API_KEY=your-actual-key-here

# Logging
LOG_LEVEL=INFO                              # INFO, DEBUG, WARNING, ERROR

# Observability (Arize)
ARIZE_SPACE_ID=your-space-id
ARIZE_API_KEY=dummy
ARIZE_PROJECT_NAME=kubi-agent
```

⚠️ **Security**: Never commit `.env` to git. Use `.env.example` for documentation.

---

## 📊 Kubernetes Integration

### Service Account (In-Cluster)

When deployed in Kubernetes, the agent runs with a service account that has permissions to:
- List and watch pods across namespaces
- Get pod logs
- Get pod metrics
- Get events
- Get node information

### Local Development Setup

For development against a Minikube or local cluster:

```bash
# 1. Start Minikube
minikube start --driver=docker

# 2. Port-forward backend (from another terminal)
kubectl port-forward svc/kubi-backend-service 8000:8000 -n kubi

# 3. Run agent
export KUBI_BACKEND_URL=http://localhost:8000
python main.py
```

### Remote Cluster Access

The recommended remote-cluster model is to run one Kubi agent inside each target cluster:

```bash
# 1. Verify the target context
kubectl --context <remote-context> cluster-info

# 2. Create the namespace and deploy the agent resources
kubectl --context <remote-context> apply -f deploy/k8s/base/namespace.yaml
kubectl --context <remote-context> apply -k deploy/k8s/agent
```

Register the agent in Kubi using a URL that the Kubi backend can reach:

```text
# Backend and agent in the same cluster
auth_type=agent
agent_url=http://kubi-agent-service.kubi.svc.cluster.local:8080

# Agent exposed through a secure remote ingress
auth_type=agent
agent_url=https://agent.<remote-domain>
```

Verify the connection from the Kubi backend network:

```text
GET <agent_url>/healthz
GET <agent_url>/stats
```

An external agent ingress must use TLS and should be protected using authentication, private networking, and firewall restrictions. Do not configure the agent URL as a direct Kubernetes API endpoint. Requests such as `/api/v1/namespaces` belong to the Kubernetes API server and return `404` when sent to the Kubi agent.

For local Minikube ingress testing, use `http://agent.kubi.kontactless.in`. The local ingress does not provide TLS, so `https://agent.kubi.kontactless.in` attempts port `443` and fails. This local URL is not suitable for connecting a remote Kubi backend.

If running the agent process outside the target cluster instead, configure a kubeconfig that can reach the remote Kubernetes API:

```bash
export KUBECONFIG=~/.kube/production-config.yaml
kubectl cluster-info
python main.py
```

---

## 🔍 Monitoring Features

### Pod Health Check Patterns

The agent detects and reports:

| Pattern | Detection | Severity |
|---------|-----------|----------|
| **Crash Loop** | Pod restarted >3 times in 10min | Critical |
| **OOMKill** | Memory limit exceeded | High |
| **ImagePullBackOff** | Image download failed | High |
| **CrashLoopBackOff** | Application exits repeatedly | Critical |
| **Pending** | Pod stuck in pending state | Medium |
| **Unknown** | Node connectivity lost | Critical |

### Event Collection

The agent collects:
- Pod lifecycle events (Created, Started, Terminated)
- Error events (Failed, BackOff)
- Warning events (Unhealthy probe, FailedScheduling)

### Log Collection

The agent retrieves:
- Current container logs (last 100 lines)
- Previous container logs (if available)
- Error patterns and stack traces

---

## 📡 Backend Communication

### Incident Reporting

The agent sends incident data to the backend:

```python
POST /api/incidents

{
  "cluster_id": "kubi-production",
  "namespace": "default",
  "pod_name": "app-xyz-abc",
  "pod_uid": "12345",
  "incident_type": "crash_loop",
  "severity": "critical",
  "logs": "...",
  "events": [...],
  "metrics": {...},
  "detected_at": "2026-05-20T10:30:00Z"
}
```

### Health Heartbeat

The agent sends periodic heartbeats:

```python
POST /api/health/agent

{
  "cluster_id": "kubi-production",
  "status": "healthy",
  "pods_scanned": 156,
  "incidents_detected": 3,
  "last_scan": "2026-05-20T10:35:00Z"
}
```

---

## 🧪 Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest --cov=. tests/

# Run specific test file
pytest tests/test_scanner.py -v

# Test against live Minikube
pytest tests/integration/ -v
```

---

## 🧹 Code Quality

```bash
# Format code (Black)
black .

# Lint code (Pylint)
pylint .

# Type checking (MyPy)
mypy .

# Security scanning (Bandit)
bandit -r .

# All checks
black . && pylint . && mypy . && bandit -r .
```

---

## 🐳 Docker

### Build Image
```bash
docker build -t kubi-agent:latest .
```

### Run Container (Local Development)
```bash
docker run -d \
  -e KUBI_BACKEND_URL=http://host.docker.internal:8000 \
  -e GEMINI_API_KEY=dummy \
  -v ~/.kube:/root/.kube \
  --name kubi-agent \
  kubi-agent:latest
```

### Run in Kubernetes
```bash
# Build image in Minikube
eval $(minikube docker-env)
docker build -t kubi-agent:latest .

# Deploy to cluster (via Kustomize)
kubectl apply -k deploy/k8s/
```

---

## 📊 Observability & Monitoring

### Logging

All agent actions are logged:
```
2026-05-20 10:30:00 - INFO - Scanning namespace: default
2026-05-20 10:30:05 - WARN - Pod crash-loop detected: app-xyz
2026-05-20 10:30:06 - ERROR - Failed to collect logs: pod not ready
```

### Prometheus Metrics (Optional)

The agent exposes metrics at `http://localhost:8000/metrics`:
```
kubi_agent_pods_scanned_total{cluster_id="prod"} 156
kubi_agent_incidents_detected_total{cluster_id="prod",type="crash_loop"} 3
kubi_agent_scan_duration_seconds{cluster_id="prod"} 5.2
kubi_agent_backend_connection_errors_total 0
```

### Arize Integration

All operations are traced for observability:
- Pod scan events
- Incident detection
- Backend API calls
- Error occurrences

---

## 🐛 Troubleshooting

### Connection to Backend Failed
```bash
# Verify backend is running
curl http://localhost:8000/health

# Check firewall/networking
ping localhost:8000

# Verify KUBI_BACKEND_URL in .env
cat .env | grep KUBI_BACKEND_URL
```

### Kubernetes Connection Error
```bash
# Verify kubeconfig
cat ~/.kube/config

# Test kubectl access
kubectl get pods -A

# Try different config location
KUBECONFIG=~/.kube/production-config.yaml python main.py
```

### Permission Denied on Pod Logs
```bash
# Verify service account permissions
kubectl describe serviceaccount kubi-agent -n kubi

# Check RBAC bindings
kubectl get rolebindings -n kubi
kubectl get clusterrolebindings | grep kubi
```

### Agent Not Detecting Pods
```bash
# Verify TARGET_NAMESPACE setting
cat .env | grep TARGET_NAMESPACE

# Manually list pods with kubectl
kubectl get pods -n <namespace>

# Run with DEBUG logging
python main.py --log-level DEBUG
```

---

## 🔐 Security Considerations

### RBAC Best Practices
- Agent runs with minimal required permissions
- Limited to read-only operations on pods and logs
- Cannot modify cluster resources

### Secret Management
- Never commit `.env` file
- Use Kubernetes secrets for in-cluster deployment
- Rotate API keys regularly

### Network Security
- Backend communication uses HTTPS (in production)
- API authentication via bearer token (configurable)
- Encrypted telemetry transmission

---

## 📖 For More Information

- **Local Setup Guide**: See [LOCAL_SETUP.md](../../docs/LOCAL_SETUP.md)
- **Deployment Guide**: See [DEPLOYMENT.md](../../docs/DEPLOYMENT.md)
- **Commands Reference**: See [COMMANDS.md](../../docs/COMMANDS.md)
- **Main README**: See [README.md](../../README.md)

---

## 📄 License

This project is licensed under the **MIT License** - see [LICENSE](./LICENSE) for details.

---

*Last Updated: May 20, 2026*
*Kubi Agent Documentation*
