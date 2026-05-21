# 🗺️ Kubi AI End-to-End Workflow Architecture

This document presents a comprehensive visual and structural map of the **Kubi AI** autonomous operations platform. It details how pod incidents flow from initial detection through AI-driven Root Cause Analysis (RCA), local or cloud telemetry tracing, operator approval gates, and automated remediation.

![Kubi AI End-to-End Workflow Chart](kubi_workflow_chart.png)

---

## 🏗️ Visual Workflow Flowchart

Below is the complete architectural diagram mapping every system interaction, telemetry hook, and persistence layer in the platform.

```mermaid
---
id: b03db450-8943-4eac-9faf-6cfc24679cf8
---
graph TD
    %% ─────────────────────────────────────────────────────────────
    %% Phase A: Detection & Telemetry
    %% ─────────────────────────────────────────────────────────────
    subgraph Phase_A ["🚨 DETECTION PHASE (Every 30s)"]
        A1["broke-pod / broken-pod<br>(ImagePullBackOff / OOMKill)"] -->|1. Failed Pod State| A2("🔍 Kubi Agent Daemon<br>(kubernetes-client)")
        A2 -->|2. Ingest Incident<br>/api/v1/incidents/ingest| A3("🖥️ Kubi Backend API<br>(FastAPI Router)")
        
        %% Telemetry hooks
        A2 -.->|FastAPI & Requests Spans| T1["🛰️ local Phoenix<br>(http://localhost:6006)"]
        A3 -.->|FastAPI & HTTPX Spans| T1
    end

    %% ─────────────────────────────────────────────────────────────
    %% Phase B: Analysis & Observability
    %% ─────────────────────────────────────────────────────────────
    subgraph Phase_B ["🧠 ANALYSIS & OBSERVABILITY PHASE"]
        A3 -->|3. Fetch Diagnostics| B1{"🛠️ K8s Cluster API"}
        B1 -->|Retrieve Logs & Events| B2["📋 Pod Events & Logs"]
        
        A3 -->|4. Check CI/CD Pipelines| B3{"🦊 GitLab API"}
        B3 -->|Get Last Commit & Pipeline Status| B4["🚀 GitLab Deploy Meta"]
        
        B2 & B4 -->|5. Assemble RAG Context| B5["🧠 Google Gemini LLM<br>(google-genai Client)"]        
        B5 -.->|"6. Local Sanitization<br/>Redact Auth Keys Cookies"| B6["🔒 arize_tracing.py<br/>Sensitive Data Redactor"]
        B6 -.->|Clean Gemini Spans| T2["🛰️ Arize Cloud<br>(arize-otel Exporter)"]
    end

    %% ─────────────────────────────────────────────────────────────
    %% Phase C: Storage & Indexing
    %% ─────────────────────────────────────────────────────────────
    subgraph Phase_C ["💾 STORAGE & INDEXING PHASE"]
        B5 -->|7. Generate Remediation Plan| C1[("💾 MongoDB Collections<br>(incidents, remediations)")]
        C1 -->|8. Index for Vector Search| C2[("🔍 Elasticsearch Indices<br>(kubi-incidents, kubi-rca, kubi-remediation)")]
    end

    %% ─────────────────────────────────────────────────────────────
    %% Phase D: Resolution & Humans
    %% ─────────────────────────────────────────────────────────────
    subgraph Phase_D ["👤 RESOLUTION & OPERATOR HUB"]
        C1 & C2 -->|9. Render Incidents & Plans| D1["💻 Next.js 15 Dashboard UI<br>(MUI & Tailwind 4)"]
        D1 -->|Highlight Plan Source| D2{"✨ Badge: 'AI Generated'?"}
        
        D2 -->|Yes| D3["👤 Operator Approval Gate"]
        D2 -->|No / Failed Action| D4["🛠️ Operator Quick-Actions<br>(Restart Pod, Rollback Deploy)"]
        
        D3 -->|Approved| E1["⚡ Action Execution Engine"]
        D4 -->|Trigger Direct Command| E1
    end

    %% ─────────────────────────────────────────────────────────────
    %% Phase E: Verification
    %% ─────────────────────────────────────────────────────────────
    subgraph Phase_E ["✅ VERIFICATION & DOCUMENTATION"]
        E1 -->|10. Execute Fix| E2{"☸️ Kubernetes/GitLab APIs"}
        E2 -->|Delete Pod / Restart Rollout| E3["🔄 Recovery Cycle"]
        E3 -->|11. Health Check Scan| E4{"🔍 Post-Action Scanner"}
        
        E4 -->|Healthy| F1["📄 Generate Postmortem<br>(Detailed RCA Markdown Report)"]
        E4 -->|Unhealthy| F2["🚨 Mark Failed & Propose New Scan Bypass"]
    end

    %% ─────────────────────────────────────────────────────────────
    %% Styles & Colors
    %% ─────────────────────────────────────────────────────────────
    classDef trigger fill:#fee2e2,stroke:#ef4444,stroke-width:2px,color:#991b1b;
    classDef logic fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e40af;
    classDef telemetry fill:#faf5ff,stroke:#a855f7,stroke-width:2px,color:#6b21a8;
    classDef database fill:#f0fdf4,stroke:#22c55e,stroke-width:2px,color:#166534;
    classDef operator fill:#fff7ed,stroke:#f97316,stroke-width:2px,color:#9a3412;
    classDef verify fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px,color:#5b21b6;

    class A1,F2 trigger;
    class A2,A3,B1,B3,B5,E1 logic;
    class T1,T2,B6 telemetry;
    class C1,C2 database;
    class D1,D2,D3,D4 operator;
    class F1,E3,E4 verify;
```

---

## 📖 Deep-Dive Walkthrough of the Recovery Loop

### 1. Incident Detection & Ingestion
* **Trigger**: A container inside a pod triggers a lifecycle state exception (e.g., `CrashLoopBackOff` or `OOMKilled`).
* **Detection**: The background agent daemon, running inside the cluster namespace, queries namespaced pod schemas every 30 seconds.
* **Ingestion**: It parses the pod status details and securely transmits the payload to the FastAPI `/api/v1/incidents/ingest` endpoint where a clean `"active"` state is default-mapped.
* **Telemetry**: All incoming FastAPI request headers, timing parameters, and body metrics are instrumented using **OpenTelemetry** interceptors.

### 2. Context Extraction (RAG) & LLM Reasoning
* **Retrieval**: The backend connects to the K8s Core API to fetch structural pod logs, container status summaries, and active cluster events.
* **Deployment Context**: Simultaneously, the backend queries the GitLab CI/CD API to check the latest pipeline runs, deployment commits, and runner logs.
* **Synthesis**: This collected infrastructure data is formulated as localized Retrieval-Augmented Generation (RAG) context.
* **LLM Reasoning**: The backend feeds this context directly to **Google Gemini**. Gemini performs SRE-grade reasoning to outline the Root Cause Analysis (RCA) and formulate a highly structured step-by-step recovery recipe.

### 3. Sanitization & Observability Pipeline
* **Security Interceptor**: Before any traces are transmitted outside the cluster, the `arize_tracing.py` redaction middleware iterates through all span metadata.
* **Filtering**: Replace sensitive headers (e.g., `Authorization`, `X-API-Key`, `Cookie`, `gitlab-private-token`) and body fields (e.g., `password`, `secret`, `token`) with a secure `[REDACTED]` placeholder.
* **Telemetry Export**: Sanitized spans are securely exported:
  * **To Local Phoenix**: Sent via HTTP/OTLP to your developer machine dashboard at `http://localhost:6006`.
  * **To Arize Cloud**: Exporter sends directly via secure HTTPS/gRPC to your enterprise observability space.

### 4. Storage, Vector Indexing, & Badging
* **Metadata Persistence**: The incident states and structured remediation plans are stored in MongoDB.
* **Semantic Search**: Spans and RCAs are concurrently indexed inside **Elasticsearch** cluster indexes (`kubi-incidents`, `kubi-pod-logs`, `kubi-remediation`) to allow vectorized, semantic search of historical postmortems.
* **Badging**: Plans are labeled with `"generated_by": "ai"` dynamically. When loaded in the Next.js UI dashboard, AI-originated plans are rendered with premium glassmorphic **"AI Generated"** badges to alert operators of automated plans.

### 5. Human-in-the-Loop Approval & Manual Interventions
* **Gatekeeping**: Operators review AI-proposed remediations on the high-density Next.js web application.
* **Resolution Path A (Automated)**: Operators click **"Approve & Execute"**. The backend Action Engine executes the K8s patch or triggers the GitLab pipeline rollback automatically.
* **Resolution Path B (Manual Overrides)**: If a remediation fails or is rejected, the dashboard dynamically unlocks resilient operator quick-actions (**"Manually Restart Pod"**, **"Manually Restart Deployment"**, **"Manually Rollback Deployment"**), allowing immediate manual recovery.

### 6. Closed-Loop Verification
* **Post-Action Sweep**: The backend background scanner triggers an immediate, targeted scan of the affected pod's namespace.
* **Success Paths**:
  * **WORKLOAD RESTORED**: If the pod enters a healthy `Running` state, the incident is closed, and a clean **SRE Postmortem Markdown Report** is generated and archived for audit compliance.
  * **WORKLOAD FAILS**: If the recovery is unsuccessful, the system flags the incident status as `failed_verification` or `failed_execution` and automatically unlocks scan-skip overrides, allowing Gemini to re-analyze and propose a secondary, alternative recovery recipe.
