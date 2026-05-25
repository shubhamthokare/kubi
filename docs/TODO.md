# 📋 Kubi AI: Project Roadmap & TODO List

This document outlines completed milestones, current progress, and future development phases for the **Kubi AI** autonomous SRE platform.

---

## 🎉 Completed Milestones

We have successfully engineered the core infrastructure and telemetry layers of the platform:

- **[x] Next.js 15 & Tailwind 4 Dashboard Migration**: Upgraded frontend architectures, resolved build issues, and integrated modern Material UI and Shadcn UI layout grids.
- **[x] SRE Namespace Realignment & Service Mesh**: Relocated the autonomous incident agent (`kubi-agent`) and its RBAC roles into the unified `kubi` namespace; established seamless routing via a new internal ClusterIP service (`kubi-agent-service`).
- **[x] Next.js In-Cluster Rewrite Mappings**: Dynamic `BACKEND_URL` environment injection resolved legacy Next.js server-side rewrites and EAI DNS resolution issues.
- **[x] Multi-Pathway Cluster Verification**: Successfully verified all three backend cluster access methods (Agent URL, Direct Credentials, and Kubeconfig) against the live API server using dynamic cert pools.
- **[x] Arize AX Telemetry & Observability Integration**: Enabled full OpenTelemetry tracing of FastAPI routing, Gemini LLM calls, and network spans, complete with strict local data-redaction security filters.
- **[x] Elasticsearch Semantic RAG Setup**: Configured Elasticsearch 8.13.4 index mapping, RAG search, and context integration to provide Gemini historical incident context.
- **[x] Monorepo Restructuring**: Cleanly reorganized modules into `apps/backend/`, `apps/agent/`, and `apps/frontend/`.
- **[x] Multi-Platform Docker Orchestration**: Created `deploy-docker.ps1` and `deploy-docker.sh` wrapper utilities to launch the whole cluster stack with a single click.
- **[x] Container Build & CI/CD Pipeline Security Hardening**: Secured container builds and runner workflows monorepo-wide using `--only-binary :all:` rules to block compromised dependency execution; established `--default-timeout=100` resilience against transient PyPI metadata server connection drops.
- **[x] GKE Production Deployment**: All 5 workloads (`elasticsearch`, `kubi-agent`, `kubi-backend`, `kubi-frontend`, `mongodb`) running `1/1 Ready` in GKE namespace `kubi`, publicly accessible at `http://8.231.96.95`.

---

## 🛠️ Phase 0: Immediate Fixes & Stabilization
- [x] **API Key Startup validation**: Check `GEMINI_API_KEY` status during boot and log detailed connection diagnoses.
- [x] **Resilient Log streams**: Gracefully handle pod log capture requests during unstable workloads (e.g., `ImagePullBackOff`).
- [x] **Frontend Error Boundaries**: Add React-level boundaries to prevent dashboard failures during service timeouts.
- [x] **MongoDB Reconnection Loops**: Implement retry logic for initial database connectivity at backend startup.

---

## 🛡️ Phase 1: Security & Hardening
- [x] **Vault / Secret Manager Integration**: Pull runtime secrets directly from HashiCorp Vault or cloud providers (integrated Google Secret Manager via External Secrets Operator).
- [x] **Identity & SSO Authentication**: Implement OIDC/OAuth2 bindings (Google Workspace, GitHub, GitLab) for dashboard login (full backend auth exchanges and premium frontend redirect/callbacks established).
- [x] **SSO Redirect Fix**: Patched mock dev OIDC flow to redirect to relative `/auth/callback` — eliminates `localhost:8000` redirect failures in GKE.
- [x] **Rate Limiting Fix**: Updated `security.py` to extract real client IP from `X-Forwarded-For` header, preventing `429 Too Many Requests` when all traffic originates from the Next.js reverse-proxy pod IP.
- [x] **RBAC Rule Optimization**: Restrict Kubernetes `ClusterRoles` to minimum required operation sets. Backend role is now read-only (`get`, `list`, `watch`); only `kubi-agent` retains write verbs (`patch`, `update`) plus `replicasets` (rollback) and `pods/exec` (diagnostics).
- [x] **API Protection**: Rate-limiting applied to all auth routes (`/login` 20/min, `/callback` 20/min, `/dev-token` 5/min). All data API routes already carry JWT scope guards (`sre:read` / `sre:write`). Ingest endpoint is network-scoped (ClusterIP only).
- [x] **Elasticsearch Token Authentication**: Supported secure token-based API Key authentication flows.
- [x] **SaaS Multi-Tenancy & Workspace Isolation (Completed)**:
  - [x] *Fix OTP Imports & Routing*: Correct `auth_routes_otp.py` imports to use `app.db.database.get_db` and register the OTP router in `main.py`.
  - [x] *SSO Account Linking*: Update OIDC `/api/auth/callback` to dynamically link verified emails using `users` and `oauth_accounts` MongoDB collections.
  - [x] *Linked Providers API*: Implement `GET /api/auth/linked-accounts` and `DELETE /api/auth/linked-accounts/{provider}` to manage connections.
  - [x] *Workspace RBAC Middleware*: Build FastAPI dependency `get_current_workspace_user` to validate memberships and enforce roles (`owner`, `admin`, `member`, `viewer`).
  - [x] *Workspace CRUD APIs*: Implement `GET /api/workspaces` (list) and `POST /api/workspaces` (create) with default personal workspace generation.
  - [x] *Member management APIs*: Implement `POST /api/workspaces/{id}/invite` and member revocation endpoints.

---

## 🧠 Phase 2: AI & RAG Intelligence
- [ ] **Gemini Prompt Tuning**: Optimize system prompts to improve Root Cause Analysis (RCA) quality on dense pod logs.
- [ ] **Multi-Model Orchestrations**: Allow fallback options to alternative reasoning models (e.g., Claude 3.5 Sonnet).
- [ ] **SRE Feedback Loop**: Let human operators "rate" and leave suggestions on remediation plans to fine-tune future AI outputs.
- [x] **Historic Context matching**: Enhance Elasticsearch RAG queries to auto-map recurring patterns.

---

## 🛡️ Phase 3: Observability Extensions
- [x] **Prometheus Metrics bindings**: Incorporate resource telemetry (CPU/Memory usage charts) directly into incident timelines (integrated Prometheus & Grafana stack via upgraded Helm orchestrators).
- [x] **ChatOps Notifications**: Trigger instant Slack, Teams, or Discord alerts upon incident discovery or remediation success.
- [x] **Log Tail streams**: Implement live Websocket streaming for active container logs inside the dashboard logs viewer.

---

## ⚡ Phase 4: Custom Automation
- [ ] **Operator Playbooks**: Let users define custom automation scripts (YAML/Python) to run alongside Gemini remediation proposals.
- [ ] **Safe-mode Rollback guards**: Monitor workloads for 5 minutes post-remediation and auto-rollback if health checks degrade.

---

## 🚀 Phase 5: GKE Deployment & Operations
- [x] **GKE CPU Scheduling Fix**: Reduced CPU requests (`50m`) for `kubi-agent` and `elasticsearch` to resolve pod scheduling deadlocks on `e2-medium` nodes.
- [x] **CI/CD GitOps Pipeline**: Added build sentinel artifacts and conditional Kustomize image tag updates to `.gitlab-ci.yml`; prevents empty GitOps commits.
- [x] **Clean Deploy Policy**: Removed all auto-seeding of cluster connections at startup. Deployments begin with `clusters: []` — users add connections manually via the Settings UI.
- [x] **Live MongoDB State Reset**: Cleared previously seeded `kubi-internal-agent` entry from GKE MongoDB (`clusters: [], active_cluster_id: null`).

---

*Last Updated: May 24, 2026*
*Project Stage: Phase 2 (Active)*
