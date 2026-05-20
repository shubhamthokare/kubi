from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict

# Common Response Base
class StatusResponse(BaseModel):
    status: str
    message: Optional[str] = None

# -------------------------------------------------------------
# Health Models
# -------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str

# -------------------------------------------------------------
# Incident Models
# -------------------------------------------------------------
class IncidentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    _id: Optional[str] = None
    id: Optional[str] = None
    status: Optional[str] = None
    pod: Optional[Dict[str, Any]] = None
    cluster_id: Optional[str] = None
    first_detected: Optional[str] = None
    last_seen: Optional[str] = None
    resolved_at: Optional[str] = None
    rca: Optional[str] = None
    plan_id: Optional[str] = None
    plan_summary: Optional[str] = None
    postmortem: Optional[str] = None

class IncidentListResponse(BaseModel):
    incidents: List[Dict[str, Any]]  # Allowing generic dict for flexibility if incidents vary

class IncidentIngestRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    pod_name: str
    cluster_id: Optional[str] = None
    namespace: Optional[str] = "default"
    type: Optional[str] = None
    message: Optional[str] = None
    raw_logs: Optional[str] = None
    status: Optional[str] = "active"

class IncidentIngestResponse(BaseModel):
    status: str
    message: Optional[str] = None
    id: Optional[str] = None

class IncidentReportResponse(BaseModel):
    report_md: str

class ScanResponse(BaseModel):
    status: str
    message: Optional[str] = None
    incidents: Optional[List[Dict[str, Any]]] = None

# -------------------------------------------------------------
# Plan Models
# -------------------------------------------------------------
class PlanResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    _id: Optional[str] = None
    plan_id: str
    status: str
    plan: Optional[Dict[str, Any]] = None
    generated_by: Optional[str] = "ai"

class PlanListResponse(BaseModel):
    plans: List[Dict[str, Any]]

class PlanExecutionResponse(BaseModel):
    status: str
    execution_results: Optional[List[Dict[str, Any]]] = None
    verified: Optional[bool] = None
    message: Optional[str] = None

class ManualActionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    action_type: str
    target_name: str
    namespace: str
    cluster_id: Optional[str] = None
    reason: Optional[str] = "Manual user intervention"

# -------------------------------------------------------------
# Stats and Resources Models
# -------------------------------------------------------------
class NodeStats(BaseModel):
    total: int
    ready: int

class PodStats(BaseModel):
    total: int
    running: int
    failed: int
    pending: int

class ClusterStatsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nodes: Optional[NodeStats] = None
    pods: Optional[PodStats] = None
    namespaces: Optional[int] = None
    uptime: Optional[str] = None
    avg_resolution_time: Optional[str] = None

class ClusterResourcesResponse(BaseModel):
    namespaces: List[str]
    deployments: List[Dict[str, Any]]
    pods: List[Dict[str, Any]]

# -------------------------------------------------------------
# Settings Models
# -------------------------------------------------------------
class ClusterConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    auth_type: str
    agent_url: Optional[str] = None
    api_endpoint: Optional[str] = None
    kubeconfig: Optional[str] = None
    namespace: Optional[str] = None

class SettingsBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    namespaces: Optional[List[str]] = ["default"]
    scan_interval: Optional[int] = 30
    gemini_model: Optional[str] = "gemini-2.5-pro"
    gitlab_enabled: Optional[bool] = False
    kubeconfig: Optional[str] = ""
    gitlab_api_url: Optional[str] = ""
    gitlab_private_token: Optional[str] = ""
    gemini_api_key: Optional[str] = ""
    clusters: Optional[List[ClusterConfig]] = []
    active_cluster_id: Optional[str] = None
    auto_remediation: Optional[bool] = False

class SettingsResponse(SettingsBase):
    _id: Optional[str] = None
    updated_at: Optional[str] = None

class SettingsUpdateRequest(SettingsBase):
    pass

# -------------------------------------------------------------
# Report Models
# -------------------------------------------------------------
class ReportListResponse(BaseModel):
    reports: List[Dict[str, Any]]

# -------------------------------------------------------------
# Validation Models
# -------------------------------------------------------------
class ValidateGeminiRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None

class ValidateGitlabRequest(BaseModel):
    gitlab_api_url: Optional[str] = None
    gitlab_private_token: Optional[str] = None

class ValidateClusterRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    auth_type: str
    agent_url: Optional[str] = None
    api_endpoint: Optional[str] = None
    kubeconfig: Optional[str] = None

class ESValidateRequest(BaseModel):
    host: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

class ValidationDetailResponse(BaseModel):
    status: str
    message: str
    detail: Optional[Dict[str, Any]] = None

# -------------------------------------------------------------
# Search Models
# -------------------------------------------------------------
class SearchResponse(BaseModel):
    status: str
    query: Optional[str] = None
    index: Optional[str] = None
    total: int
    results: List[Dict[str, Any]]
    message: Optional[str] = None

class ESHealthResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    status: str
    cluster_name: Optional[str] = None
    indices: Optional[List[str]] = None
    documents: Optional[int] = None
    host: Optional[str] = None
    message: Optional[str] = None
