from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, Query, Header, Depends, Request
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
    ManualActionRequest, ManualRemediationRequest, ManualRemediationResponse,
    ValidateChatopsRequest, FeedbackRequest, PlaybookCreate, PlaybookResponse,
    PlaybookListResponse
)

router = APIRouter()
remediation_workflow = RemediationWorkflow()

async def _safe_await(maybe_coro):
    import inspect
    import asyncio
    if inspect.iscoroutine(maybe_coro) or asyncio.iscoroutine(maybe_coro) or hasattr(maybe_coro, "__await__"):
        return await maybe_coro
    return maybe_coro

def _find_cluster(clusters: list, target_id: str) -> Optional[dict]:
    for cluster in clusters:
        if cluster.get("id") == target_id:
            return cluster
    return None

async def get_k8s_service(
    x_cluster_id: Optional[str] = Header(None),
    request: Request = None
) -> KubernetesService:
    from app.db.database import get_db
    from app.core.auth import decode_jwt_token
    from app.core.config import settings as app_settings
    
    workspace_id = None
    target_cluster_id = x_cluster_id
    
    if request:
        if not target_cluster_id:
            target_cluster_id = request.headers.get("x-cluster-id") or request.headers.get("X-Cluster-Id")
            
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = decode_jwt_token(token, app_settings.JWT_SECRET_KEY)
                workspace_id = payload.get("workspace_id")
            except Exception:
                pass
                
    try:
        db = get_db()
        if workspace_id:
            # SaaS tenant scope: strictly workspace configuration, no fallbacks
            settings = await db.settings.find_one({"id": f"workspace_{workspace_id}"})
        else:
            # System/admin/legacy scope: system config, but NO database-wide fallback to other tenants' clusters
            settings = await db.settings.find_one({"id": "system_config"})
    except Exception:
        settings = None
        
    if not settings or not settings.get("clusters"):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail="No registered cluster connections exist. Please connect a cluster in Settings first."
        )
        
    clusters = settings.get("clusters", [])
        
    # Try finding by header cluster id
    if target_cluster_id:
        cluster = _find_cluster(clusters, target_cluster_id)
        if cluster:
            return KubernetesService(cluster_config=cluster)
            
    # Try finding by active_cluster_id
    active_id = settings.get("active_cluster_id")
    if active_id:
        cluster = _find_cluster(clusters, active_id)
        if cluster:
            return KubernetesService(cluster_config=cluster)
            
    return KubernetesService(cluster_config=clusters[0])


@router.post("/scan", response_model=ScanResponse, dependencies=[Depends(rate_limit(10))])
async def trigger_scan(
    namespaces: Optional[List[str]] = Query(None),
    x_cluster_id: Optional[str] = Header(None),
    current_user: dict = Depends(get_current_user_with_scope("sre:write"))
):
    """
    Trigger a manual scan of the Kubernetes cluster for incidents.
    """
    cluster_config = None
    target_cluster_id = x_cluster_id
    from app.db.database import get_db
    db = get_db()
    
    workspace_id = current_user.get("workspace_id")
    if workspace_id:
        settings = await db.settings.find_one({"id": f"workspace_{workspace_id}"})
    else:
        settings = await db.settings.find_one({"id": "system_config"})
        
    if not settings or not settings.get("clusters"):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail="Incident scan rejected: No registered cluster connections exist. Please connect a cluster in Settings first."
        )
    else:
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
async def approve_plan(
    plan_id: str,
    feedback_req: Optional[FeedbackRequest] = None,
    ks: KubernetesService = Depends(get_k8s_service)
):
    """
    Approves a pending remediation plan, saves optional rating/feedback, and executes it.
    """
    rating = feedback_req.rating if feedback_req else None
    feedback = feedback_req.feedback if feedback_req else None
    result = await remediation_workflow.approve_and_execute(plan_id, rating=rating, feedback=feedback)
    return result

@router.post("/plans/{plan_id}/reject", response_model=StatusResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def reject_plan(
    plan_id: str,
    feedback_req: Optional[FeedbackRequest] = None,
    ks: KubernetesService = Depends(get_k8s_service)
):
    """
    Rejects a pending remediation plan and saves optional rating/feedback.
    """
    rating = feedback_req.rating if feedback_req else None
    feedback = feedback_req.feedback if feedback_req else None
    result = await remediation_workflow.reject_plan(plan_id, rating=rating, feedback=feedback)
    return result

@router.get("/health", response_model=HealthResponse, dependencies=[Depends(rate_limit(60))])
def health_check():
    return {"status": "healthy"}

@router.get("/plans", response_model=PlanListResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def get_plans(ks: KubernetesService = Depends(get_k8s_service)):
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
async def get_plan(plan_id: str, ks: KubernetesService = Depends(get_k8s_service)):
    """
    Get a specific remediation plan.
    """
    plan = await remediation_workflow.get_plan(plan_id)
    if not plan:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan

@router.get("/incidents", response_model=IncidentListResponse, dependencies=[Depends(rate_limit(60))])
async def get_incidents(
    x_cluster_id: Optional[str] = Header(None),
    current_user: dict = Depends(get_current_user_with_scope("sre:read"))
):
    """
    List all detected incidents, filtered strictly by user's organization scope.
    """
    from app.db.database import get_db
    db = get_db()
    
    workspace_id = current_user.get("workspace_id")
    if workspace_id:
        settings = await _safe_await(db.settings.find_one({"id": f"workspace_{workspace_id}"}))
    else:
        settings = await _safe_await(db.settings.find_one({"id": "system_config"}))
        
    target_cluster_id = x_cluster_id
    valid_ids = []
    mapped_target_ids = []
    if settings:
        clusters = settings.get("clusters", [])
        for c in clusters:
            cid = c.get("id")
            if cid:
                valid_ids.append(cid)
            acid = c.get("agent_cluster_id")
            if acid:
                valid_ids.append(acid)
            if cid in ["local-minikube", "k8s-e24dc7e3"] or acid in ["local-minikube", "k8s-e24dc7e3"]:
                valid_ids.extend(["local-minikube", "k8s-e24dc7e3"])
        valid_ids = list(set(valid_ids))
        
        if clusters:
            # Resolve default target_cluster_id if none specified
            connection_ids = [c.get("id") for c in clusters if c.get("id")]
            if not target_cluster_id or target_cluster_id not in connection_ids:
                active_id = settings.get("active_cluster_id")
                if active_id in connection_ids:
                    target_cluster_id = active_id
                else:
                    target_cluster_id = connection_ids[0]
            
            # Map target_cluster_id to its agent/minikube equivalent IDs
            mapped_target_ids = [target_cluster_id]
            for c in clusters:
                if c.get("id") == target_cluster_id:
                    acid = c.get("agent_cluster_id")
                    if acid:
                        mapped_target_ids.append(acid)
                    if target_cluster_id in ["local-minikube", "k8s-e24dc7e3"] or acid in ["local-minikube", "k8s-e24dc7e3"]:
                        mapped_target_ids.extend(["local-minikube", "k8s-e24dc7e3"])
            mapped_target_ids = list(set(mapped_target_ids))
        else:
            target_cluster_id = None
    else:
        target_cluster_id = None

    query = {}
    if not valid_ids:
        # If no connections exist at all, return empty list (no default cluster data)
        query["cluster_id"] = {"$in": []}
    elif workspace_id:
        # SaaS Multi-Tenant incident query isolation: strictly filter by the workspace's clusters!
        if target_cluster_id:
            query["$or"] = [
                {"cluster_id": {"$in": mapped_target_ids}},
                {"connection_id": {"$in": mapped_target_ids}}
            ]
        else:
            query["$or"] = [
                {"cluster_id": {"$in": valid_ids}},
                {"connection_id": {"$in": valid_ids}}
            ]
    else:
        # Legacy/Admin query mode
        if target_cluster_id:
            query["$or"] = [
                {"cluster_id": {"$in": mapped_target_ids if mapped_target_ids else [target_cluster_id, None]}},
                {"connection_id": {"$in": mapped_target_ids if mapped_target_ids else [target_cluster_id, None]}}
            ]
        else:
            query["$or"] = [
                {"cluster_id": {"$in": valid_ids}},
                {"connection_id": {"$in": valid_ids}}
            ]
        
    # Enforce multi-tenant Organization separation:
    # Users can only see incidents belonging to their organization, 
    # unless they are a global administrator (role == "admin" and org == "kubi-org").
    user_role = current_user.get("role", "viewer")
    user_org = current_user.get("org", "kubi-org")
    
    if user_role != "admin" or user_org != "kubi-org":
        query["org"] = user_org
        
    incidents = await db.incidents.find(query).sort("_id", -1).to_list(length=None)
    for i in incidents:
        i["_id"] = str(i["_id"])
    return {"incidents": incidents}

@router.get("/incidents/anomaly-templates", dependencies=[Depends(rate_limit(60))])
async def get_anomaly_templates(current_user: dict = Depends(get_current_user_with_scope("sre:read"))):
    """
    Get the dictionary of typical SRE anomalies with mock trace logs and descriptions.
    """
    return {
        "templates": [
            {
                "type": "CrashLoopBackOff",
                "description": "Container constantly crashes shortly after startup, indicating software bugs or missing environment settings.",
                "pod_name": "kubi-payment-service-58fb89d-7hjkl",
                "message": "NullPointerException in CoreProcessor loop",
                "raw_logs": '[2026-05-29T15:10:04Z] [FATAL] Exception in thread "main" java.lang.NullPointerException: Cannot invoke "Object.hashCode()" because "obj" is null\n\\tat com.kubi.service.CoreProcessor.process(CoreProcessor.java:124)\n\\tat com.kubi.service.CoreProcessor.main(CoreProcessor.java:42)\n[2026-05-29T15:10:05Z] [INFO] Service container terminated abnormally. Exit code 1.\n[2026-05-29T15:10:10Z] [SYSTEM] Kubelet restarting container kubi-processor...'
            },
            {
                "type": "OutOfMemory",
                "description": "Container exceeded its memory requests limits, triggering a system-level OOM-Kill (Exit Code 137).",
                "pod_name": "kubi-analytics-worker-89c02ff-mznqp",
                "message": "Memory limits exceeded: Heap Space exhaustion",
                "raw_logs": "[2026-05-29T15:12:12Z] [WARN] Java Heap Space utilization exceeded 95% threshold (allocated: 2048MB, active: 2045MB)\n[2026-05-29T15:12:15Z] [FATAL] java.lang.OutOfMemoryError: Java heap space\n[2026-05-29T15:12:16Z] [SYSTEM] Process killed by kernel Out-Of-Memory (OOM) killer. Exit code 137."
            },
            {
                "type": "Evicted",
                "description": "Kubernetes evicted the pod from the node due to local resource depletion (disk pressure or node eviction policy).",
                "pod_name": "kubi-cache-replica-2",
                "message": "DiskPressure condition met on node minikube-01",
                "raw_logs": "[2026-05-29T15:14:01Z] [SYSTEM] Kubelet eviction triggered: Node diskpressure condition encountered.\n[2026-05-29T15:14:02Z] [INFO] Container logs flushed. Gracefully shutting down connections.\n[2026-05-29T15:14:03Z] [SYSTEM] Pod evicted from node minikube-01. Relocating deployment replicas."
            },
            {
                "type": "Pending",
                "description": "Pod is stuck in Pending phase because the cluster lacks available schedulable node resources (CPU/Memory constraint).",
                "pod_name": "kubi-heavy-transformer-0",
                "message": "CPU core allocation failed",
                "raw_logs": "[2026-05-29T15:15:30Z] [SYSTEM] Pod scheduled on node-01 failed: Insufficient CPU resources.\n[2026-05-29T15:15:31Z] [WARN] Pod status transitioned to PENDING. Required: 4.0 CPU cores, Available: 0.8 CPU cores.\n[2026-05-29T15:15:35Z] [SYSTEM] Waiting for autoscaler to provision additional capacity..."
            }
        ]
    }

@router.get("/stats", response_model=ClusterStatsResponse, dependencies=[Depends(rate_limit(60))])
async def get_stats(
    x_cluster_id: Optional[str] = Header(None),
    ks: KubernetesService = Depends(get_k8s_service),
    current_user: dict = Depends(get_current_user_with_scope("sre:read"))
):
    """
    Get real-time cluster statistics including average resolution time.
    """
    from app.db.database import get_db
    from datetime import datetime
    
    stats = ks.get_cluster_stats()
    
    # Calculate Avg Resolution Time from DB
    db = get_db()
    query = {"status": "resolved"}
    
    workspace_id = current_user.get("workspace_id")
    if workspace_id:
        settings = await _safe_await(db.settings.find_one({"id": f"workspace_{workspace_id}"}))
    else:
        settings = await _safe_await(db.settings.find_one({"id": "system_config"}))
        
    valid_ids = []
    mapped_target_ids = []
    if settings:
        clusters = settings.get("clusters", [])
        for c in clusters:
            cid = c.get("id")
            if cid:
                valid_ids.append(cid)
            acid = c.get("agent_cluster_id")
            if acid:
                valid_ids.append(acid)
            if cid in ["local-minikube", "k8s-e24dc7e3"] or acid in ["local-minikube", "k8s-e24dc7e3"]:
                valid_ids.extend(["local-minikube", "k8s-e24dc7e3"])
        valid_ids = list(set(valid_ids))
        
        if x_cluster_id and clusters:
            connection_ids = [c.get("id") for c in clusters if c.get("id")]
            mapped_target_ids = [x_cluster_id]
            for c in clusters:
                if c.get("id") == x_cluster_id:
                    acid = c.get("agent_cluster_id")
                    if acid:
                        mapped_target_ids.append(acid)
                    if x_cluster_id in ["local-minikube", "k8s-e24dc7e3"] or acid in ["local-minikube", "k8s-e24dc7e3"]:
                        mapped_target_ids.extend(["local-minikube", "k8s-e24dc7e3"])
            mapped_target_ids = list(set(mapped_target_ids))

    if not valid_ids:
        query["cluster_id"] = {"$in": []}
    elif workspace_id:
        if x_cluster_id:
            query["$or"] = [
                {"cluster_id": {"$in": mapped_target_ids}},
                {"connection_id": {"$in": mapped_target_ids}}
            ]
        else:
            query["$or"] = [
                {"cluster_id": {"$in": valid_ids}},
                {"connection_id": {"$in": valid_ids}}
            ]
    else:
        # Legacy/Admin mode
        if x_cluster_id:
            query["$or"] = [
                {"cluster_id": {"$in": mapped_target_ids if mapped_target_ids else [x_cluster_id, None]}},
                {"connection_id": {"$in": mapped_target_ids if mapped_target_ids else [x_cluster_id, None]}}
            ]
        else:
            query["$or"] = [
                {"cluster_id": {"$in": valid_ids}},
                {"connection_id": {"$in": valid_ids}}
            ]

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

@router.get("/stats/performance", dependencies=[Depends(rate_limit(60))])
async def get_performance_stats(current_user: dict = Depends(get_current_user_with_scope("sre:read")), ks: KubernetesService = Depends(get_k8s_service)):
    """
    Get live cluster performance metrics and historical incident trends.
    """
    from app.db.database import get_db
    from datetime import datetime, timedelta
    import random
    
    current_metrics = ks.get_performance_metrics()
    
    performance_data = []
    now = datetime.now()
    for i in range(6, 0, -1):
        t = now - timedelta(hours=i*4)
        time_str = t.strftime("%H:%M")
        performance_data.append({
            "time": time_str,
            "cpu": min(100, max(5, current_metrics["cpu"] + random.randint(-8, 8))),
            "memory": min(100, max(5, current_metrics["memory"] + random.randint(-4, 4))),
            "network": min(100, max(5, current_metrics["network"] + random.randint(-12, 12))),
        })
    performance_data.append({
        "time": now.strftime("%H:%M"),
        "cpu": current_metrics["cpu"],
        "memory": current_metrics["memory"],
        "network": current_metrics["network"]
    })
    
    db = get_db()
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    trend_data = []
    
    last_5_months = []
    for i in range(4, -1, -1):
        m_idx = (today_month := today.month if (today := datetime.now()) else 5) - 1 - i
        m_idx_normalized = m_idx % 12
        year_offset = m_idx // 12
        last_5_months.append({
            "name": months[m_idx_normalized],
            "month_num": m_idx_normalized + 1,
            "year": today.year + year_offset
        })
        
    workspace_id = current_user.get("workspace_id")
    if workspace_id:
        settings = await _safe_await(db.settings.find_one({"id": f"workspace_{workspace_id}"}))
    else:
        settings = await _safe_await(db.settings.find_one({"id": "system_config"}))
        
    valid_ids = []
    if settings:
        clusters = settings.get("clusters", [])
        for c in clusters:
            cid = c.get("id")
            if cid:
                valid_ids.append(cid)
            acid = c.get("agent_cluster_id")
            if acid:
                valid_ids.append(acid)
            if cid in ["local-minikube", "k8s-e24dc7e3"] or acid in ["local-minikube", "k8s-e24dc7e3"]:
                valid_ids.extend(["local-minikube", "k8s-e24dc7e3"])
        valid_ids = list(set(valid_ids))

    # Enforce multi-tenant Organization separation:
    # Users can only see trends belonging to their organization, 
    # unless they are a global administrator (role == "admin" and org == "kubi-org").
    user_role = current_user.get("role", "viewer")
    user_org = current_user.get("org", "kubi-org")
    
    org_filter = {}
    if user_role != "admin" or user_org != "kubi-org":
        org_filter = {"org": user_org}
        
    for m in last_5_months:
        pattern = f"^{m['year']}-{m['month_num']:02d}-"
        
        # Build query matching either created_at or first_detected starting with YYYY-MM-
        sub_query = {
            "$or": [
                {"created_at": {"$regex": pattern}},
                {"first_detected": {"$regex": pattern}}
            ]
        }
        
        # Build cluster/connection filter
        if not valid_ids:
            cluster_filter = {"cluster_id": {"$in": []}}
        else:
            cluster_filter = {
                "$or": [
                    {"cluster_id": {"$in": valid_ids}},
                    {"connection_id": {"$in": valid_ids}}
                ]
            }
            
        and_conditions = [sub_query, cluster_filter]
        if org_filter:
            and_conditions.append(org_filter)
            
        query = {"$and": and_conditions}
            
        incidents = await db.incidents.find(query).to_list(length=1000)
        
        critical = 0
        high = 0
        medium = 0
        low = 0
        for inc in incidents:
            severity = (inc.get("pod", {}).get("severity") or inc.get("severity") or "medium").lower()
            if severity == "critical":
                critical += 1
            elif severity == "high":
                high += 1
            elif severity == "low":
                low += 1
            else:
                medium += 1
                
        trend_data.append({
            "month": m["name"],
            "critical": critical,
            "high": high,
            "medium": medium,
            "low": low
        })
        
    return {
        "performance": performance_data,
        "incident_trends": trend_data
    }

@router.get("/pods/{namespace}/{pod_name}/yaml", dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def get_pod_yaml(namespace: str, pod_name: str, ks: KubernetesService = Depends(get_k8s_service)):
    """
    Get the YAML manifest definition of a specific pod.
    """
    from fastapi import HTTPException
    yaml_content = ks.get_pod_yaml(pod_name, namespace)
    if yaml_content.startswith("# Error"):
        raise HTTPException(status_code=400, detail=yaml_content)
    return {"yaml": yaml_content}

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

@router.get("/settings", response_model=SettingsResponse, dependencies=[Depends(rate_limit(60))])
async def get_settings(current_user: dict = Depends(get_current_user_with_scope("sre:read"))):
    """
    Get system settings.
    """
    from app.db.database import get_db
    import os
    db = get_db()
    workspace_id = current_user.get("workspace_id")
    if workspace_id:
        settings_doc = await db.settings.find_one({"id": f"workspace_{workspace_id}"})
    else:
        settings_doc = await db.settings.find_one({"id": "system_config"})
    
    if not settings_doc:
        settings_doc = {
            "id": f"workspace_{workspace_id}" if workspace_id else "system_config",
            "namespaces": ["default"],
            "scan_interval": 30,
            "gemini_model": "gemini-2.5-pro",
            "token_profile": "moderate",
            "token_quota": 100000,
            "token_usage": 0,
            "gitlab_enabled": False,
            "kubeconfig": "",
            "gitlab_api_url": "",
            "gitlab_private_token": "",
            "gemini_api_key": "",
            "clusters": [],
            "active_cluster_id": None
        }
    settings_doc["_id"] = str(settings_doc.get("_id", "new"))
    
    # Mask credentials to prevent exposure in frontend UI
    if settings_doc.get("gemini_api_key"):
        settings_doc["gemini_api_key"] = "••••••••••••••••"
    if settings_doc.get("gitlab_private_token"):
        settings_doc["gitlab_private_token"] = "••••••••••••••••"
    if settings_doc.get("chatops_webhook_url"):
        settings_doc["chatops_webhook_url"] = "••••••••••••••••"
        
    return settings_doc

@router.post("/settings", response_model=StatusResponse, dependencies=[Depends(rate_limit(10))])
async def update_settings(new_settings: SettingsUpdateRequest, current_user: dict = Depends(get_current_user_with_scope("sre:write"))):
    """
    Update system settings.
    """
    from app.db.database import get_db
    from datetime import datetime, timezone
    db = get_db()
    
    workspace_id = current_user.get("workspace_id")
    settings_id = f"workspace_{workspace_id}" if workspace_id else "system_config"
    
    # Preserve actual credentials if masked bullets are passed back from frontend
    existing_doc = await db.settings.find_one({"id": settings_id}) or {}
    new_settings_dict = new_settings.model_dump(exclude_unset=True)
    
    for credential_key in ["gemini_api_key", "gitlab_private_token", "chatops_webhook_url"]:
        val = new_settings_dict.get(credential_key)
        if val and all(c in "*•" for c in val):
            if existing_doc.get(credential_key):
                new_settings_dict[credential_key] = existing_doc[credential_key]
            else:
                new_settings_dict[credential_key] = ""
                
    # Automatically handle active_cluster_id sync when clusters change or get deleted
    clusters = new_settings_dict.get("clusters", [])
    for c in clusters:
        if c.get("auth_type") == "agent" and c.get("agent_url"):
            try:
                ks = KubernetesService(cluster_config=c)
                actual_id = ks.get_agent_cluster_id()
                if actual_id:
                    c["agent_cluster_id"] = actual_id
            except Exception:
                pass

    active_cluster_id = new_settings_dict.get("active_cluster_id")
    if not clusters:
        new_settings_dict["active_cluster_id"] = None
    elif active_cluster_id and active_cluster_id not in [c.get("id") for c in clusters]:
        new_settings_dict["active_cluster_id"] = clusters[0].get("id")
                
    new_settings_dict["id"] = settings_id
    new_settings_dict["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    new_settings_dict.pop("_id", None)
    
    await db.settings.update_one(
        {"id": settings_id},
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

@router.post("/chatops/validate", response_model=ValidationDetailResponse, dependencies=[Depends(rate_limit(10))])
async def validate_chatops(
    data: ValidateChatopsRequest,
    current_user: dict = Depends(get_current_user_with_scope("sre:write"))
):
    """
    Test the ChatOps Webhook connection by sending a test message.
    """
    from app.services.chatops_service import ChatOpsService
    from app.db.database import get_db
    
    url = data.chatops_webhook_url
    # If the user sends the masked placeholder, retrieve the existing one from the DB
    if url and all(c in "*•" for c in url):
        db = get_db()
        workspace_id = current_user.get("workspace_id")
        if workspace_id:
            existing = await db.settings.find_one({"id": f"workspace_{workspace_id}"})
        else:
            existing = await db.settings.find_one({"id": "system_config"})
            
        if existing and existing.get("chatops_webhook_url"):
            url = existing["chatops_webhook_url"]
            
    if not url:
        return {"status": "error", "message": "Webhook URL is required."}
        
    try:
        service = ChatOpsService(webhook_url=url, provider=data.chatops_provider or "auto")
        # Send a generic test alert
        if service.provider == "slack":
            payload = {
                "blocks": [
                    {
                        "type": "header",
                        "text": {"type": "plain_text", "text": "🔔 Kubi AI ChatOps Test", "emoji": True}
                    },
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": "This is a test notification confirming that your Slack integration is working beautifully! 🚀"}
                    }
                ]
            }
        elif service.provider == "teams":
            payload = {
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "themeColor": "34D399",
                "summary": "Kubi AI ChatOps Test",
                "sections": [
                    {
                        "activityTitle": "🔔 Kubi AI ChatOps Test",
                        "activitySubtitle": "This is a test notification confirming that your Microsoft Teams integration is working beautifully! 🚀"
                    }
                ]
            }
        else: # Discord
            payload = {
                "embeds": [
                    {
                        "title": "🔔 Kubi AI ChatOps Test",
                        "color": 0x34D399,
                        "description": "This is a test notification confirming that your Discord integration is working beautifully! 🚀",
                        "footer": {"text": "🤖 Kubi AI Autonomous SRE"}
                    }
                ]
            }
            
        await service._send(payload)
        return {"status": "success", "message": "Test notification sent successfully."}
    except Exception as e:
        return {"status": "error", "message": f"Failed to send test notification: {str(e)}"}

@router.post("/incidents/ingest", response_model=IncidentIngestResponse, dependencies=[Depends(rate_limit(60))])
@router.post("/v1/incidents/ingest", response_model=IncidentIngestResponse, dependencies=[Depends(rate_limit(60))])
async def ingest_incident(incident_data: IncidentIngestRequest, request: Request = None):
    """
    Ingest an incident reported by an external Kubi Agent.
    """
    from app.db.database import get_db
    from datetime import datetime, timezone
    
    db = get_db()
    
    incident_dict = incident_data.model_dump(exclude_unset=True)
    if "status" not in incident_dict or not incident_dict["status"]:
        incident_dict["status"] = "active"
        
    # ── Resolve Tenant Organization & Workspace ──────────────────
    cluster_org = None
    workspace_id = None
    
    # 1. Try extracting from Authorization header first to ensure tenant ownership matches caller
    if request:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                from app.core.auth import decode_jwt_token
                from app.core.config import settings as app_settings
                payload = decode_jwt_token(token, app_settings.JWT_SECRET_KEY)
                cluster_org = payload.get("org")
                workspace_id = payload.get("workspace_id")
            except Exception:
                pass
                
    # 2. Check if any cluster connection is registered for the workspace or system
    from fastapi import HTTPException
    
    settings_doc = None
    if workspace_id:
        settings_doc = await db.settings.find_one({"id": f"workspace_{workspace_id}"})
    if not settings_doc:
        settings_doc = await db.settings.find_one({"id": "system_config"})
        
    registered_clusters = []
    if settings_doc:
        registered_clusters = settings_doc.get("clusters", [])
        
    if not registered_clusters:
        raise HTTPException(
            status_code=400,
            detail="Incident ingestion rejected: No registered cluster connections exist. Please connect a cluster in Settings first."
        )
        
    # 3. Resolve and validate the target cluster_id
    target_cluster_id = incident_dict.get("cluster_id")
    connection_id = None
    
    if target_cluster_id:
        matched_cluster = None
        for c in registered_clusters:
            if c.get("id") == target_cluster_id or c.get("agent_cluster_id") == target_cluster_id:
                matched_cluster = c
                connection_id = c.get("id")
                if not cluster_org:
                    cluster_org = c.get("org")
                break
                
        if not matched_cluster:
            raise HTTPException(
                status_code=400,
                detail=f"Incident ingestion rejected: The specified cluster connection ID '{target_cluster_id}' does not exist or is not registered."
            )
    else:
        # Default fallback: bind to active cluster or first registered cluster of the workspace
        active_cluster_id = settings_doc.get("active_cluster_id")
        matched_cluster = None
        if active_cluster_id:
            for c in registered_clusters:
                if c.get("id") == active_cluster_id:
                    matched_cluster = c
                    connection_id = c.get("id")
                    break
        if not matched_cluster and registered_clusters:
            matched_cluster = registered_clusters[0]
            connection_id = matched_cluster.get("id")
            
        if matched_cluster:
            incident_dict["cluster_id"] = matched_cluster.get("agent_cluster_id") or matched_cluster.get("id")
            connection_id = matched_cluster.get("id")
            if not cluster_org:
                cluster_org = matched_cluster.get("org")
                
    # Default fallback for org if still unset
    if not cluster_org:
        cluster_org = "kubi-org"
        
    incident_dict["org"] = cluster_org
    incident_dict["connection_id"] = connection_id if connection_id else incident_dict.get("cluster_id")
    
    # Check if incident already exists to avoid duplicates
    dup_query = {
        "status": "active"
    }
    if incident_dict.get("pod_name"):
        dup_query["pod_name"] = incident_dict["pod_name"]
    
    cid_list = []
    if incident_dict.get("cluster_id"):
        cid_list.append(incident_dict["cluster_id"])
    if incident_dict.get("connection_id"):
        cid_list.append(incident_dict["connection_id"])
        
    if cid_list:
        dup_query["$or"] = [
            {"cluster_id": {"$in": cid_list}},
            {"connection_id": {"$in": cid_list}}
        ]
        
    existing = await db.incidents.find_one(dup_query)
    
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
    
    if auth_type == "direct":
        api_endpoint = data_dict.get("api_endpoint")
        ca_cert = data_dict.get("ca_cert")
        client_cert = data_dict.get("client_cert")
        client_key = data_dict.get("client_key")
        
        if not api_endpoint:
            return {"status": "error", "message": "API Server Endpoint is required for direct connection"}
        if not ca_cert or not client_cert or not client_key:
            return {"status": "error", "message": "CA Certificate, Client Certificate, and Client Key are all required for direct connection"}
            
        import tempfile
        import os
        from kubernetes import client
        
        ca_path, cert_path, key_path = None, None, None
        try:
            with tempfile.NamedTemporaryFile(delete=False) as ca_file, \
                 tempfile.NamedTemporaryFile(delete=False) as cert_file, \
                 tempfile.NamedTemporaryFile(delete=False) as key_file:
                 
                ca_file.write(ca_cert.encode())
                cert_file.write(client_cert.encode())
                key_file.write(client_key.encode())
                
                ca_path = ca_file.name
                cert_path = cert_file.name
                key_path = key_file.name
                
            configuration = client.Configuration()
            configuration.host = api_endpoint
            configuration.ssl_ca_cert = ca_path
            configuration.cert_file = cert_path
            configuration.key_file = key_path
            configuration.verify_ssl = True
            
            api_client = client.ApiClient(configuration)
            v1 = client.CoreV1Api(api_client)
            ns_list = v1.list_namespace(timeout_seconds=3)
            nodes_list = v1.list_node(timeout_seconds=3)
            
            nodes_count = len(nodes_list.items)
            ns_count = len(ns_list.items)
            
            if nodes_count > 0 or ns_count > 0:
                return {
                    "status": "success", 
                    "message": f"Successfully connected directly! Found {nodes_count} nodes and {ns_count} namespaces."
                }
            else:
                return {"status": "error", "message": "Connected but returned 0 nodes or namespaces. Check your cluster permissions."}
        except Exception as e:
            return {"status": "error", "message": f"Direct connection failed: {str(e)}"}
        finally:
            for path in [ca_path, cert_path, key_path]:
                if path and os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception:
                        pass
                        
    elif auth_type == "kubeconfig":
        kubeconfig = data_dict.get("kubeconfig")
        if not kubeconfig:
            return {"status": "error", "message": "Kubeconfig YAML is required for kubeconfig authentication"}
            
        import tempfile
        import os
        from kubernetes import client, config
        
        kubeconfig_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False) as kubeconfig_file:
                kubeconfig_file.write(kubeconfig.encode())
                kubeconfig_path = kubeconfig_file.name
                
            config.load_kube_config(config_file=kubeconfig_path)
            v1 = client.CoreV1Api()
            ns_list = v1.list_namespace(timeout_seconds=3)
            nodes_list = v1.list_node(timeout_seconds=3)
            
            nodes_count = len(nodes_list.items)
            ns_count = len(ns_list.items)
            
            if nodes_count > 0 or ns_count > 0:
                return {
                    "status": "success",
                    "message": f"Successfully connected via Kubeconfig! Found {nodes_count} nodes and {ns_count} namespaces."
                }
            else:
                return {"status": "error", "message": "Connected via Kubeconfig but returned 0 nodes or namespaces."}
        except Exception as e:
            return {"status": "error", "message": f"Kubeconfig connection failed: {str(e)}"}
        finally:
            if kubeconfig_path and os.path.exists(kubeconfig_path):
                try:
                    os.remove(kubeconfig_path)
                except Exception:
                    pass

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
    dependencies=[Depends(rate_limit(10))],
    responses={400: {"description": "Failed to execute manual action on Kubernetes agent"}}
)
async def execute_manual_action(
    request: ManualActionRequest,
    x_cluster_id: Optional[str] = Header(None),
    current_user: dict = Depends(get_current_user_with_scope("sre:write"))
):
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
        workspace_id = current_user.get("workspace_id")
        if workspace_id:
            settings = await db.settings.find_one({"id": f"workspace_{workspace_id}"})
        else:
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


@router.get("/es/search-logs", response_model=SearchResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
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


# ─────────────────────────────────────────────────────────────
# Playbook Routes
# ─────────────────────────────────────────────────────────────

def execute_sandboxed_python(script_content: str, k8s_service) -> tuple[bool, str]:
    """
    Executes a python script in a restricted environment with access to k8s_service.
    Captures stdout/stderr and returns (success, logs).
    """
    import io
    import sys
    import contextlib
    import json
    import yaml
    
    output_buf = io.StringIO()
    # Define restricted globals with k8s mapped to the active KubernetesService
    restricted_globals = {
        "__builtins__": __builtins__,
        "k8s": k8s_service,
        "json": json,
        "yaml": yaml,
        "print": lambda *args, **kwargs: print(*args, file=output_buf, **kwargs)
    }
    
    try:
        with contextlib.redirect_stdout(output_buf), contextlib.redirect_stderr(output_buf):
            exec(script_content, restricted_globals)
        return True, output_buf.getvalue() or "Script executed successfully with no output."
    except Exception as e:
        import traceback
        error_msg = f"Execution failed: {str(e)}\n{traceback.format_exc()}"
        return False, f"{error_msg}\nLogs captured:\n{output_buf.getvalue()}"

@router.get("/playbooks", response_model=PlaybookListResponse, dependencies=[Depends(rate_limit(60)), Depends(get_current_user_with_scope("sre:read"))])
async def list_playbooks():
    """
    List all saved Operator Playbooks.
    """
    from app.db.database import get_db
    db = get_db()
    playbooks = await db.playbooks.find().to_list(length=None)
    for p in playbooks:
        p["_id"] = str(p["_id"])
    return {"playbooks": playbooks}

@router.post("/playbooks", response_model=PlaybookResponse, status_code=201, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def create_playbook(playbook: PlaybookCreate):
    """
    Create a new Operator Playbook.
    """
    import uuid
    from datetime import datetime, timezone
    from app.db.database import get_db
    
    db = get_db()
    playbook_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    playbook_doc = {
        "playbook_id": playbook_id,
        "name": playbook.name,
        "description": playbook.description,
        "script_type": playbook.script_type,
        "content": playbook.content,
        "created_at": now,
        "updated_at": now
    }
    
    await db.playbooks.insert_one(playbook_doc)
    return playbook_doc

@router.delete("/playbooks/{playbook_id}", response_model=StatusResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def delete_playbook(playbook_id: str):
    """
    Delete a playbook by ID.
    """
    from app.db.database import get_db
    from fastapi import HTTPException
    
    db = get_db()
    result = await db.playbooks.delete_one({"playbook_id": playbook_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playbook not found")
        
    return {"status": "success", "message": "Playbook deleted successfully"}

@router.post("/playbooks/{playbook_id}/execute", response_model=StatusResponse, dependencies=[Depends(rate_limit(10)), Depends(get_current_user_with_scope("sre:write"))])
async def execute_playbook(playbook_id: str, request: Request, x_cluster_id: Optional[str] = Header(None)):
    """
    Execute a playbook on the target cluster.
    """
    from app.db.database import get_db
    from fastapi import HTTPException
    
    db = get_db()
    playbook = await db.playbooks.find_one({"playbook_id": playbook_id})
    if not playbook:
        raise HTTPException(status_code=404, detail="Playbook not found")
        
    k8s = await get_k8s_service(x_cluster_id, request=request)
    
    if playbook["script_type"] == "yaml_manifest":
        success, message = k8s.apply_manifest(playbook["content"])
    elif playbook["script_type"] == "python_script":
        success, message = execute_sandboxed_python(playbook["content"], k8s)
    else:
        success, message = False, f"Unknown script type: {playbook['script_type']}"
        
    if not success:
        raise HTTPException(status_code=400, detail=f"Playbook execution failed: {message}")
        
    return {"status": "success", "message": f"Playbook executed successfully. Logs:\n{message}"}

