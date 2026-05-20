# 🔍 Elasticsearch Setup, Integration, & Architecture Guide

Elasticsearch provides enterprise-grade full-text and semantic search capabilities for **Kubi AI** incident data. It indexes cluster anomalies, container logs, Kubernetes events, and historical root cause analysis (RCA) records to equip the Google Gemini engine with retrieval-augmented generation (RAG) capabilities.

---

## 🏗️ Architecture & Data Flow

When a pod fails or transitions into an unhealthy state, Kubi AI collects logs and events to analyze the issue. Elasticsearch acts as our historical memory, enabling the system to retrieve similar past failures and their associated remediation outcomes.

```
Kubernetes Cluster Anomaly
        ↓
Pod Failures, Crashes & Events Detected
        ↓
Kubi Background Scanner (apps/agent)
        ↓
Kubi Backend Service (apps/backend)
        ↓ (Stores Incidents & Telemetry)
Elasticsearch 8.13.4 (5 Core Indices)
        ↓ (Semantic & Full-Text Search)
Context Enrichment (Incident History + Success Rates)
        ↓
Gemini 1.5 Pro RCA Engine (Retrieval-Augmented)
        ↓
Human-in-the-Loop Remediation / Rollback Plan
```

### Retrieval-Augmented Generation (RAG) Flow
1. **Anomaly Collection**: Incident detection captures container logs, pod state, and recent cluster events.
2. **Telemetry Indexing**: The backend indexes logs, events, and incident metadata into distinct Elasticsearch indices.
3. **Contextual Search**: Before passing the incident details to Google Gemini, the search service runs a query over historical logs and root causes to find up to 5 matching incidents.
4. **Context Injection**: The description, actual logs, and successful resolution scripts of similar historical incidents are formatted into a markdown block.
5. **RCA Analysis**: Gemini is prompted with both the active logs and the historical context, resulting in highly accurate, context-aware remediation proposals.

---

## 📦 What Was Installed

The Elasticsearch architecture is fully integrated into the Kubi AI monorepo:

### 1. Core Services (apps/backend/app/services/)
- [`elasticsearch_service.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/app/services/elasticsearch_service.py): Client connection manager, health check handler, and cluster ping interface.
- [`incident_indexing.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/app/services/incident_indexing.py): Handles schema creation, document indexing, and atomic updates.
- [`incident_search.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/app/services/incident_search.py): Implements KQL (Kibana Query Language) equivalents, match-based full-text search, and prompt context building.

### 2. Configuration & Orchestration
- [`deploy/container/docker-compose.yml`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/container/docker-compose.yml): Deploys a single-node Elasticsearch 8.13.4 instance and Kibana 8.13.4 locally with health checks and persistent volume binding.
- [`apps/backend/app/core/config.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/app/core/config.py): Exposes host, index naming patterns, auth credentials, shard count, and replica rules.
- [`apps/backend/main.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/main.py): Automatically initializes and builds indices during application startup and closes connections on shutdown.

---

## 🚀 Quick Start

### 1. Spin up the Containers
Run the Docker Compose stack to start Elasticsearch and Kibana:
```bash
# From the root directory, use the automated PowerShell runner:
./deploy-docker.ps1

# Or manually start the search services:
docker compose -f deploy/container/docker-compose.yml up -d elasticsearch kibana
```

Wait for the containers to pass their health checks:
```bash
docker compose -f deploy/container/docker-compose.yml ps
# Both elasticsearch and kibana should display "healthy"
```

### 2. Verify Connection
You can ping the cluster using curl:
```bash
curl http://localhost:9200
```
Expected JSON output:
```json
{
  "name": "elasticsearch-node",
  "cluster_name": "kubi-cluster",
  "cluster_uuid": "...",
  "version": {
    "number": "8.13.4",
    "build_flavor": "default",
    ...
  },
  "tagline": "You Know, for Search"
}
```

### 3. Configure the Backend Environment
Add the following variables to your backend settings file (`apps/backend/.env`):
```env
# Elasticsearch connection (required)
ELASTICSEARCH_HOST=http://localhost:9200

# Index names (defaults)
ELASTICSEARCH_INDEX=kubiguard-incidents
ELASTICSEARCH_INDEX_LOGS=kubiguard-pod-logs
ELASTICSEARCH_INDEX_EVENTS=kubiguard-events
ELASTICSEARCH_INDEX_RCA=kubiguard-rca
ELASTICSEARCH_INDEX_REMEDIATION=kubiguard-remediation
```

### 4. Run the Backend Service
Start the FastAPI server:
```bash
cd apps/backend
pip install -r requirements.txt
python -m uvicorn main:app --port 8000
```
Upon startup, the backend automatically initializes the five Elasticsearch indices. Look for these positive indicators in the terminal logs:
```
✓ Connected to Elasticsearch at http://localhost:9200
✓ Index ready: Incidents (kubiguard-incidents)
✓ Index ready: Pod Logs (kubiguard-pod-logs)
✓ Index ready: Events (kubiguard-events)
✓ Index ready: RCA (kubiguard-rca)
✓ Index ready: Remediation (kubiguard-remediation)
```

---

## 🎯 Index Structure & Mappings

We use five dedicated indices to isolate log telemetry, cluster events, analysis layers, and remediation histories.

| Index Name | Purpose | Key Fields |
| :--- | :--- | :--- |
| `kubiguard-incidents` | Tracks active and closed incidents. | `incident_id` (keyword), `namespace` (keyword), `severity` (keyword), `status` (keyword), `title` (text), `root_cause` (text), `logs` (text), `events` (text) |
| `kubiguard-pod-logs` | Stores deep raw container log blocks. | `pod_name` (keyword), `namespace` (keyword), `container` (keyword), `log_content` (text), `timestamp` (date) |
| `kubiguard-events` | Indexes Kubernetes warning & normal events. | `event_id` (keyword), `reason` (keyword), `event_type` (keyword), `message` (text), `count` (integer) |
| `kubiguard-rca` | Stores Gemini's AI analysis blocks. | `incident_id` (keyword), `analysis` (text), `root_causes` (text), `confidence_score` (float) |
| `kubiguard-remediation` | Logs action logs (rollbacks, patches, etc.) | `incident_id` (keyword), `action_type` (keyword), `status` (keyword), `result` (text) |

---

## 💻 Python API Reference

Here is a quick reference for interacting with our Elasticsearch service layer inside `apps/backend/`.

### 1. Storing Incident Telemetry (`apps/backend/app/services/incident_indexing.py`)
```python
from app.services.incident_indexing import store_incident, store_rca, store_pod_logs

# Save an active incident
store_incident({
    "incident_id": "inc-2026-05-18",
    "namespace": "production",
    "pod_name": "payment-api-67d4",
    "cluster_id": "gke-prod-us",
    "severity": "critical",
    "status": "active",
    "title": "Payment API Pod CrashLoopBackOff",
    "root_cause": "OOMKilled: Out of Memory due to memory leak",
    "logs": "FATAL: OutOfMemoryError in garbage collection",
    "events": "Back-off restarting failed container payment-api in pod payment-api-67d4"
})

# Save the AI generated RCA report
store_rca(
    incident_id="inc-2026-05-18",
    analysis="Gemini deep analysis: The pod exceeded its memory limit of 512Mi due to unbounded cache storage.",
    root_causes="Unbounded Redis cache growth on startup",
    affected_resources=["Deployment/payment-api"],
    confidence_score=0.98
)
```

### 2. Searching & Context Enrichment (`apps/backend/app/services/incident_search.py`)
```python
from app.services.incident_search import search_similar_incidents, build_gemini_context

# Retrieve similar past incidents based on raw log errors
similar_incidents = search_similar_incidents(
    error_logs="FATAL: OutOfMemoryError",
    pod_name="payment-api",
    namespace="production",
    limit=3
)

# Format the results into a markdown context block for Gemini RAG
rca_context = build_gemini_context(similar_incidents)
```

### 3. Fetching Logs and Action Summaries
```python
from app.services.incident_search import search_pod_logs, get_incident_context

# Retrieve indexed container logs
logs = search_pod_logs(pod_name="payment-api-67d4", namespace="production", limit=100)

# Pull the complete incident timeline (Incident metadata + RCA + Actions taken)
timeline = get_incident_context(incident_id="inc-2026-05-18")
```

---

## 📊 Kibana Usage & Dashboards

Kibana runs locally at [http://localhost:5601](http://localhost:5601) and acts as the administrative portal.

### Discover Logs & Metrics
1. Navigate to **Analytics** → **Discover**.
2. Click **Create data view** and match patterns like `kubiguard-*`.
3. Filter metrics with Kibana Query Language (KQL):
   - Find active critical failures: `severity : "critical" AND status : "active"`
   - Find CrashLoop incidents: `events : "CrashLoopBackOff"`

### Setting Up Alerts
1. Go to **Stack Management** → **Rules**.
2. Create a new index threshold rule.
3. Target `kubiguard-incidents` and trigger when the document count for `severity: critical` exceeds `0` within a 1-minute window.
4. Integrate with external webhook handlers (Slack, Discord, PagerDuty).

---

## 🆘 Troubleshooting

### Elasticsearch Fails to Start (OutOfMemoryError)
- **Problem**: The container immediately crashes upon startup.
- **Cause**: Elasticsearch's Java Virtual Machine (JVM) needs sufficient memory allocations, which may be restricted by the Docker engine.
- **Fix**: Check `ES_JAVA_OPTS` in [`deploy/container/docker-compose.yml`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/container/docker-compose.yml). Ensure you have at least 1GB - 2GB allocated:
  ```yaml
  environment:
    - ES_JAVA_OPTS=-Xms1g -Xmx1g
  ```

### Verification Ping Fails
If `curl http://localhost:9200` fails:
1. Ensure the container is indeed running: `docker ps | grep elasticsearch`.
2. Check for port conflicts. If another service uses port `9200`, map it differently in docker-compose:
   ```yaml
   ports:
     - "9201:9200"
   ```
3. Read the logs: `docker compose -f deploy/container/docker-compose.yml logs elasticsearch`.

### Connection Failures from the FastAPI Container
- **Problem**: The backend service returns connection errors when trying to initialize indices.
- **Fix**: Ensure that the backend uses the Docker network gateway name rather than `localhost` inside container environments:
  ```env
  ELASTICSEARCH_HOST=http://elasticsearch:9200
  ```

---

## 🔒 Production Considerations

### 1. Security (X-Pack & TLS)
By default, the development configuration disables X-Pack security. In a production cluster, you must enable authentication and TLS encryption:
```env
# apps/backend/.env
ELASTICSEARCH_HOST=https://elasticsearch-secure.example.com:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=highly-secure-password-here
```

### 2. Index Lifecycle Management (ILM)
To prevent infinite disk consumption, create a retention policy to transition indexes from hot to cold, and delete logs older than 90 days:
```json
{
  "policy": "kubi-retention-policy",
  "phases": {
    "hot": {
      "actions": {
        "rollover": {
          "max_age": "7d",
          "max_size": "50gb"
        }
      }
    },
    "delete": {
      "min_age": "90d",
      "actions": {
        "delete": {}
      }
    }
  }
}
```

### 3. Scaling & Sharding
- **Development**: 1 shard, 0 replicas.
- **Production**: Minimum 3-node HA cluster, 3 shards, 2 replicas.
  ```env
  ELASTICSEARCH_SHARDS=3
  ELASTICSEARCH_REPLICAS=2
  ```
