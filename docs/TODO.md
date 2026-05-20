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

---

## 🛠️ Phase 0: Immediate Fixes & Stabilization
- [x] **API Key Startup validation**: Check `GEMINI_API_KEY` status during boot and log detailed connection diagnoses.
- [x] **Resilient Log streams**: Gracefully handle pod log capture requests during unstable workloads (e.g., `ImagePullBackOff`).
- [x] **Frontend Error Boundaries**: Add React-level boundaries to prevent dashboard failures during service timeouts.
- [x] **MongoDB Reconnection Loops**: Implement retry logic for initial database connectivity at backend startup.

---

## 🛡️ Phase 1: Security & Hardening
- [ ] **Vault / Secret Manager Integration**: Pull runtime secrets directly from HashiCorp Vault or cloud providers.
- [ ] **Identity & SSO Authentication**: Implement OIDC/OAuth2 bindings (Google Workspace, GitHub, GitLab) for dashboard login.
- [ ] **RBAC Rule Optimization**: Restrict Kubernetes `ClusterRoles` to minimum required operation sets.
- [ ] **API Protection**: Apply JWT scopes and rate-limiting rules across all public API routes.
- [x] **Elasticsearch Token Authentication**: Supported secure token-based API Key authentication flows.

---

## 🧠 Phase 2: AI & RAG Intelligence
- [ ] **Gemini Prompt Tuning**: Optimize system prompts to improve Root Cause Analysis (RCA) quality on dense pod logs.
- [ ] **Multi-Model Orchestrations**: Allow fallback options to alternative reasoning models (e.g., Claude 3.5 Sonnet).
- [ ] **SRE Feedback Loop**: Let human operators "rate" and leave suggestions on remediation plans to fine-tune future AI outputs.
- [x] **Historic Context matching**: Enhance Elasticsearch RAG queries to auto-map recurring patterns.

---

## 🛡️ Phase 3: Observability Extensions
- [ ] **Prometheus Metrics bindings**: Incorporate resource telemetry (CPU/Memory usage charts) directly into incident timelines (e.g., automated OOM detection).
- [ ] **ChatOps Notifications**: Trigger instant Slack, Teams, or Discord alerts upon incident discovery or remediation success.
- [ ] **Log Tail streams**: Implement live Websocket streaming for active container logs inside the dashboard logs viewer.

---

## ⚡ Phase 4: Custom Automation
- [ ] **Operator Playbooks**: Let users define custom automation scripts (YAML/Python) to run alongside Gemini remediation proposals.
- [ ] **Safe-mode Rollback guards**: Monitor workloads for 5 minutes post-remediation and auto-rollback if health checks degrade.

---
*Last Updated: May 21, 2026*  
*Project Stage: Phase 1 (Active)*

