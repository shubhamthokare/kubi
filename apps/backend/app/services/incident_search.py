"""
Incident Search Service

Provides semantic and keyword search for incidents, logs, and RCA data.
Enables Gemini RCA engine to find similar historical incidents for context.
"""

import logging
from typing import Dict, Any, List

from app.core.config import settings
from app.services.elasticsearch_service import search_documents

logger = logging.getLogger(__name__)


def search_similar_incidents(error_logs: str, pod_name: str = None, 
                             namespace: str = None, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for similar historical incidents.
    
    This is critical for Gemini RCA - provides context of past incidents.
    
    Args:
        error_logs: Error logs/description to search for
        pod_name: Optional pod name filter
        namespace: Optional namespace filter
        limit: Max results to return
    
    Returns:
        List of similar incidents
    """
    filters = []
    
    if pod_name:
        filters.append({"term": {"pod_name": pod_name}})
    if namespace:
        filters.append({"term": {"namespace": namespace}})
    
    query = {
        "multi_match": {
            "query": error_logs,
            "fields": ["logs^2", "root_cause^1.5", "events", "title"],
            "fuzziness": "AUTO",
        }
    }
    
    if filters:
        query = {
            "bool": {
                "must": query,
                "filter": filters,
            }
        }
    
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX, query, size=limit)
    logger.info(f"Found {len(results)} similar incidents for logs: {error_logs[:100]}...")
    
    return results


def search_rca_by_incident(incident_id: str) -> List[Dict[str, Any]]:
    """Get RCA analysis for a specific incident."""
    query = {"term": {"incident_id": incident_id}}
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX_RCA, query, size=1)
    return results


def search_remediation_by_incident(incident_id: str) -> List[Dict[str, Any]]:
    """Get all remediation actions for a specific incident."""
    query = {"term": {"incident_id": incident_id}}
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX_REMEDIATION, query, size=50)
    return results


def search_pod_logs(pod_name: str, namespace: str = None, limit: int = 10) -> List[Dict[str, Any]]:
    """Search pod logs by pod name and namespace."""
    filters = [{"term": {"pod_name": pod_name}}]
    
    if namespace:
        filters.append({"term": {"namespace": namespace}})
    
    query = {
        "bool": {
            "filter": filters,
        }
    }
    
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX_LOGS, query, size=limit)
    return results


def search_events(namespace: str = None, pod_name: str = None, 
                  event_type: str = None, limit: int = 20) -> List[Dict[str, Any]]:
    """Search K8s events with optional filters."""
    filters = []
    
    if namespace:
        filters.append({"term": {"namespace": namespace}})
    if pod_name:
        filters.append({"term": {"pod_name": pod_name}})
    if event_type:
        filters.append({"term": {"event_type": event_type}})
    
    if filters:
        query = {"bool": {"filter": filters}}
    else:
        query = {"match_all": {}}
    
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX_EVENTS, query, size=limit)
    return results


def search_incidents_by_pod(pod_name: str, namespace: str = None, 
                            limit: int = 10) -> List[Dict[str, Any]]:
    """Get all incidents for a specific pod."""
    filters = [{"term": {"pod_name": pod_name}}]
    
    if namespace:
        filters.append({"term": {"namespace": namespace}})
    
    query = {"bool": {"filter": filters}}
    
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX, query, size=limit)
    return results


def search_incidents_by_status(status: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Get all incidents with a specific status."""
    query = {"term": {"status": status}}
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX, query, size=limit)
    return results


def search_by_severity(severity: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Get incidents by severity level."""
    query = {"term": {"severity": severity}}
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX, query, size=limit)
    return results


def get_incident_context(incident_id: str) -> Dict[str, Any]:
    """
    Get complete context for an incident (incident + RCA + remediation).
    Useful for detailed analysis and response.
    """
    # Note: This is a convenience function
    # In production, you'd likely want to fetch from MongoDB as well
    context = {
        "incident_id": incident_id,
        "rca": search_rca_by_incident(incident_id),
        "remediations": search_remediation_by_incident(incident_id),
    }
    return context


def build_gemini_context(similar_incidents: List[Dict[str, Any]]) -> str:
    """
    Build a context string for Gemini from similar incidents.
    
    This enriches the RCA prompt with historical context.
    """
    if not similar_incidents:
        return "No similar historical incidents found."
    
    context_parts = [f"Found {len(similar_incidents)} similar historical incidents:\n"]
    
    for i, incident in enumerate(similar_incidents[:5], 1):  # Limit to 5 for token budget
        context_parts.append(f"\n--- Incident {i} ---")
        
        if "title" in incident:
            context_parts.append(f"Title: {incident['title']}")
        if "root_cause" in incident:
            context_parts.append(f"Root Cause: {incident['root_cause']}")
        if "severity" in incident:
            context_parts.append(f"Severity: {incident['severity']}")
        if "status" in incident:
            context_parts.append(f"Status: {incident['status']}")
        
        # Logs (truncated)
        if "logs" in incident:
            logs_preview = incident["logs"][:300] + "..." if len(incident["logs"]) > 300 else incident["logs"]
            context_parts.append(f"Logs: {logs_preview}")
    
    return "\n".join(context_parts)
