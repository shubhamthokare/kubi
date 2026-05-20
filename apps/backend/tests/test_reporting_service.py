import unittest
from unittest.mock import MagicMock, patch, AsyncMock
from app.services.reporting_service import ReportingService

class TestReportingService(unittest.IsolatedAsyncioTestCase):
    @patch('app.services.reporting_service.GeminiService')
    def setUp(self, mock_gemini_class):
        self.mock_gemini = MagicMock()
        mock_gemini_class.return_value = self.mock_gemini
        self.service = ReportingService()

    async def test_generate_postmortem_basic(self):
        incident_data = {
            "id": "incident-123",
            "plan_id": "plan-456",
            "pod": {"name": "test-pod"},
            "rca": "Memory leak detected",
            "logs_context": "OOMKilled"
        }
        
        # Mock GeminiService's async generate_postmortem method
        self.mock_gemini.generate_postmortem = AsyncMock(return_value="# Test Report Content")
        
        # Mock the save_report method to avoid actual database calls
        self.service.save_report = AsyncMock()
        
        report = await self.service.generate_postmortem(incident_data)
        
        self.assertEqual(report, "# Test Report Content")
        self.mock_gemini.generate_postmortem.assert_called_once_with(incident_data)
        self.service.save_report.assert_called_once_with("incident-123", "plan-456", "# Test Report Content")

    def test_save_report_structure(self):
        # Placeholder for save_report test
        pass

if __name__ == '__main__':
    unittest.main()
