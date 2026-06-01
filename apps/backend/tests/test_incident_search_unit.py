"""
Unit tests for app.services.incident_search

Covers:
  - search_similar_incidents query construction with/without filters
  - search_rca_by_incident, search_remediation_by_incident
  - search_pod_logs, search_events, search_incidents_by_pod
  - search_incidents_by_status, search_by_severity
  - get_incident_context aggregation
  - build_gemini_context empty/populated formatting
"""
import pytest
from unittest.mock import patch, MagicMock

from app.services.incident_search import (
    search_similar_incidents,
    search_rca_by_incident,
    search_remediation_by_incident,
    search_pod_logs,
    search_events,
    search_incidents_by_pod,
    search_incidents_by_status,
    search_by_severity,
    get_incident_context,
    build_gemini_context,
)


@pytest.fixture(autouse=True)
def mock_search():
    """Patch search_documents globally for all tests in this module."""
    with patch("app.services.incident_search.search_documents") as mock:
        mock.return_value = ([], 0)
        yield mock


# ── search_similar_incidents ─────────────────────────────────────────────

class TestSearchSimilarIncidents:
    def test_no_filters(self, mock_search):
        mock_search.return_value = ([{"pod_name": "p"}], 1)
        results = search_similar_incidents("OOM killed")
        assert len(results) == 1
        # Verify multi_match query was constructed
        call_args = mock_search.call_args
        query = call_args[0][1]
        assert "multi_match" in query

    def test_with_pod_and_namespace_filters(self, mock_search):
        mock_search.return_value = ([], 0)
        search_similar_incidents("error", pod_name="web", namespace="prod")
        call_args = mock_search.call_args
        query = call_args[0][1]
        assert "bool" in query
        assert "filter" in query["bool"]
        filters = query["bool"]["filter"]
        assert len(filters) == 2

    def test_custom_limit(self, mock_search):
        mock_search.return_value = ([], 0)
        search_similar_incidents("error", limit=3)
        call_kwargs = mock_search.call_args
        assert call_kwargs[1]["size"] == 3 or call_kwargs[0][2] == 3


# ── Simple search functions ──────────────────────────────────────────────

class TestSimpleSearchFunctions:
    def test_search_rca_by_incident(self, mock_search):
        mock_search.return_value = ([{"analysis": "root cause"}], 1)
        results = search_rca_by_incident("inc-1")
        assert len(results) == 1
        query = mock_search.call_args[0][1]
        assert query == {"term": {"incident_id": "inc-1"}}

    def test_search_remediation_by_incident(self, mock_search):
        mock_search.return_value = ([], 0)
        results = search_remediation_by_incident("inc-1")
        assert results == []

    def test_search_pod_logs_with_namespace(self, mock_search):
        mock_search.return_value = ([], 0)
        search_pod_logs("my-pod", namespace="kube-system")
        query = mock_search.call_args[0][1]
        assert "bool" in query
        filters = query["bool"]["filter"]
        assert len(filters) == 2

    def test_search_pod_logs_without_namespace(self, mock_search):
        mock_search.return_value = ([], 0)
        search_pod_logs("my-pod")
        query = mock_search.call_args[0][1]
        filters = query["bool"]["filter"]
        assert len(filters) == 1

    def test_search_events_no_filters(self, mock_search):
        mock_search.return_value = ([], 0)
        search_events()
        query = mock_search.call_args[0][1]
        assert "match_all" in query

    def test_search_events_with_filters(self, mock_search):
        mock_search.return_value = ([], 0)
        search_events(namespace="default", event_type="Warning")
        query = mock_search.call_args[0][1]
        assert "bool" in query
        assert len(query["bool"]["filter"]) == 2

    def test_search_incidents_by_pod(self, mock_search):
        mock_search.return_value = ([], 0)
        search_incidents_by_pod("api-pod", namespace="prod")
        query = mock_search.call_args[0][1]
        assert len(query["bool"]["filter"]) == 2

    def test_search_incidents_by_status(self, mock_search):
        mock_search.return_value = ([{"status": "active"}], 1)
        results = search_incidents_by_status("active")
        assert len(results) == 1

    def test_search_by_severity(self, mock_search):
        mock_search.return_value = ([], 0)
        search_by_severity("critical")
        query = mock_search.call_args[0][1]
        assert query == {"term": {"severity": "critical"}}


# ── get_incident_context ─────────────────────────────────────────────────

class TestGetIncidentContext:
    def test_aggregates_rca_and_remediation(self, mock_search):
        mock_search.return_value = ([], 0)
        ctx = get_incident_context("inc-42")
        assert ctx["incident_id"] == "inc-42"
        assert "rca" in ctx
        assert "remediations" in ctx


# ── build_gemini_context ─────────────────────────────────────────────────

class TestBuildGeminiContext:
    def test_empty_incidents(self):
        result = build_gemini_context([])
        assert result == "No similar historical incidents found."

    def test_populated_incidents(self):
        incidents = [
            {"title": "OOM Crash", "root_cause": "memory limit", "severity": "critical", "status": "resolved", "logs": "short"},
            {"title": "DNS Failure", "root_cause": "coredns", "severity": "high", "status": "active", "logs": "x" * 500},
        ]
        result = build_gemini_context(incidents)
        assert "Found 2 similar" in result
        assert "OOM Crash" in result
        assert "DNS Failure" in result
        # Long logs should be truncated
        assert "..." in result

    def test_limits_to_5_incidents(self):
        incidents = [{"title": f"Inc-{i}"} for i in range(10)]
        result = build_gemini_context(incidents)
        # Should only include first 5
        assert "Inc-0" in result
        assert "Inc-4" in result
        assert "Inc-5" not in result

    def test_missing_fields(self):
        """Incidents with no title/root_cause/logs should still produce output."""
        incidents = [{"severity": "low"}]
        result = build_gemini_context(incidents)
        assert "Found 1 similar" in result
