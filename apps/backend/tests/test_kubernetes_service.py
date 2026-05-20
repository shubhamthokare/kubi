import unittest
from unittest.mock import MagicMock, patch
from app.services.kubernetes_service import KubernetesService

class TestKubernetesService(unittest.TestCase):
    def setUp(self):
        self.service = KubernetesService(agent_url="http://mock-agent:8080")

    @patch('app.services.kubernetes_service.KubernetesService._get')
    def test_get_failed_pods_empty(self, mock_get):
        # Setup mock response
        mock_get.return_value = {"failed_pods": []}
        
        results = self.service.get_failed_pods()
        
        self.assertEqual(len(results), 0)
        mock_get.assert_called_once_with("/failed_pods?namespace=*")

    @patch('app.services.kubernetes_service.KubernetesService._get')
    def test_get_failed_pods_with_failures(self, mock_get):
        # Setup mock response
        mock_get.return_value = {
            "failed_pods": [
                {
                    "name": "failed-pod",
                    "namespace": "default",
                    "phase": "Failed",
                    "reason": "Error",
                    "message": "Crash",
                    "uid": "123"
                }
            ]
        }
        
        results = self.service.get_failed_pods()
        
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "failed-pod")
        self.assertEqual(results[0]["phase"], "Failed")
        mock_get.assert_called_once_with("/failed_pods?namespace=*")

    @patch('app.services.kubernetes_service.KubernetesService.get_failed_pods')
    def test_verify_pod_health_running(self, mock_failed_pods):
        mock_failed_pods.return_value = []
        
        is_healthy = self.service.verify_pod_health("pod-1", "default")
        self.assertTrue(is_healthy)
        mock_failed_pods.assert_called_once_with(["default"])

if __name__ == '__main__':
    unittest.main()
