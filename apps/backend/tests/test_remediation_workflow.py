import unittest
from unittest.mock import MagicMock, patch, AsyncMock
from app.workflows.remediation_workflow import RemediationWorkflow

class TestRemediationWorkflow(unittest.IsolatedAsyncioTestCase):
    @patch('app.workflows.remediation_workflow.ActionEngine')
    @patch('app.workflows.remediation_workflow.ReportingService')
    async def asyncSetUp(self, mock_reporting_class, mock_action_class):
        self.mock_action_engine = MagicMock()
        mock_action_class.return_value = self.mock_action_engine
        self.mock_reporting_service = MagicMock()
        mock_reporting_class.return_value = self.mock_reporting_service
        self.workflow = RemediationWorkflow()

    @patch('app.workflows.remediation_workflow.get_db')
    async def test_store_plan(self, mock_get_db):
        mock_db = MagicMock()
        mock_db.plans.insert_one = AsyncMock()
        mock_get_db.return_value = mock_db
        
        mock_plan = MagicMock()
        mock_plan.model_dump.return_value = {"actions": []}
        
        plan_id = await self.workflow.store_plan(mock_plan)
        
        self.assertIsNotNone(plan_id)
        mock_db.plans.insert_one.assert_called_once()
        # Verify plan_id is in the call args
        call_args = mock_db.plans.insert_one.call_args[0][0]
        self.assertEqual(call_args["plan_id"], plan_id)
        self.assertEqual(call_args["status"], "pending_approval")

    @patch('app.workflows.remediation_workflow.get_db')
    async def test_reject_plan_success(self, mock_get_db):
        mock_db = MagicMock()
        mock_db.plans.find_one = AsyncMock(return_value={"plan_id": "test-id"})
        mock_db.plans.update_one = AsyncMock()
        mock_get_db.return_value = mock_db
        
        result = await self.workflow.reject_plan("test-id")
        
        self.assertEqual(result["status"], "rejected")
        mock_db.plans.update_one.assert_called_once_with(
            {"plan_id": "test-id"}, 
            {"$set": {"status": "rejected"}}
        )

if __name__ == '__main__':
    unittest.main()
