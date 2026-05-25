import unittest
from unittest.mock import patch, MagicMock, AsyncMock
import os
import sys
from datetime import datetime

# dynamic mock of elasticsearch module
mock_es = MagicMock()
sys.modules['elasticsearch'] = mock_es
sys.modules['elasticsearch.helpers'] = mock_es.helpers
sys.modules['elasticsearch.exceptions'] = mock_es.exceptions

# dynamic mock of motor/mongodb to prevent initialization issues
sys.modules['motor'] = MagicMock()
sys.modules['motor.motor_asyncio'] = MagicMock()

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import targeted units
from app.core.config import settings
from app.services.incident_indexing import store_incident
from app.services.incident_search import (
    search_similar_incidents,
    search_rca_by_incident,
    search_remediation_by_incident,
    search_pod_logs,
    search_events,
    search_incidents_by_pod,
    search_incidents_by_status,
    search_by_severity
)
from app.services.gemini_service import GeminiService
from app.services.elastic_mcp_service import ElasticMCPService

class TestElasticsearchIntegration(unittest.IsolatedAsyncioTestCase):
    
    @patch('app.services.incident_indexing.index_document')
    def test_store_incident_flattening(self, mock_index):
        mock_index.return_value = "es-doc-123"
        
        # Nested MongoDB-style document structure
        mongo_doc = {
            "_id": "507f1f77bcf86cd799439011",
            "cluster_id": "test-cluster",
            "status": "active",
            "pod": {
                "name": "payment-api-xyz",
                "namespace": "production",
                "uid": "12345-uid",
                "severity": "critical"
            },
            "rca": "Out of memory due to Redis memory leak",
            "logs_context": "FATAL: OutOfMemoryError at payment-api-xyz",
            "first_detected": "2026-05-20T18:00:00Z"
        }
        
        doc_id = store_incident(mongo_doc)
        
        self.assertEqual(doc_id, "es-doc-123")
        mock_index.assert_called_once()
        
        # Verify flattening occurred
        called_args = mock_index.call_args[0]
        called_kwargs = mock_index.call_args[1]
        index_name = called_args[0]
        indexed_doc = called_args[1]
        passed_id = called_kwargs.get("doc_id") or (called_args[2] if len(called_args) > 2 else None)
        
        self.assertEqual(index_name, settings.ELASTICSEARCH_INDEX)
        self.assertEqual(passed_id, "507f1f77bcf86cd799439011")
        
        # Assert flat fields mapped correctly
        self.assertEqual(indexed_doc["pod_name"], "payment-api-xyz")
        self.assertEqual(indexed_doc["namespace"], "production")
        self.assertEqual(indexed_doc["severity"], "critical")
        self.assertEqual(indexed_doc["root_cause"], "Out of memory due to Redis memory leak")
        self.assertEqual(indexed_doc["logs"], "FATAL: OutOfMemoryError at payment-api-xyz")
        self.assertIsInstance(indexed_doc["created_at"], datetime)

    @patch('app.services.incident_search.search_documents')
    def test_search_services_unpack_tuples(self, mock_search):
        # mock low-level search_documents which returns (results_list, total)
        mock_results = [{"incident_id": "1", "title": "Test Pod Crash"}]
        mock_search.return_value = (mock_results, 1)
        
        # Test search_similar_incidents returns List directly
        res = search_similar_incidents("OOM error", pod_name="api", namespace="default")
        self.assertEqual(res, mock_results)
        
        # Test search_rca_by_incident returns List directly
        res = search_rca_by_incident("1")
        self.assertEqual(res, mock_results)
        
        # Test search_remediation_by_incident returns List directly
        res = search_remediation_by_incident("1")
        self.assertEqual(res, mock_results)
        
        # Test search_pod_logs returns List directly
        res = search_pod_logs("api")
        self.assertEqual(res, mock_results)

        # Test search_events returns List directly
        res = search_events(namespace="default")
        self.assertEqual(res, mock_results)

        # Test search_incidents_by_pod returns List directly
        res = search_incidents_by_pod("api")
        self.assertEqual(res, mock_results)

        # Test search_incidents_by_status returns List directly
        res = search_incidents_by_status("active")
        self.assertEqual(res, mock_results)

        # Test search_by_severity returns List directly
        res = search_by_severity("critical")
        self.assertEqual(res, mock_results)

    @patch('app.services.elasticsearch_service.is_available')
    @patch('app.services.elasticsearch_service.search_similar_incidents')
    @patch('app.db.database.get_db')
    async def test_gemini_rag_context_elasticsearch(self, mock_get_db, mock_es_search, mock_is_available):
        mock_is_available.return_value = True
        mock_es_search.return_value = [
            {
                "pod_name": "payment-api-xyz",
                "root_cause": "OOM Error",
                "plan_summary": "Restarted deployment and scaled up resources",
                "resolved_at": "2026-05-20"
            }
        ]
        
        gs = GeminiService()
        context = await gs.get_historical_context("OOM Killed")
        
        self.assertIn("Historical Context (Similar Past Incidents via Elasticsearch)", context)
        self.assertIn("payment-api-xyz", context)
        self.assertIn("OOM Error", context)
        mock_es_search.assert_called_once_with(error_logs="OOM Killed", limit=3)
        mock_get_db.assert_not_called() # Fallback MongoDB not called

    @patch('app.services.elasticsearch_service.is_available')
    @patch('app.db.database.get_db')
    async def test_gemini_rag_context_mongodb_fallback(self, mock_get_db, mock_is_available):
        mock_is_available.return_value = False
        
        # Mock MongoDB find results
        mock_find = MagicMock()
        mock_find.sort.return_value.to_list = AsyncMock(return_value=[
            {
                "pod": {"name": "mongo-fallback-pod"},
                "rca": "Database lockout due to network partition",
                "plan_summary": "Re-established network routes",
                "resolved_at": "2026-05-20"
            }
        ])
        
        mock_db = MagicMock()
        mock_db.incidents.find.return_value = mock_find
        mock_get_db.return_value = mock_db
        
        gs = GeminiService()
        context = await gs.get_historical_context("Network lockout")
        
        self.assertIn("Historical Context (Similar Past Incidents via MongoDB Fallback)", context)
        self.assertIn("mongo-fallback-pod", context)
        self.assertIn("Database lockout due to network partition", context)
        mock_get_db.assert_called_once()

    @patch('app.services.elasticsearch_service.is_available')
    @patch('app.services.elasticsearch_service.search_documents')
    async def test_elastic_mcp_local_elasticsearch_logs(self, mock_search, mock_is_available):
        mock_is_available.return_value = True
        
        mock_search.return_value = (
            [
                {
                    "timestamp": "2026-05-20T18:00:00Z",
                    "log_content": "FATAL: Database connection refused"
                }
            ],
            1
        )
        
        mcp = ElasticMCPService()
        logs = await mcp.get_logs_for_service("payment-api")
        
        self.assertIn("FATAL: Database connection refused", logs)
        self.assertIn("2026-05-20T18:00:00Z", logs)
        mock_search.assert_called_once()

    @patch('app.services.elasticsearch_service.Elasticsearch')
    @patch('app.services.elasticsearch_service.settings')
    @patch('app.services.elasticsearch_service.initialize_indices')
    def test_get_es_api_key_auth(self, mock_init_indices, mock_settings, mock_elasticsearch_class):
        # Reset the global cached client first
        from app.services.elasticsearch_service import reset_es_client, get_es
        reset_es_client()
        
        # Configure mocked settings
        mock_settings.ELASTICSEARCH_HOST = "http://mocked-es:9200"
        mock_settings.ELASTICSEARCH_API_KEY = "test-secret-api-key"
        mock_settings.ELASTICSEARCH_USERNAME = ""
        mock_settings.ELASTICSEARCH_PASSWORD = ""
        
        # Mock client ping response to true
        mock_elasticsearch_class.return_value.ping.return_value = True
        
        # Call get_es which initializes the mock Elasticsearch client
        client = get_es()
        
        self.assertIsNotNone(client)
        mock_elasticsearch_class.assert_called_with(
            hosts=["http://mocked-es:9200"],
            request_timeout=30,
            retry_on_timeout=True,
            max_retries=3,
            api_key="test-secret-api-key"
        )
        mock_init_indices.assert_called_once()
        
        # Clean up
        reset_es_client()

if __name__ == '__main__':
    unittest.main()
