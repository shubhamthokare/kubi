# 🛠️ Kubi AI: Technology Stack & Architecture

This document provides a detailed breakdown of the technical architecture, component stack, and module locations of the **Kubi AI** platform.

---

## 📁 Monorepo Structure & Core Components

Kubi AI is organized as a high-performance monorepo, separating concerns between user interface, daemon-level agents, and orchestrating API layers.

```
kubi/
├── apps/
│   ├── frontend/     # Next.js Dashboard UI
│   ├── backend/      # FastAPI Orchestration Engine
│   └── agent/        # Autonomous Kubernetes SRE Daemon
├── deploy/
│   ├── container/    # Docker Compose orchestration
│   └── k8s/          # Kubernetes Kustomize manifests
```

---

## 🖥️ Frontend (`apps/frontend`)

_The SRE Command Center for real-time cluster operations and approval workflows._

| Technology            | Purpose                                                                    | Module Path                        |
| :-------------------- | :------------------------------------------------------------------------- | :--------------------------------- |
| **Next.js 15**        | Core framework for the high-performance, server-side rendered dashboard.   | `apps/frontend/`                   |
| **TypeScript**        | Type safety across UI components, API interfaces, and state objects.       | `apps/frontend/src/`               |
| **Tailwind CSS 4**    | Utility-first styling for a sleek, responsive, and modern dark-mode UI.    | `apps/frontend/src/app/index.css`  |
| **Material UI (MUI)** | Enterprise-grade component library for complex interactive cluster tables. | `apps/frontend/src/components/`    |
| **Shadcn UI**         | Accessible, beautifully designed modular primitive controls.               | `apps/frontend/src/components/ui/` |
| **Framer Motion**     | Powers smooth micro-animations and status transition states.               | `apps/frontend/src/components/`    |

---

## ⚙️ Backend (`apps/backend`)

_The asynchronous ingestion and database engine driving autonomous incident recovery._

| Technology               | Purpose                                                                        | Module Path                  |
| :----------------------- | :----------------------------------------------------------------------------- | :--------------------------- |
| **FastAPI**              | High-performance Python framework exposing incident APIs and cluster handlers. | `apps/backend/app/main.py`   |
| **MongoDB**              | Primary persistence layer storing incident logs, postmortems, and settings.    | Database Container           |
| **Motor (Async)**        | Asynchronous Python driver facilitating non-blocking MongoDB communication.    | `apps/backend/app/db/`       |
| **Pydantic v2**          | Strict schema verification, data validation, and settings management.          | `apps/backend/app/schemas/`  |
| **Elasticsearch 8.13.4** | Vector search and semantic incident querying for RAG-based context resolution. | `apps/backend/app/services/` |

---

## 🕵️‍♂️ Agent Daemon (`apps/agent`)

_The autonomous background cluster watch and remediation worker._

| Technology           | Purpose                                                                    | Module Path                     |
| :------------------- | :------------------------------------------------------------------------- | :------------------------------ |
| **Python 3.11+**     | High-efficiency event-driven monitoring daemon.                            | `apps/agent/`                   |
| **Kubernetes SDK**   | Direct API communication to watch cluster pod transitions and stream logs. | `apps/agent/kubernetes_client/` |
| **Arize AX Tracing** | Production-grade observability, telemetry collection, and span exporter.   | `apps/agent/arize_tracing.py`   |

---

## 🧠 AI & Observability Layer

_The intelligence core powered by Google Gemini and instrumented by Arize._

- **Gemini 1.5 Pro / Flash**: Handles complex multi-step Root Cause Analysis (RCA) and plans recovery steps.
- **RCA Engine**: Dynamically analyzes pod statuses, logs, and events to extract meaningful failures.
- **Arize AX Telemetry**: Fully traces LLM prompt execution, token sizes, external client times, and sanitizes sensitive credentials before transmitting traces.

---

## 🏗️ Infrastructure & Orchestration

_Cloud-native distribution configurations._

- **Docker & Compose**: Containerization strategy providing uniform environments across dev and prod (`deploy/container/`).
- **Kustomize**: Template-free, clean configuration overlay engine for managing secrets, resources, and endpoints (`deploy/k8s/`).
