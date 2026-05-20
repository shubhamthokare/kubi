# 📈 Kubi AI Platform: Changelog & Release Notes

This document logs all key structural upgrades, feature integrations, and telemetry enhancements applied to the **Kubi AI** platform.

---

## 🚀 Key Milestones Completed

### 1. 🏗️ Monorepo Path Realignment & Restructuring
We transitioned the codebase from a fragmented directory structure into a cohesive, high-performance monorepo matching modern enterprise standards.
- Moved the backend orchestration service from `be/` to [`apps/backend/`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/).
- Moved the background observer daemon from `agent/` to [`apps/agent/`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/agent/).
- Standardized the Next.js React client inside [`apps/frontend/`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/frontend/).
- Updated container architectures and script entries to target new paths seamlessly.

### 2. 🛰️ Arize AX Tracing & Observability
Introduced deep OpenTelemetry monitoring to map Google Gemini LLM API calls, network requests, and daemon activity.
- Integrated OpenInference standard bindings to track prompt responses, latencies, and token sizes.
- Configured data sanitation guards in [`apps/backend/app/core/arize_tracing.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/app/core/arize_tracing.py) and [`apps/agent/arize_tracing.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/agent/arize_tracing.py) to locally redact sensitive keys and headers before dispatch.
- Standardized setup guides in the unified [`docs/ARIZE.md`](file:///c:/Users/shubh/Downloads/repo/kubi/docs/ARIZE.md).

### 3. 🔍 Elasticsearch RAG & Context Storage
Integrated Elasticsearch 8.13.4 to power semantic context retrieval during incident root cause analysis.
- Unified Elasticsearch setup, mapping schemas, and query helpers in the unified [`docs/ELASTICSEARCH.md`](file:///c:/Users/shubh/Downloads/repo/kubi/docs/ELASTICSEARCH.md).
- Restructured Elasticsearch module mappings to target [`apps/backend/app/services/`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/app/services/).

### 4. 🐋 Automated Container Orchestration
Created cross-platform orchestration tooling to deploy the whole monorepo stack with a single command.
- Created `deploy-docker.ps1` (Windows PowerShell) and `deploy-docker.sh` (Bash) in the root directory.
- Configured the deployment scripts to automatically scan for prerequisite runtimes, parse backend environmental settings, and compose container dependencies in [`deploy/container/docker-compose.yml`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/container/docker-compose.yml).

---

## 🔧 Detailed Component Changes

### 📁 Backend (`apps/backend`)
- **`app/core/arize_tracing.py`**: Added main OpenTelemetry initializer with active header/key scrub filters.
- **`app/services/elasticsearch_service.py`**: Created asynchronous index search/upsert mappings.
- **`main.py`**: Configured to run `initialize_arize_tracing()` immediately on execution start before importing any Gemini dependencies.
- **`requirements.txt`**: Added `arize-otel`, `openinference-instrumentation-google-genai`, `opentelemetry-instrumentation-fastapi`, `opentelemetry-instrumentation-requests`, and `opentelemetry-instrumentation-httpx`.

### 🕵️‍♂️ Agent Daemon (`apps/agent`)
- **`arize_tracing.py`**: Added agent telemetry initializer.
- **`main.py`**: Added early Arize hook imports.
- **`requirements.txt`**: Added `arize-otel`, `opentelemetry-instrumentation-fastapi`, and `opentelemetry-instrumentation-requests`.

### 🗂️ Documentation (`docs/`)
- Unified Elasticsearch instructions into [`docs/ELASTICSEARCH.md`](file:///c:/Users/shubh/Downloads/repo/kubi/docs/ELASTICSEARCH.md).
- Unified Arize telemetry instructions into [`docs/ARIZE.md`](file:///c:/Users/shubh/Downloads/repo/kubi/docs/ARIZE.md).
- Consolidated root and docs testing rules into [`docs/checks.md`](file:///c:/Users/shubh/Downloads/repo/kubi/docs/checks.md).
- Cleaned up **6 redundant markdown files** to ensure documentation is accurate and single-sourced.

---
*Updated: May 18, 2026*  
*Status: Ready for Production Rollout 🚀*
