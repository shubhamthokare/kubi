"""
Elasticsearch Service for Kubi AI Incident Indexing & Search

Provides production-grade connectivity to Elasticsearch for:
- Storing incident logs, events, and telemetry
- Searching historical incidents by keyword or semantic similarity
- Providing context to Gemini RCA engine
- Supporting real-time log streaming and aggregation
- Health monitoring and automatic index creation

Features:
- Connection pooling and automatic retry
- Bulk indexing for high-throughput scenarios
- Multiple index support (incidents, logs, events, RCA, remediation)
- Health checks and graceful degradation
- Authentication support (basic auth, API key)
"""

import logging
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from elasticsearch import Elasticsearch
from elasticsearch.exceptions import ConnectionError as ESConnectionError, NotFoundError
from elasticsearch.helpers import bulk as es_bulk

from app.core.config import settings

logger = logging.getLogger(__name__)

# Global Elasticsearch client (lazy initialized)
_es_client: Optional[Elasticsearch] = None

# Default index mappings
DEFAULT_MAPPINGS = {
    "incidents": {
        "properties": {
            "cluster_id": {"type": "keyword"},
            "namespace": {"type": "keyword"},
            "pod_name": {"type": "keyword"},
            "pod_uid": {"type": "keyword"},
            "container_name": {"type": "keyword"},
            "incident_type": {"type": "keyword"},
            "severity": {"type": "keyword"},
            "status": {"type": "keyword"},
            "title": {"type": "text", "analyzer": "standard"},
            "description": {"type": "text", "analyzer": "standard"},
            "root_cause": {"type": "text", "analyzer": "standard"},
            "logs": {"type": "text", "analyzer": "standard"},
            "events": {"type": "text"},
            "remediation_status": {"type": "keyword"},
            "detected_at": {"type": "date"},
            "resolved_at": {"type": "date"},
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"},
        }
    },
    "pod-logs": {
        "properties": {
            "cluster_id": {"type": "keyword"},
            "namespace": {"type": "keyword"},
            "pod_name": {"type": "keyword"},
            "pod_uid": {"type": "keyword"},
            "container_name": {"type": "keyword"},
            "log_level": {"type": "keyword"},
            "message": {"type": "text", "analyzer": "standard"},
            "timestamp": {"type": "date"},
            "source": {"type": "keyword"},
        }
    },
    "events": {
        "properties": {
            "cluster_id": {"type": "keyword"},
            "namespace": {"type": "keyword"},
            "pod_name": {"type": "keyword"},
            "event_type": {"type": "keyword"},
            "reason": {"type": "keyword"},
            "message": {"type": "text"},
            "timestamp": {"type": "date"},
            "count": {"type": "integer"},
        }
    },
    "rca-reports": {
        "properties": {
            "cluster_id": {"type": "keyword"},
            "incident_id": {"type": "keyword"},
            "root_cause": {"type": "text", "analyzer": "standard"},
            "contributing_factors": {"type": "text"},
            "gemini_analysis": {"type": "text"},
            "confidence_score": {"type": "float"},
            "created_at": {"type": "date"},
        }
    },
    "remediation": {
        "properties": {
            "cluster_id": {"type": "keyword"},
            "incident_id": {"type": "keyword"},
            "plan_id": {"type": "keyword"},
            "status": {"type": "keyword"},
            "actions": {"type": "text"},
            "executed_at": {"type": "date"},
            "created_at": {"type": "date"},
        }
    },
}


def get_es() -> Optional[Elasticsearch]:
    """Get or initialize Elasticsearch client with connection pooling."""
    global _es_client

    if _es_client is not None:
        return _es_client

    host = settings.ELASTICSEARCH_HOST

    try:
        # Build kwargs for authentication
        init_kwargs: Dict[str, Any] = {
            "hosts": [host],
            "request_timeout": 30,
            "retry_on_timeout": True,
            "max_retries": 3,
        }

        # Add basic auth or api key if credentials are provided
        if settings.ELASTICSEARCH_API_KEY:
            init_kwargs["api_key"] = settings.ELASTICSEARCH_API_KEY
        elif settings.ELASTICSEARCH_USERNAME and settings.ELASTICSEARCH_PASSWORD:
            init_kwargs["basic_auth"] = (
                settings.ELASTICSEARCH_USERNAME,
                settings.ELASTICSEARCH_PASSWORD,
            )

        _es_client = Elasticsearch(**init_kwargs)

        # Test connection
        if _es_client.ping():
            logger.info(f"✓ Connected to Elasticsearch at {host}")
            initialize_indices()  # Auto-create indices on first connection
            return _es_client
        else:
            logging.exception(f"✗ Elasticsearch at {host} is not responding")
            _es_client = None
            return None

    except ESConnectionError as e:
        logging.exception(f"✗ Failed to connect to Elasticsearch: {e}")
        _es_client = None
        return None
    except Exception as e:
        logging.exception(f"✗ Unexpected error initializing Elasticsearch: {e}")
        _es_client = None
        return None


def reset_es_client():
    """Reset the cached client so next call to get_es() re-initializes."""
    global _es_client
    if _es_client:
        try:
            _es_client.close()
        except Exception:
            pass
    _es_client = None


def is_available() -> bool:
    """Quick non-initializing check whether ES is reachable."""
    es = get_es()
    if not es:
        return False
    try:
        return es.ping()
    except Exception:
        return False


def initialize_indices():
    """Create default indices if they don't exist."""
    es = get_es()
    if not es:
        return

    indices = [
        (settings.ELASTICSEARCH_INDEX, "incidents"),
        (settings.ELASTICSEARCH_INDEX_LOGS, "pod-logs"),
        (settings.ELASTICSEARCH_INDEX_EVENTS, "events"),
        (settings.ELASTICSEARCH_INDEX_RCA, "rca-reports"),
        (settings.ELASTICSEARCH_INDEX_REMEDIATION, "remediation"),
    ]

    for index_name, mapping_key in indices:
        if mapping_key in DEFAULT_MAPPINGS:
            create_index(index_name, DEFAULT_MAPPINGS[mapping_key])


def index_exists(index_name: str) -> bool:
    """Check if an index exists."""
    es = get_es()
    if not es:
        return False

    try:
        return bool(es.indices.exists(index=index_name))
    except Exception as e:
        logging.exception(f"Error checking if index {index_name} exists: {e}")
        return False


def create_index(index_name: str, mapping: Optional[Dict[str, Any]] = None) -> bool:
    """
    Create an index with the given mapping.

    Args:
        index_name: Name of the index to create
        mapping: Mapping properties dict (not the full body), uses defaults if None

    Returns:
        True if successful or already exists, False otherwise
    """
    es = get_es()
    if not es:
        return False

    if index_exists(index_name):
        logger.debug(f"Index {index_name} already exists")
        return True

    try:
        kwargs: Dict[str, Any] = {
            "settings": {
                "number_of_shards": settings.ELASTICSEARCH_SHARDS,
                "number_of_replicas": settings.ELASTICSEARCH_REPLICAS,
            }
        }

        if mapping:
            kwargs["mappings"] = mapping

        # ES 8.x uses keyword args, not body=
        es.indices.create(index=index_name, **kwargs)
        logger.info(f"✓ Created index: {index_name}")
        return True
    except Exception as e:
        logging.exception(f"Error creating index {index_name}: {e}")
        return False


def index_document(
    index_name: str,
    document: Dict[str, Any],
    doc_id: Optional[str] = None,
    refresh: bool = False,
) -> Optional[str]:
    """
    Index a single document in Elasticsearch.

    Args:
        index_name: Target index name
        document: Document to index
        doc_id: Optional document ID (auto-generated if not provided)
        refresh: Whether to refresh index immediately

    Returns:
        Document ID if successful, None if failed
    """
    es = get_es()
    if not es:
        logger.warning("Elasticsearch not available, skipping document indexing")
        return None

    # ES reserved metadata fields that cannot appear inside the document body
    _ES_RESERVED = {"_id", "_index", "_type", "_score", "_source", "_seq_no", "_primary_term"}

    # Sanitize: remove reserved fields and convert datetime to ISO strings
    clean_doc = {}
    for k, v in document.items():
        if k in _ES_RESERVED:
            continue  # skip — pass _id via the `id=` param instead
        if isinstance(v, datetime):
            clean_doc[k] = v.isoformat()
        else:
            clean_doc[k] = v

    try:
        result = es.index(
            index=index_name,
            document=clean_doc,
            id=doc_id,
            refresh="true" if refresh else "false",
        )
        return result.get("_id")
    except Exception as e:
        logging.exception(f"Error indexing document in {index_name}: {e}")
        return None


def bulk_index_documents(
    index_name: str,
    documents: List[Dict[str, Any]],
    refresh: bool = True,
) -> tuple:
    """
    Bulk index multiple documents for high-throughput scenarios.

    Args:
        index_name: Target index name
        documents: List of documents to index
        refresh: Whether to refresh index after bulk operation

    Returns:
        Tuple of (successful_count, failed_count)
    """
    es = get_es()
    if not es or not documents:
        return 0, len(documents) if documents else 0

    try:
        actions = [
            {
                "_index": index_name,
                "_source": doc,
            }
            for doc in documents
        ]

        success, failed = es_bulk(es, actions)
        logger.info(f"Bulk indexed {success} documents, {failed} failures in {index_name}")

        if refresh:
            es.indices.refresh(index=index_name)

        return success, failed
    except Exception as e:
        logging.exception(f"Error bulk indexing to {index_name}: {e}")
        return 0, len(documents)


def search_documents(
    index_name: str,
    query: Dict[str, Any],
    size: int = 10,
    from_: int = 0,
) -> tuple:
    """
    Search documents in Elasticsearch with pagination.

    Args:
        index_name: Index to search
        query: Elasticsearch query dict
        size: Maximum results to return
        from_: Offset for pagination

    Returns:
        Tuple of (results_list, total_hits)
    """
    es = get_es()
    if not es:
        logger.warning("Elasticsearch not available, returning empty results")
        return [], 0

    try:
        response = es.search(
            index=index_name,
            query=query,
            size=size,
            from_=from_,
        )
        hits = response.get("hits", {}).get("hits", [])
        total = response.get("hits", {}).get("total", {}).get("value", 0)

        results = []
        for hit in hits:
            doc = hit["_source"]
            doc["_id"] = hit["_id"]
            doc["_score"] = hit.get("_score")
            results.append(doc)

        return results, total
    except Exception as e:
        logging.exception(f"Error searching {index_name}: {e}")
        return [], 0


def search_similar_incidents(
    error_logs: str,
    pod_name: Optional[str] = None,
    namespace: Optional[str] = None,
    cluster_id: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search for similar historical incidents using multi-match query.

    Used by Gemini RCA engine to find context from past incidents.
    """
    must_clauses = [
        {
            "multi_match": {
                "query": error_logs,
                "fields": ["logs^2", "root_cause^1.5", "events", "title"],
                "fuzziness": "AUTO",
            }
        }
    ]

    filter_clauses = []
    if pod_name:
        filter_clauses.append({"term": {"pod_name": pod_name}})
    if namespace:
        filter_clauses.append({"term": {"namespace": namespace}})
    if cluster_id:
        filter_clauses.append({"term": {"cluster_id": cluster_id}})

    query: Dict[str, Any] = {"bool": {"must": must_clauses}}
    if filter_clauses:
        query["bool"]["filter"] = filter_clauses

    results, _ = search_documents(settings.ELASTICSEARCH_INDEX, query, size=limit)
    return results


def get_pod_logs(
    pod_name: str,
    namespace: str,
    cluster_id: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Retrieve logs for a specific pod from Elasticsearch."""
    must_clauses = [
        {"term": {"pod_name": pod_name}},
        {"term": {"namespace": namespace}},
    ]

    if cluster_id:
        must_clauses.append({"term": {"cluster_id": cluster_id}})

    query = {"bool": {"must": must_clauses}}
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX_LOGS, query, size=limit)
    return results


def get_recent_events(
    cluster_id: Optional[str] = None,
    namespace: Optional[str] = None,
    minutes: int = 60,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Get recent events from the cluster."""
    must_clauses: List[Dict[str, Any]] = [
        {"range": {"timestamp": {"gte": f"now-{minutes}m"}}}
    ]

    if cluster_id:
        must_clauses.append({"term": {"cluster_id": cluster_id}})
    if namespace:
        must_clauses.append({"term": {"namespace": namespace}})

    query = {"bool": {"must": must_clauses}}
    results, _ = search_documents(settings.ELASTICSEARCH_INDEX_EVENTS, query, size=limit)
    return results


def get_incident_stats(cluster_id: Optional[str] = None) -> Dict[str, Any]:
    """Get aggregated incident statistics via Elasticsearch aggregations."""
    es = get_es()
    if not es:
        return {}

    try:
        query: Dict[str, Any] = {"match_all": {}}
        if cluster_id:
            query = {"bool": {"filter": [{"term": {"cluster_id": cluster_id}}]}}

        response = es.search(
            index=settings.ELASTICSEARCH_INDEX,
            query=query,
            aggs={
                "by_severity": {"terms": {"field": "severity", "size": 10}},
                "by_type": {"terms": {"field": "incident_type", "size": 10}},
                "by_status": {"terms": {"field": "status", "size": 10}},
            },
            size=0,
        )

        return response.get("aggregations", {})
    except Exception as e:
        logging.exception(f"Error getting incident stats: {e}")
        return {}


def get_es_health() -> Dict[str, Any]:
    """Return cluster health info for the /api/es/health endpoint."""
    es = get_es()
    if not es:
        return {
            "status": "unavailable",
            "host": settings.ELASTICSEARCH_HOST,
            "indices": {},
        }

    try:
        health = es.cluster.health()
        indices_info = {}
        index_names = [
            settings.ELASTICSEARCH_INDEX,
            settings.ELASTICSEARCH_INDEX_LOGS,
            settings.ELASTICSEARCH_INDEX_EVENTS,
            settings.ELASTICSEARCH_INDEX_RCA,
            settings.ELASTICSEARCH_INDEX_REMEDIATION,
        ]
        for idx in index_names:
            try:
                if es.indices.exists(index=idx):
                    stats = es.indices.stats(index=idx)
                    doc_count = (
                        stats.get("indices", {})
                        .get(idx, {})
                        .get("primaries", {})
                        .get("docs", {})
                        .get("count", 0)
                    )
                    indices_info[idx] = {"exists": True, "doc_count": doc_count}
                else:
                    indices_info[idx] = {"exists": False, "doc_count": 0}
            except Exception:
                indices_info[idx] = {"exists": False, "doc_count": 0}

        return {
            "status": health.get("status", "unknown"),
            "cluster_name": health.get("cluster_name"),
            "number_of_nodes": health.get("number_of_nodes"),
            "host": settings.ELASTICSEARCH_HOST,
            "indices": indices_info,
        }
    except Exception as e:
        logging.exception(f"ES health check failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "host": settings.ELASTICSEARCH_HOST,
        }


def close_es():
    """Close Elasticsearch connection gracefully."""
    global _es_client
    if _es_client:
        try:
            _es_client.close()
            logger.info("Elasticsearch connection closed")
        except Exception as e:
            logging.exception(f"Error closing Elasticsearch: {e}")
        finally:
            _es_client = None
