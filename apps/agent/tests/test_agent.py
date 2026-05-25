import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import os

# Set environment variables for testing before importing the app
os.environ["KUBI_BACKEND_URL"] = "http://localhost:8000"
os.environ["CLUSTER_ID"] = "test-cluster"
os.environ["TARGET_NAMESPACE"] = "kubi"
os.environ["SCAN_INTERVAL"] = "999"

with patch('kubernetes.config.load_incluster_config'), \
     patch('kubernetes.config.load_kube_config'), \
     patch('kubernetes.client.CoreV1Api'), \
     patch('kubernetes.client.AppsV1Api'):
    from main import app, get_failed_pods

class TestAgentService(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_healthz(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["cluster_id"], "test-cluster")

    @patch('main.v1')
    def test_get_failed_pods_empty(self, mock_v1):
        mock_pod_list = MagicMock()
        mock_pod_list.items = []
        mock_v1.list_namespaced_pod.return_value = mock_pod_list

        failed_pods = get_failed_pods("kubi")
        self.assertEqual(len(failed_pods), 0)
        mock_v1.list_namespaced_pod.assert_called_once_with(namespace="kubi")

    @patch('main.v1')
    def test_get_failed_pods_with_failures(self, mock_v1):
        # Create a mock failed pod
        mock_pod = MagicMock()
        mock_pod.metadata.name = "failing-pod"
        mock_pod.metadata.namespace = "kubi"
        mock_pod.status.phase = "Failed"
        mock_pod.status.reason = "Evicted"
        mock_pod.status.message = "Pod was evicted from node"
        mock_pod.status.container_statuses = None
        mock_pod.metadata.uid = "123-abc"
        mock_pod.metadata.creation_timestamp = None
        mock_pod.metadata.owner_references = []

        mock_pod_list = MagicMock()
        mock_pod_list.items = [mock_pod]
        mock_v1.list_namespaced_pod.return_value = mock_pod_list

        failed_pods = get_failed_pods("kubi")
        self.assertEqual(len(failed_pods), 1)
        self.assertEqual(failed_pods[0]["name"], "failing-pod")
        self.assertEqual(failed_pods[0]["reason"], "Evicted")

    @patch('main.v1')
    def test_get_stats_success(self, mock_v1):
        mock_nodes = MagicMock()
        mock_nodes.items = []
        mock_v1.list_node.return_value = mock_nodes

        mock_pods = MagicMock()
        mock_pods.items = []
        mock_v1.list_pod_for_all_namespaces.return_value = mock_pods

        mock_namespaces = MagicMock()
        mock_namespaces.items = []
        mock_v1.list_namespace.return_value = mock_namespaces

        response = self.client.get("/stats")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["namespaces"], 0)
        self.assertEqual(data["uptime"], "N/A")

    @patch('main.v1')
    @patch('main.apps_v1')
    def test_get_resources(self, mock_apps_v1, mock_v1):
        mock_namespaces = MagicMock()
        mock_namespaces.items = []
        mock_v1.list_namespace.return_value = mock_namespaces

        mock_deployments = MagicMock()
        mock_deployments.items = []
        mock_apps_v1.list_deployment_for_all_namespaces.return_value = mock_deployments

        mock_pods = MagicMock()
        mock_pods.items = []
        mock_v1.list_pod_for_all_namespaces.return_value = mock_pods

        response = self.client.get("/resources")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["namespaces"], [])
        self.assertEqual(data["deployments"], [])

    @patch('main.v1')
    def test_get_logs_success(self, mock_v1):
        mock_v1.read_namespaced_pod_log.return_value = "pod logs trace here"

        response = self.client.get("/logs/kubi/test-pod?tail_lines=10")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["logs"], "pod logs trace here")
        mock_v1.read_namespaced_pod_log.assert_called_once_with(name="test-pod", namespace="kubi", tail_lines=10)

    @patch('main.apps_v1')
    def test_restart_deployment_success(self, mock_apps_v1):
        mock_apps_v1.patch_namespaced_deployment.return_value = {}

        response = self.client.post("/actions/restart/kubi/test-deploy")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["message"], "Deployment test-deploy restarted.")

    @patch('main.v1')
    def test_delete_pod_success(self, mock_v1):
        mock_v1.delete_namespaced_pod.return_value = {}

        response = self.client.delete("/actions/pod/kubi/test-pod")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["message"], "Pod test-pod deleted successfully.")

    @patch('subprocess.run')
    def test_apply_manifest_success(self, mock_run):
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "deployment.apps/test applied"
        mock_run.return_value = mock_result

        payload = {"manifest": "apiVersion: apps/v1\nkind: Deployment"}
        response = self.client.post("/actions/apply", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["message"], "deployment.apps/test applied")

if __name__ == '__main__':
    unittest.main()
