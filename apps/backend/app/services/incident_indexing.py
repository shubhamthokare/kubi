"""
Incident Indexing Service

Manages Elasticsearch indices for incidents, logs, events, RCA, and remediation data.
Creates indices with appropriate mappings on initialization.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from app.core.config import settings
from app.services.elasticsearch_service import (
    get_es,
    index_exists,
    create_index,
    index_document,
)

logger = logging.getLogger(__name__)


# Index mappings
INCIDENT_MAPPING = {
    "mappings": {
        "properties": {
            "incident_id": {"type": "keyword"},
            "namespace": {"type": "keyword"},
            "pod_name": {"type": "keyword"},
            "cluster_id": {"type": "keyword"},
            "severity": {"type": "keyword"},
            "status": {"type": "keyword"},
            "title": {"type": "text"},
            "root_cause": {"type": "text"},
            "logs": {"type": "text"},
            "events": {"type": "text"},
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"},
        }
    }
}

POD_LOGS_MAPPING = {
    "mappings": {
        "properties": {
            "pod_name": {"type": "keyword"},
            "namespace": {"type": "keyword"},
            "container": {"type": "keyword"},
            "log_content": {"type": "text"},
            "timestamp": {"type": "date"},
            "level": {"type": "keyword"},
        }
    }
}

EVENTS_MAPPING = {
    "mappings": {
        "properties": {
            "event_id": {"type": "keyword"},
            "pod_name": {"type": "keyword"},
            "namespace": {"type": "keyword"},
            "event_type": {"type": "keyword"},
            "reason": {"type": "keyword"},
            "message": {"type": "text"},
            "count": {"type": "integer"},
            "first_occurrence": {"type": "date"},
            "last_occurrence": {"type": "date"},
        }
    }
}

RCA_MAPPING = {
    "mappings": {
        "properties": {
            "incident_id": {"type": "keyword"},
            "analysis": {"type": "text"},
            "root_causes": {"type": "text"},
            "affected_resources": {"type": "keyword"},
            "confidence_score": {"type": "float"},
            "created_at": {"type": "date"},
        }
    }
}

REMEDIATION_MAPPING = {
    "mappings": {
        "properties": {
            "incident_id": {"type": "keyword"},
            "action_type": {"type": "keyword"},
            "target_resource": {"type": "keyword"},
            "namespace": {"type": "keyword"},
            "status": {"type": "keyword"},
            "details": {"type": "text"},
            "executed_at": {"type": "date"},
            "result": {"type": "text"},
        }
    }
}


def initialize_indices():
    """Initialize all Elasticsearch indices with mappings."""
    logger.info("Initializing Elasticsearch indices...")
    
    indices_config = [
        (settings.ELASTICSEARCH_INDEX, INCIDENT_MAPPING, "Incidents"),
        (settings.ELASTICSEARCH_INDEX_LOGS, POD_LOGS_MAPPING, "Pod Logs"),
        (settings.ELASTICSEARCH_INDEX_EVENTS, EVENTS_MAPPING, "Events"),
        (settings.ELASTICSEARCH_INDEX_RCA, RCA_MAPPING, "RCA"),
        (settings.ELASTICSEARCH_INDEX_REMEDIATION, REMEDIATION_MAPPING, "Remediation"),
    ]
    
    es = get_es()
    if not es:
        logger.warning("Elasticsearch not available, skipping index initialization")
        return
    
    for index_name, mapping, description in indices_config:
        if create_index(index_name, mapping):
            logger.info(f"✓ Index ready: {description} ({index_name})")
        else:
            logger.warning(f"✗ Failed to initialize {description} index ({index_name})")


def store_incident(incident_data: Dict[str, Any]) -> Optional[str]:
    """
    Store an incident in Elasticsearch.
    
    Args:
        incident_data: Incident data dict with fields:
            - incident_id: Unique identifier
            - namespace: K8s namespace
            - pod_name: Pod name
            - cluster_id: Cluster ID
            - severity: 'critical', 'high', 'medium', 'low'
            - status: 'active', 'resolved', 'investigating'
            - title: Short description
            - root_cause: Root cause analysis text
            - logs: Pod logs
            - events: K8s events
    
    Returns:
        Document ID if successful, None if failed
    """
    # Extract _id before building the ES document — it's a MongoDB ObjectId and
    # must NOT appear inside the ES document body (reserved metadata field).
    mongo_id = str(incident_data.get("_id", ""))
    doc_id = incident_data.get("incident_id") or mongo_id or None

    # Flatten nested fields from MongoDB to Elasticsearch flat schema (INCIDENT_MAPPING)
    pod = incident_data.get("pod") or {}
    
    document = {
        "incident_id": doc_id,
        "namespace": incident_data.get("namespace") or pod.get("namespace", "default"),
        "pod_name": incident_data.get("pod_name") or pod.get("name", ""),
        "cluster_id": incident_data.get("cluster_id") or "local-minikube",
        "severity": incident_data.get("severity") or pod.get("severity") or "high",
        "status": incident_data.get("status") or "active",
        "title": incident_data.get("title") or f"Incident in pod {pod.get('name', '')}",
        "root_cause": incident_data.get("root_cause") or incident_data.get("rca") or "",
        "logs": incident_data.get("logs") or incident_data.get("logs_context") or "",
        "events": incident_data.get("events") or "",
    }
    
    # Handle timestamps robustly
    created_at = incident_data.get("created_at") or incident_data.get("first_detected") or datetime.now(timezone.utc)
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except Exception:
            created_at = datetime.now(timezone.utc)
            
    if isinstance(created_at, datetime) and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
            
    document["created_at"] = created_at
    document["updated_at"] = datetime.now(timezone.utc)

    return index_document(settings.ELASTICSEARCH_INDEX, document, doc_id=doc_id)


def store_pod_logs(pod_name: str, namespace: str, container: str, logs: str) -> Optional[str]:
    """Store pod logs in Elasticsearch."""
    document = {
        "pod_name": pod_name,
        "namespace": namespace,
        "container": container,
        "log_content": logs,
        "timestamp": datetime.now(timezone.utc),
    }
    return index_document(settings.ELASTICSEARCH_INDEX_LOGS, document)


def store_events(event_data: Dict[str, Any]) -> Optional[str]:
    """Store K8s events in Elasticsearch."""
    first_occ = event_data.get("first_occurrence") or datetime.now(timezone.utc)
    if isinstance(first_occ, str):
        try:
            first_occ = datetime.fromisoformat(first_occ.replace("Z", "+00:00"))
        except Exception:
            first_occ = datetime.now(timezone.utc)
    if isinstance(first_occ, datetime) and first_occ.tzinfo is None:
        first_occ = first_occ.replace(tzinfo=timezone.utc)

    last_occ = event_data.get("last_occurrence") or datetime.now(timezone.utc)
    if isinstance(last_occ, str):
        try:
            last_occ = datetime.fromisoformat(last_occ.replace("Z", "+00:00"))
        except Exception:
            last_occ = datetime.now(timezone.utc)
    if isinstance(last_occ, datetime) and last_occ.tzinfo is None:
        last_occ = last_occ.replace(tzinfo=timezone.utc)

    document = {
        **event_data,
        "first_occurrence": first_occ,
        "last_occurrence": last_occ,
    }
    
    doc_id = event_data.get("event_id")
    return index_document(settings.ELASTICSEARCH_INDEX_EVENTS, document, doc_id=doc_id)


def store_rca(incident_id: str, analysis: str, root_causes: str, 
              affected_resources: list, confidence_score: float = 1.0) -> Optional[str]:
    """Store RCA results in Elasticsearch."""
    document = {
        "incident_id": incident_id,
        "analysis": analysis,
        "root_causes": root_causes,
        "affected_resources": affected_resources,
        "confidence_score": confidence_score,
        "created_at": datetime.now(timezone.utc),
    }
    return index_document(settings.ELASTICSEARCH_INDEX_RCA, document, doc_id=f"rca-{incident_id}")


def store_remediation(incident_id: str, action_type: str, target_resource: str, 
                      namespace: str, status: str, details: str) -> Optional[str]:
    """Store remediation action in Elasticsearch."""
    document = {
        "incident_id": incident_id,
        "action_type": action_type,
        "target_resource": target_resource,
        "namespace": namespace,
        "status": status,
        "details": details,
        "executed_at": datetime.now(timezone.utc),
    }
    return index_document(settings.ELASTICSEARCH_INDEX_REMEDIATION, document)
