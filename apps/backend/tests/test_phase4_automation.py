import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
import uuid
import os
import asyncio

from main import app
from app.core.auth import create_access_token
from app.workflows.remediation_workflow import RemediationWorkflow

class TestPhase4Automation(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.read_token = create_access_token(username="sre-reader", role="viewer", org="kubi-org", scopes=["sre:read"])
        self.write_token = create_access_token(username="sre-writer", role="sre-write", org="kubi-org", scopes=["sre:read", "sre:write"])
        
        self.read_headers = {"Authorization": f"Bearer {self.read_token}"}
        self.write_headers = {"Authorization": f"Bearer {self.write_token}"}

    @patch('app.db.database.get_db')
    async def test_playbooks_crud_endpoints(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        
        # Mock database collection find/insert/delete operations
        mock_db.playbooks.insert_one = AsyncMock()
        
        # 1. POST /api/playbooks (Unauthorized SRE read only)
        playbook_payload = {
            "name": "Restart Cleanup Playbook",
            "description": "Cleans up orphan pods and temp workspaces",
            "script_type": "yaml_manifest",
            "content": "apiVersion: v1\nkind: Pod\nmetadata:\n  name: cleanup"
        }
        response = self.client.post("/api/playbooks", json=playbook_payload, headers=self.read_headers)
        self.assertEqual(response.status_code, 403)
        
        # 2. POST /api/playbooks (Authorized SRE write)
        response = self.client.post("/api/playbooks", json=playbook_payload, headers=self.write_headers)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["name"], playbook_payload["name"])
        self.assertEqual(data["script_type"], playbook_payload["script_type"])
        self.assertIn("playbook_id", data)
        mock_db.playbooks.insert_one.assert_called_once()
        
        # 3. GET /api/playbooks (Authorized SRE read)
        playbook_id = data["playbook_id"]
        mock_playbook_doc = {
            "_id": "mock_obj_id",
            "playbook_id": playbook_id,
            "name": "Restart Cleanup Playbook",
            "description": "Cleans up orphan pods and temp workspaces",
            "script_type": "yaml_manifest",
            "content": "apiVersion: v1\nkind: Pod\nmetadata:\n  name: cleanup",
            "created_at": "2026-05-28T20:00:00Z",
            "updated_at": "2026-05-28T20:00:00Z"
        }
        
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[mock_playbook_doc])
        mock_db.playbooks.find.return_value = mock_cursor
        
        response = self.client.get("/api/playbooks", headers=self.read_headers)
        self.assertEqual(response.status_code, 200)
        list_data = response.json()
        self.assertEqual(len(list_data["playbooks"]), 1)
        self.assertEqual(list_data["playbooks"][0]["playbook_id"], playbook_id)
        
        # 4. DELETE /api/playbooks/{id} (Authorized SRE write)
        mock_db.playbooks.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
        response = self.client.delete(f"/api/playbooks/{playbook_id}", headers=self.write_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        mock_db.playbooks.delete_one.assert_called_once_with({"playbook_id": playbook_id})

    @patch('app.api.routes.get_k8s_service')
    @patch('app.db.database.get_db')
    async def test_playbook_execution_yaml(self, mock_get_db, mock_get_k8s):
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        
        mock_k8s = MagicMock()
        mock_k8s.apply_manifest.return_value = (True, "Applied successfully.")
        mock_get_k8s.return_value = mock_k8s
        
        playbook_id = "test-yaml-uuid"
        mock_playbook = {
            "playbook_id": playbook_id,
            "name": "Apply Pod YAML",
            "script_type": "yaml_manifest",
            "content": "apiVersion: v1\nkind: Pod"
        }
        mock_db.playbooks.find_one = AsyncMock(return_value=mock_playbook)
        
        response = self.client.post(f"/api/playbooks/{playbook_id}/execute", headers=self.write_headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn("Playbook executed successfully", response.json()["message"])
        mock_k8s.apply_manifest.assert_called_once_with("apiVersion: v1\nkind: Pod")

    @patch('app.api.routes.get_k8s_service')
    @patch('app.db.database.get_db')
    async def test_playbook_execution_python_sandboxed(self, mock_get_db, mock_get_k8s):
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        
        mock_k8s = MagicMock()
        mock_get_k8s.return_value = mock_k8s
        
        playbook_id = "test-py-uuid"
        # Test a script that prints JSON data and calls k8s service
        python_script = """
import json
print("Hello from sandbox")
# Check standard library access
data = json.dumps({"test": "value"})
print(f"Data: {data}")
"""
        mock_playbook = {
            "playbook_id": playbook_id,
            "name": "Diagnostics Python Script",
            "script_type": "python_script",
            "content": python_script
        }
        mock_db.playbooks.find_one = AsyncMock(return_value=mock_playbook)
        
        response = self.client.post(f"/api/playbooks/{playbook_id}/execute", headers=self.write_headers)
        self.assertEqual(response.status_code, 200)
        logs = response.json()["message"]
        self.assertIn("Hello from sandbox", logs)
        self.assertIn('{"test": "value"}', logs)

    @patch('app.workflows.remediation_workflow.ActionEngine')
    @patch('app.workflows.remediation_workflow.get_db')
    @patch('app.services.chatops_service.get_chatops_service')
    async def test_safe_mode_rollback_guard_degradation(self, mock_get_chatops, mock_get_db, mock_action_engine_class):
        os.environ["SAFE_MODE_DURATION_SECS"] = "1"
        os.environ["SAFE_MODE_POLL_INTERVAL"] = "1"
        
        # Setup Mocks
        mock_db = MagicMock()
        mock_db.plans.update_one = AsyncMock()
        mock_db.incidents.update_one = AsyncMock()
        mock_get_db.return_value = mock_db
        
        mock_action_engine = MagicMock()
        mock_action_engine.k8s_service.verify_deployment_health.return_value = False
        mock_action_engine.k8s_service.rollback_deployment.return_value = (True, "Simulated rollback success")
        mock_action_engine_class.return_value = mock_action_engine
        
        mock_chatops = AsyncMock()
        mock_get_chatops.return_value = mock_chatops
        
        # Trigger safe-mode rollback loop
        workflow = RemediationWorkflow()
        await workflow.monitor_safe_mode(
            plan_id="test-plan-id",
            action_type="restart_deployment",
            target_name="nginx-deployment",
            namespace="default",
            duration_secs=1
        )
        
        # Verify database statuses are updated correctly to reflect rollback
        mock_db.plans.update_one.assert_called_once_with(
            {"plan_id": "test-plan-id"},
            {"$set": {"status": "rolled_back", "rollback_reason": "Health degraded during safe-mode monitoring: Simulated rollback success"}}
        )
        mock_db.incidents.update_one.assert_called_once_with(
            {"plan_id": "test-plan-id"},
            {"$set": {"status": "rolled_back", "resolved_at": None}}
        )
        
        # Assert ChatOps notification was dispatched
        mock_chatops.notify_remediation.assert_called_once()
        call_kwargs = mock_chatops.notify_remediation.call_args[1]
        self.assertEqual(call_kwargs["status"], "rolled_back")
        self.assertIn("Auto-rollback triggered", call_kwargs["actions_summary"])
        
        # Cleanup env vars
        os.environ.pop("SAFE_MODE_DURATION_SECS", None)
        os.environ.pop("SAFE_MODE_POLL_INTERVAL", None)

if __name__ == '__main__':
    unittest.main()
