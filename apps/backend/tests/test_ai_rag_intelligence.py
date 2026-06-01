import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from datetime import datetime
from bson import ObjectId
import json

from main import app
from app.services.gemini_service import GeminiService, RemediationPlan
from app.core.security import rate_limiter

class TestAiRagIntelligence(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        rate_limiter._requests = {}

    @patch('app.db.database.get_db')
    @patch('app.workflows.remediation_workflow.get_db')
    def test_feedback_approval_and_rejection_apis(self, mock_get_db_workflow, mock_get_db_database):
        client = TestClient(app)
        
        # 1. Setup Database Mock using attribute access
        mock_db = MagicMock()
        mock_plans = MagicMock()
        mock_incidents = MagicMock()
        mock_settings = MagicMock()
        
        mock_db.plans = mock_plans
        mock_db.incidents = mock_incidents
        mock_db.settings = mock_settings
        
        # Also map item access just in case
        mock_db.__getitem__.side_effect = lambda name: {
            "plans": mock_plans,
            "incidents": mock_incidents,
            "settings": mock_settings
        }[name]
        mock_get_db_workflow.return_value = mock_db
        mock_get_db_database.return_value = mock_db
        
        plan_id = "test-plan-123"
        
        # Mock active plan and incident entries
        mock_plans.find_one = AsyncMock(return_value={
            "plan_id": plan_id,
            "status": "pending_approval",
            "plan": {
                "actions": [
                    {
                        "action_type": "restart_pod",
                        "target_name": "test-pod",
                        "namespace": "default",
                        "reason": "unstable"
                    }
                ],
                "summary": "restart unstable pod"
            }
        })
        
        mock_incidents.find_one = AsyncMock(return_value={
            "_id": ObjectId(),
            "plan_id": plan_id,
            "pod": {"name": "test-pod", "namespace": "default"},
            "status": "active"
        })
        
        mock_settings.find_one = AsyncMock(return_value={
            "id": "system_config",
            "clusters": [
                {
                    "id": "my-cluster-1",
                    "name": "Cluster 1",
                    "auth_type": "agent",
                    "agent_url": "http://cluster-1:8080"
                }
            ],
            "active_cluster_id": "my-cluster-1"
        })
        mock_plans.update_one = AsyncMock(return_value=MagicMock())
        mock_incidents.update_one = AsyncMock(return_value=MagicMock())
        
        # Mock actual action engine execution and postmortem generation
        with patch('app.workflows.remediation_workflow.ActionEngine') as MockActionEngine, \
             patch('app.workflows.remediation_workflow.ReportingService') as MockReportingService:
            
            mock_action = MagicMock()
            mock_action.execute_plan = AsyncMock(return_value=[{"action_type": "restart_pod", "target_name": "test-pod", "success": True}])
            mock_action.k8s_service.verify_pod_health = MagicMock(return_value=True)
            MockActionEngine.return_value = mock_action
            
            mock_report = MagicMock()
            mock_report.generate_postmortem = AsyncMock(return_value="postmortem report")
            MockReportingService.return_value = mock_report
            
            # Auth token setup
            from app.core.auth import create_access_token
            token = create_access_token(username="admin@kubi.ai", role="admin", org="kubi-org", scopes=["sre:read", "sre:write", "admin"])
            headers = {"Authorization": f"Bearer {token}"}
            
            # Test POST /api/plans/{id}/approve with feedback
            payload = {
                "rating": 5,
                "feedback": "Outstanding automatic remediation action proposal."
            }
            
            response = client.post(f"/api/plans/{plan_id}/approve", json=payload, headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "completed")
            
            # Verify update statements were triggered with rating and feedback
            mock_plans.update_one.assert_any_call(
                {"plan_id": plan_id},
                {"$set": {"status": "executing", "rating": 5, "feedback": "Outstanding automatic remediation action proposal."}}
            )

    @patch('app.db.database.get_db')
    async def test_historical_context_sre_feedback_rag(self, mock_get_db):
        service = GeminiService()
        
        # Setup Database Mock
        mock_db = MagicMock()
        mock_incidents = MagicMock()
        mock_db.incidents = mock_incidents
        mock_db.__getitem__.return_value = mock_incidents
        mock_get_db.return_value = mock_db
        
        # Mock active incident list containing operator feedback metrics
        mock_incidents.find = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.sort = MagicMock(return_value=mock_cursor)
        mock_cursor.to_list = AsyncMock(return_value=[
            {
                "pod": {"name": "frontend-service-xyz"},
                "rca": "Crash due to DB connection timeout.",
                "plan_summary": "Perform rolling restart.",
                "rating": 5,
                "feedback": "Perfect recovery of front-end dashboard.",
                "resolved_at": datetime.utcnow()
            }
        ])
        mock_incidents.find.return_value = mock_cursor
        
        with patch('app.services.gemini_service.settings.ELASTICSEARCH_HOST', ''): # Force fallback to Mongo
            context = await service.get_historical_context("DB connection timeout")
            
        self.assertIn("frontend-service-xyz", context)
        self.assertIn("Perfect recovery of front-end dashboard", context)
        self.assertIn("Operator Rating: 5/5 stars", context)

    @patch('app.db.database.get_db')
    @patch('app.services.gemini_service.os.environ', {})
    @patch('app.services.gemini_service.genai.Client')
    async def test_multi_model_orchestration_outage_fallback(self, mock_genai_client, mock_get_db):
        # Setup database mock to return empty settings cleanly
        mock_db = MagicMock()
        mock_db.settings.find_one = AsyncMock(return_value=None)
        mock_get_db.return_value = mock_db
        
        # Setup mock clients where primary model raises exception
        mock_client = MagicMock()
        
        async def mock_generate(*args, **kwargs):
            raise Exception("Gemini Quota Limit Exceeded")
            
        mock_client.aio.models.generate_content = mock_generate
        mock_genai_client.return_value = mock_client
        
        service = GeminiService()
        
        # 1. Verify fallback when primary Gemini client throws exceptions - falls back to simulated fallback
        rca_res = await service.analyze_incident("billing-pod", "CrashLoopBackOff", "database connection error")
        self.assertIn("CrashLoopBackOff", rca_res)
        self.assertIn("FALLBACK SRE ENGINE", rca_res)

        # 2. Verify Anthropic Claude dynamic HTTP fallback path when key is set
        with patch('app.services.gemini_service.os.environ', {"ANTHROPIC_API_KEY": "sk-ant-test"}), \
             patch('app.services.gemini_service.httpx.AsyncClient') as MockHTTPClient:
            
            mock_http = MagicMock()
            mock_res = MagicMock()
            mock_res.status_code = 200
            mock_res.json.return_value = {
                "content": [{"text": "### 📋 Executive Summary\nBilling pod crashed due to DNS timeout."}]
            }
            mock_http.post = AsyncMock(return_value=mock_res)
            MockHTTPClient.return_value.__aenter__.return_value = mock_http
            
            rca_claude = await service.analyze_incident("billing-pod", "CrashLoopBackOff", "database connection error")
            self.assertIn("Executive Summary", rca_claude)
            self.assertIn("billing pod crashed due to dns timeout", rca_claude.lower())

if __name__ == '__main__':
    unittest.main()
