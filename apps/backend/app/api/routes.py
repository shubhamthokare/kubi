from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, Query, Header, Depends
from app.workflows.incident_detection import IncidentDetectionWorkflow
from app.workflows.remediation_workflow import RemediationWorkflow
from app.services.kubernetes_service import KubernetesService
from app.core.security import get_current_user_with_scope, rate_limit

from app.api.schemas import (
    StatusResponse, HealthResponse, IncidentListResponse,
    IncidentIngestRequest, IncidentIngestResponse, IncidentReportResponse,
    ScanResponse, PlanResponse, PlanListResponse, PlanExecutionResponse,
    ClusterStatsResponse, ClusterResourcesResponse, SettingsResponse,
    SettingsUpdateRequest, ReportListResponse, ValidateGeminiRequest,
    ValidateGitlabRequest, ValidateClusterRequest, ESValidateRequest,
    ValidationDetailResponse, SearchResponse, ESHealthResponse,
    ManualActionRequest, ManualRemediationRequest, ManualRemediationResponse
)

router = APIRouter()
remediation_workflow = RemediationWorkflow()

def _find_cluster(clusters: list, target_id: str) -> Optional[dict]:
    for cluster in clusters:
        if cluster.get("id") == target_id:
            return cluster
    return None

async def get_k8s_service(x_cluster_id: Optional[str] = Header(None)) -> KubernetesService:
    from app.db.database import get_db
    try:
        db = get_db()
        settings = await db.settings.find_one({"id": "system_config"})
    except Exception:
        settings = None
        
    if not settings:
        return KubernetesService()
        
    clusters = settings.get("clusters", [])
    if not clusters:
        return KubernetesService(cluster_config={"auth_type": "disabled"})
        
    # Try finding by header cluster id
    if x_cluster_id:
        cluster = _find_cluster(clusters, x_cluster_id)
        if cluster:
            return KubernetesService(cluster_config=cluster)
            
    # Try finding by active_cluster_id
    active_id = settings.get("active_cluster_id")
    if active_id:
        cluster = _find_cluster(clusters, active_id)
        if cluster:
            return KubernetesService(cluster_config=cluster)
            
    return KubernetesService(cluster_config=clusters[0])

@router.post("/scan", response_model=ScanResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def trigger_scan(namespaces: Optional[List[str]] = Query(None), x_cluster_id: Optional[str] = Header(None)):
    """
    Trigger a manual scan of the Kubernetes cluster for incidents.
    """
    cluster_config = None
    target_cluster_id = x_cluster_id
    from app.db.database import get_db
    db = get_db()
    settings = await db.settings.find_one({"id": "system_config"})
    if settings:
        clusters = settings.get("clusters", [])
        if clusters:
            matched = False
            if target_cluster_id:
                for cluster in clusters:
                    if cluster.get("id") == target_cluster_id:
                        cluster_config = cluster
                        matched = True
                        break
            if not matched:
                active_id = settings.get("active_cluster_id")
                if active_id:
                    for cluster in clusters:
                        if cluster.get("id") == active_id:
                            cluster_config = cluster
                            target_cluster_id = active_id
                            matched = True
                            break
            if not matched:
                cluster_config = clusters[0]
                target_cluster_id = clusters[0].get("id")

    workflow = IncidentDetectionWorkflow(cluster_config=cluster_config)
    result = await workflow.run_scan(namespaces, cluster_id=target_cluster_id)
    return result

@router.post("/plans/{plan_id}/approve", response_model=PlanExecutionResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def approve_plan(plan_id: str):
    """
    Approves a pending remediation plan and executes it.
    """
    result = await remediation_workflow.approve_and_execute(plan_id)
    return result

@router.post("/plans/{plan_id}/reject", response_model=StatusResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def reject_plan(plan_id: str):
    """
    Rejects a pending remediation plan.
    """
    result = await remediation_workflow.reject_plan(plan_id)
    return result

@router.get("/health", response_model=HealthResponse, dependencies=[Depends(rate_limit(60))])
def health_check():
    return {"status": "healthy"}

@router.get("/plans", response_model=PlanListResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def get_plans():
    """
    List all pending and completed remediation plans.
    """
    plans = await remediation_workflow.get_all_plans()
    return {"plans": plans}

@router.get(
    "/plans/{plan_id}",
    response_model=PlanResponse,
    dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))],
    responses={404: {"description": "Remediation plan not found"}}
)
async def get_plan(plan_id: str):
    """
    Get a specific remediation plan.
    """
    plan = await remediation_workflow.get_plan(plan_id)
    if not plan:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan

@router.get("/incidents", response_model=IncidentListResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def get_incidents(x_cluster_id: Optional[str] = Header(None)):
    """
    List all detected incidents.
    """
    from app.db.database import get_db
    db = get_db()
    
    target_cluster_id = x_cluster_id
    settings = await db.settings.find_one({"id": "system_config"})
    if settings:
        clusters = settings.get("clusters", [])
        if clusters:
            valid_ids = [c.get("id") for c in clusters]
            if not target_cluster_id or target_cluster_id not in valid_ids:
                active_id = settings.get("active_cluster_id")
                if active_id in valid_ids:
                    target_cluster_id = active_id
                else:
                    target_cluster_id = valid_ids[0]
        else:
            target_cluster_id = None
    else:
        target_cluster_id = None

    query = {}
    if target_cluster_id:
        query["cluster_id"] = target_cluster_id
    incidents = await db.incidents.find(query).sort("_id", -1).to_list(length=None)
    for i in incidents:
        i["_id"] = str(i["_id"])
    return {"incidents": incidents}

@router.get("/stats", response_model=ClusterStatsResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def get_stats(x_cluster_id: Optional[str] = Header(None), ks: KubernetesService = Depends(get_k8s_service)):
    """
    Get real-time cluster statistics including average resolution time.
    """
    from app.db.database import get_db
    from datetime import datetime
    
    stats = ks.get_cluster_stats()
    
    # Calculate Avg Resolution Time from DB
    db = get_db()
    query = {"status": "resolved"}
    if x_cluster_id:
        query["cluster_id"] = x_cluster_id
    resolved_incidents = await db.incidents.find(query).to_list(length=100)
    
    avg_res_time = "N/A"
    if resolved_incidents:
        total_seconds = 0
        count = 0
        for inc in resolved_incidents:
            try:
                # Use fromisoformat for Python 3.11+
                first = datetime.fromisoformat(inc["first_detected"])
                resolved = datetime.fromisoformat(inc["resolved_at"])
                duration = (resolved - first).total_seconds()
                if duration > 0:
                    total_seconds += duration
                    count += 1
            except Exception:
                continue
        
        if count > 0:
            avg_seconds = total_seconds / count
            if avg_seconds < 60:
                avg_res_time = f"{int(avg_seconds)}s"
            elif avg_seconds < 3600:
                avg_res_time = f"{int(avg_seconds // 60)}m {int(avg_seconds % 60)}s"
            else:
                avg_res_time = f"{int(avg_seconds // 3600)}h {int((avg_seconds % 3600) // 60)}m"
    
    stats["avg_resolution_time"] = avg_res_time
    return stats

@router.get("/resources", response_model=ClusterResourcesResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def get_resources(ks: KubernetesService = Depends(get_k8s_service)):
    """
    Get all cluster resources (namespaces, deployments, pods) for filtering.
    """
    return ks.get_all_resources()

@router.get(
    "/incidents/{incident_id}/report",
    response_model=IncidentReportResponse,
    dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))],
    responses={404: {"description": "Incident not found"}}
)
async def get_incident_report(incident_id: str):
    """
    Generate and retrieve a professional postmortem report for an incident.
    """
    from app.db.database import get_db
    from bson import ObjectId
    from app.services.reporting_service import ReportingService
    from app.workflows.remediation_workflow import RemediationWorkflow
    
    db = get_db()
    incident = await db.incidents.find_one({"_id": ObjectId(incident_id)})
    if not incident:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Check if a plan exists and its status
    execution_results = None
    if incident.get("plan_id"):
        rw = RemediationWorkflow()
        plan_entry = await rw.get_plan(incident["plan_id"])
        if plan_entry and plan_entry.get("status") in ["completed", "failed_verification", "failed_execution"]:
            execution_results = {
                "status": plan_entry["status"],
                "verified": plan_entry.get("status") == "completed",
                "actions": plan_entry.get("plan", {}).get("actions", [])
            }

    reporting_service = ReportingService()
    report_md = await reporting_service.generate_postmortem(incident, execution_results)
    
    return {"report_md": report_md}

@router.get("/settings", response_model=SettingsResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def get_settings():
    """
    Get system settings.
    """
    from app.db.database import get_db
    import os
    db = get_db()
    settings_doc = await db.settings.find_one({"id": "system_config"})
    
    default_kubeconfig = (
        "apiVersion: v1\n"
        "kind: Config\n"
        "clusters:\n"
        "- name: local-cluster\n"
        "  cluster:\n"
        "    server: https://kubernetes.default.svc\n"
        "    insecure-skip-tls-verify: true\n"
        "contexts:\n"
        "- name: local-context\n"
        "  context:\n"
        "    cluster: local-cluster\n"
        "    user: dummy\n"
        "current-context: local-context\n"
        "users:\n"
        "- name: dummy\n"
        "  user:\n"
        "    token: dummy"
    )
    
    default_cluster_entry = {
        "id": "kubi-internal-agent",
        "name": "Local Kubi Cluster",
        "auth_type": "kubeconfig",
        "agent_url": "http://kubi-agent-service:8080",
        "namespace": "*",
        "kubeconfig": default_kubeconfig
    }
    
    if not settings_doc:
        settings_doc = {
            "namespaces": ["default"],
            "scan_interval": 30,
            "gemini_model": "gemini-2.5-pro",
            "gitlab_enabled": False,
            "kubeconfig": "",
            "gitlab_api_url": "",
            "gitlab_private_token": "",
            "gemini_api_key": "",
            "clusters": [default_cluster_entry],
            "active_cluster_id": "kubi-internal-agent"
        }
    else:
        # Seed clusters list if it doesn't exist
        if "clusters" not in settings_doc or not settings_doc["clusters"]:
            settings_doc["clusters"] = [default_cluster_entry]
            settings_doc["active_cluster_id"] = "kubi-internal-agent"
    settings_doc["_id"] = str(settings_doc.get("_id", "new"))
    
    # Mask credentials to prevent exposure in frontend UI
    if settings_doc.get("gemini_api_key"):
        settings_doc["gemini_api_key"] = "••••••••••••••••"
    if settings_doc.get("gitlab_private_token"):
        settings_doc["gitlab_private_token"] = "••••••••••••••••"
        
    return settings_doc

@router.post("/settings", response_model=StatusResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def update_settings(new_settings: SettingsUpdateRequest):
    """
    Update system settings.
    """
    from app.db.database import get_db
    from datetime import datetime, timezone
    db = get_db()
    
    # Preserve actual credentials if masked bullets are passed back from frontend
    existing_doc = await db.settings.find_one({"id": "system_config"}) or {}
    new_settings_dict = new_settings.model_dump(exclude_unset=True)
    
    for credential_key in ["gemini_api_key", "gitlab_private_token"]:
        val = new_settings_dict.get(credential_key)
        if val and all(c in "*•" for c in val):
            if existing_doc.get(credential_key):
                new_settings_dict[credential_key] = existing_doc[credential_key]
            else:
                new_settings_dict[credential_key] = ""
                
    # Automatically handle active_cluster_id sync when clusters change or get deleted
    clusters = new_settings_dict.get("clusters", [])
    active_cluster_id = new_settings_dict.get("active_cluster_id")
    if not clusters:
        new_settings_dict["active_cluster_id"] = None
    elif active_cluster_id and active_cluster_id not in [c.get("id") for c in clusters]:
        new_settings_dict["active_cluster_id"] = clusters[0].get("id")
                
    new_settings_dict["id"] = "system_config"
    new_settings_dict["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    new_settings_dict.pop("_id", None)
    
    await db.settings.update_one(
        {"id": "system_config"},
        {"$set": new_settings_dict},
        upsert=True
    )
    
    # Save kubeconfig to local file if provided
    if "kubeconfig" in new_settings_dict and new_settings_dict["kubeconfig"]:
        import os
        kubeconfig_path = os.getenv("KUBECONFIG_PATH", "custom_kubeconfig.yaml")
        try:
            with open(kubeconfig_path, "w") as f:
                f.write(new_settings_dict["kubeconfig"])
        except Exception as e:
            print(f"Failed to write custom kubeconfig to {kubeconfig_path}: {e}")

    return {"status": "success", "message": "Settings updated successfully"}

@router.get("/reports", response_model=ReportListResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def list_reports():
    """
    List all generated postmortem reports.
    """
    from app.db.database import get_db
    db = get_db()
    reports = await db.reports.find().sort("created_at", -1).to_list(length=None)
    for r in reports:
        r["_id"] = str(r["_id"])
    return {"reports": reports}


@router.post("/gemini/validate", response_model=ValidationDetailResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def validate_gemini(data: Optional[ValidateGeminiRequest] = None):
    """
    Test the Gemini API connection with the provided or current configuration.
    """
    from app.services.gemini_service import GeminiService
    gemini = GeminiService()
    # model_dump handles converting Pydantic back to dict if needed by underlying service
    req_data = data.model_dump(exclude_unset=True) if data else None
    result = await gemini.validate_connection(req_data)
    return result

@router.post("/gitlab/validate", response_model=ValidationDetailResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def validate_gitlab(data: Optional[ValidateGitlabRequest] = None):
    """
    Test the GitLab API connection with the provided or current configuration.
    """
    from app.services.gitlab_service import GitLabService
    gitlab_service = GitLabService()
    req_data = data.model_dump(exclude_unset=True) if data else None
    result = await gitlab_service.validate_connection(req_data)
    return result

@router.post("/incidents/ingest", response_model=IncidentIngestResponse, dependencies=[Depends(rate_limit(60))])
@router.post("/v1/incidents/ingest", response_model=IncidentIngestResponse, dependencies=[Depends(rate_limit(60))])
async def ingest_incident(incident_data: IncidentIngestRequest):
    """
    Ingest an incident reported by an external Kubi Agent.
    """
    from app.db.database import get_db
    from datetime import datetime, timezone
    
    db = get_db()
    
    incident_dict = incident_data.model_dump(exclude_unset=True)
    if "status" not in incident_dict or not incident_dict["status"]:
        incident_dict["status"] = "active"
    
    # Check if incident already exists to avoid duplicates
    existing = await db.incidents.find_one({
        "pod_name": incident_dict.get("pod_name"),
        "cluster_id": incident_dict.get("cluster_id"),
        "status": "active"
    })
    
    if existing:
        return {"status": "ignored", "message": "Incident already exists"}
        
    incident_dict["created_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    
    # Generate an incident plan asynchronously or save it
    # Currently we just insert to DB. The dashboard or background task will pick it up
    result = await db.incidents.insert_one(incident_dict)
    
    # Index incident into Elasticsearch for search and historical retrieval
    try:
        from app.services.incident_indexing import store_incident
        # Add incident_id field for ES document
        incident_doc = dict(incident_dict)
        incident_doc["incident_id"] = str(result.inserted_id)
        store_incident(incident_doc)
    except Exception as e:
        # Log but do not fail ingestion
        import logging
        from app.core.logging_sanitizer import sanitize_log
        logging.getLogger(__name__).warning(f"Failed to index incident in Elasticsearch: {sanitize_log(e)}")
    
    # If auto-remediation is enabled, we could potentially trigger RemediationWorkflow here,
    # but since the cluster is remote, we just store it for the dashboard to manage.
    return {"status": "success", "id": str(result.inserted_id)}

@router.post("/clusters/validate", response_model=StatusResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def validate_cluster(data: ValidateClusterRequest):
    """
    Test the Kubernetes connection for a specific agent URL or direct credentials.
    """
    data_dict = data.model_dump(exclude_unset=True)
    auth_type = data_dict.get("auth_type", "agent")
    
    if auth_type in ["direct", "kubeconfig"]:
        try:
            service = KubernetesService(cluster_config=data_dict)
            stats = service.get_cluster_stats()
            if stats and (stats.get("nodes", {}).get("total", 0) > 0 or stats.get("namespaces", 0) > 0):
                return {"status": "success", "message": "Successfully connected to Kubernetes API Server directly!"}
            else:
                return {"status": "error", "message": "Connected but returned 0 nodes or namespaces. Check your permissions."}
        except Exception as e:
            return {"status": "error", "message": f"Failed to connect: {str(e)}"}

    agent_url = data_dict.get("agent_url")
    if not agent_url:
        return {"status": "error", "message": "Agent URL is required"}
    
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Query stats or resources to check connectivity
            response = await client.get(f"{agent_url}/stats")
            if response.status_code == 200:
                return {"status": "success", "message": "Successfully connected to Kubernetes agent!"}
            
            # Fallback
            response2 = await client.get(agent_url)
            if response2.status_code < 500:
                return {"status": "success", "message": "Successfully connected to Kubernetes agent!"}
    except Exception as e:
        return {"status": "error", "message": f"Failed to connect to agent: {str(e)}"}
    return {"status": "error", "message": "Agent returned unhealthy status."}

@router.post(
    "/actions/manual",
    response_model=StatusResponse,
    dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))],
    responses={400: {"description": "Failed to execute manual action on Kubernetes agent"}}
)
async def execute_manual_action(request: ManualActionRequest, x_cluster_id: Optional[str] = Header(None)):
    """
    Executes a manual action (restart_pod, restart_deployment, rollback_deployment) on a cluster.
    """
    from app.services.action_engine import ActionEngine
    from app.services.gemini_service import RemediationAction
    
    cluster_id = request.cluster_id or x_cluster_id
    agent_url = None
    cluster_config = None
    
    if cluster_id:
        from app.db.database import get_db
        db = get_db()
        settings = await db.settings.find_one({"id": "system_config"})
        if settings and "clusters" in settings:
            for cluster in settings["clusters"]:
                if cluster.get("id") == cluster_id:
                    agent_url = cluster.get("agent_url")
                    cluster_config = cluster
                    break
                    
    action_engine = ActionEngine(agent_url=agent_url, cluster_config=cluster_config)
    
    action = RemediationAction(
        action_type=request.action_type,
        target_name=request.target_name,
        namespace=request.namespace,
        reason=request.reason or "Manual user intervention"
    )
    
    success, message = await action_engine.execute_action(action)
    
    if success:
        return {"status": "success", "message": message}
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=message)
@router.post("/remediations/manual", response_model=PlanResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def create_manual_remediation(request: ManualRemediationRequest, x_cluster_id: Optional[str] = Header(None)):
    """
    Create a manual remediation plan.
    """
    from app.services.gemini_service import RemediationPlan
    plan = RemediationPlan(actions=request.actions, summary=request.summary or "Manual remediation plan")
    plan_id = await remediation_workflow.store_plan(plan)
    return {
        "plan_id": plan_id,
        "status": "pending_manual",
        "plan": plan.model_dump(),
        "generated_by": "manual",
    }

# ─────────────────────────────────────────────────────────────
# Elasticsearch Routes
# ─────────────────────────────────────────────────────────────

@router.get("/es/health", response_model=ESHealthResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def elasticsearch_health():
    """
    Returns Elasticsearch cluster health, index list, and document counts.
    Safe to call regardless of whether ES is available.
    """
    from app.services.elasticsearch_service import get_es_health
    return get_es_health()


@router.post("/es/validate", response_model=ValidationDetailResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def elasticsearch_validate(data: Optional[ESValidateRequest] = None):
    """
    Test the Elasticsearch connection.
    Accepts optional {host, username, password} to test a custom endpoint.
    Falls back to the currently configured ELASTICSEARCH_HOST.
    """
    from app.services.elasticsearch_service import reset_es_client, get_es_health
    from app.core.config import settings
    import os

    req_data = data.model_dump(exclude_unset=True) if data else None

    # Override env vars temporarily if custom host provided
    if req_data and req_data.get("host"):
        os.environ["ELASTICSEARCH_HOST"] = req_data["host"]
        if req_data.get("username"):
            os.environ["ELASTICSEARCH_USERNAME"] = req_data["username"]
        if req_data.get("password"):
            os.environ["ELASTICSEARCH_PASSWORD"] = req_data["password"]
        # Reload settings and reset cached client
        settings.__init__()
        reset_es_client()

    health = get_es_health()
    if health.get("status") in ("green", "yellow"):
        return {"status": "success", "message": f"Connected to Elasticsearch — cluster status: {health['status']}", "detail": health}
    return {"status": "error", "message": f"Elasticsearch unreachable at {health.get('host')}", "detail": health}


@router.get("/search", response_model=SearchResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def search_incidents_fulltext(
    q: str,
    index: Optional[str] = None,
    size: int = 20,
    x_cluster_id: Optional[str] = Header(None),
):
    """
    Full-text search across incidents, RCA reports, and pod logs in Elasticsearch.

    Query params:
    - q: search query string (required)
    - index: 'incidents' | 'logs' | 'rca' | 'events' | 'remediation' (default: incidents)
    - size: number of results (default 20, max 100)
    - x-cluster-id header: optional cluster scope filter
    """
    from app.services.elasticsearch_service import search_documents, is_available
    from app.core.config import settings as cfg

    if not is_available():
        return {
            "status": "unavailable",
            "message": "Elasticsearch is not available. Results are stored in MongoDB only.",
            "results": [],
            "total": 0,
        }

    size = min(size, 100)

    index_map = {
        "incidents": cfg.ELASTICSEARCH_INDEX,
        "logs": cfg.ELASTICSEARCH_INDEX_LOGS,
        "rca": cfg.ELASTICSEARCH_INDEX_RCA,
        "events": cfg.ELASTICSEARCH_INDEX_EVENTS,
        "remediation": cfg.ELASTICSEARCH_INDEX_REMEDIATION,
    }
    target_index = index_map.get(index or "incidents", cfg.ELASTICSEARCH_INDEX)

    # Build query with optional cluster filter
    multi_match = {
        "multi_match": {
            "query": q,
            "fields": ["title^3", "root_cause^2", "logs^1.5", "events", "description", "message"],
            "fuzziness": "AUTO",
            "type": "best_fields",
        }
    }

    if x_cluster_id:
        query = {
            "bool": {
                "must": [multi_match],
                "filter": [{"term": {"cluster_id": x_cluster_id}}],
            }
        }
    else:
        query = multi_match

    results, total = search_documents(target_index, query, size=size)
    return {
        "status": "success",
        "query": q,
        "index": target_index,
        "total": total,
        "results": results,
    }
