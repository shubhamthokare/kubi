import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import os
from types import SimpleNamespace

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
from resource_context import build_kubernetes_error_context, build_pod_resource_context

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
        self.assertFalse(failed_pods[0]["has_owner"])
        self.assertTrue(failed_pods[0]["is_bare_pod"])
        self.assertIsNone(failed_pods[0]["rollback_target"])

    @patch('main.apps_v1')
    @patch('main.v1')
    def test_get_failed_pods_resolves_deployment_context(self, mock_v1, mock_apps_v1):
        pod_owner = MagicMock()
        pod_owner.kind = "ReplicaSet"
        pod_owner.name = "api-server-7f9b4d"
        pod_owner.controller = True

        mock_pod = MagicMock()
        mock_pod.metadata.name = "api-server-7f9b4d-xk2j9"
        mock_pod.metadata.namespace = "kubi"
        mock_pod.metadata.owner_references = [pod_owner]
        mock_pod.metadata.uid = "pod-uid"
        mock_pod.metadata.creation_timestamp = None
        mock_pod.status.phase = "Pending"
        mock_pod.status.reason = "ImagePullBackOff"
        mock_pod.status.message = "failed to pull image"
        mock_pod.status.container_statuses = None

        deployment_owner = MagicMock()
        deployment_owner.kind = "Deployment"
        deployment_owner.name = "api-server"
        mock_rs = MagicMock()
        mock_rs.metadata.owner_references = [deployment_owner]
        mock_apps_v1.read_namespaced_replica_set.return_value = mock_rs

        mock_pod_list = MagicMock()
        mock_pod_list.items = [mock_pod]
        mock_v1.list_namespaced_pod.return_value = mock_pod_list

        failed_pods = get_failed_pods("kubi")

        self.assertEqual(len(failed_pods), 1)
        self.assertFalse(failed_pods[0]["is_bare_pod"])
        self.assertEqual(failed_pods[0]["owner_kind"], "ReplicaSet")
        self.assertEqual(failed_pods[0]["controller_kind"], "Deployment")
        self.assertEqual(failed_pods[0]["controller_name"], "api-server")
        self.assertEqual(failed_pods[0]["rollback_target"], "api-server")
        self.assertIn("rollback_deployment", failed_pods[0]["valid_actions"])
        self.assertEqual(failed_pods[0]["scenario"], "ImagePullBackOff")

    def test_resource_context_blocks_bare_pod_rollback(self):
        pod = SimpleNamespace(
            metadata=SimpleNamespace(
                name="broke-pod",
                namespace="default",
                owner_references=[],
            ),
            status=SimpleNamespace(
                phase="Failed",
                reason="CrashLoopBackOff",
                message="container restarting",
                init_container_statuses=None,
                container_statuses=None,
            ),
        )
        ctx = build_pod_resource_context(pod, MagicMock(), logger=None)
        self.assertTrue(ctx["is_bare_pod"])
        self.assertEqual(ctx["scenario"], "CrashLoopBackOff")
        self.assertIn("restart_pod", ctx["valid_actions"])
        self.assertIn("rollback_deployment", ctx["invalid_actions"])
        self.assertIn("bare Pod", ctx["redemption_guidance"])

    def test_resource_context_pending_adds_scheduling_guidance(self):
        pod = SimpleNamespace(
            metadata=SimpleNamespace(
                name="heavy-pod",
                namespace="default",
                owner_references=[],
            ),
            status=SimpleNamespace(
                phase="Pending",
                reason=None,
                message="0/1 nodes are available: insufficient cpu",
                init_container_statuses=None,
                container_statuses=None,
            ),
        )
        ctx = build_pod_resource_context(pod, MagicMock(), logger=None)
        self.assertEqual(ctx["scenario"], "Pending")
        self.assertIn("inspect_scheduling", ctx["valid_actions"])
        self.assertEqual(ctx["recommended_action_family"], "scheduling_capacity_or_storage")

    def test_kubernetes_error_context_rbac_and_not_found(self):
        rbac = build_kubernetes_error_context(403, "pods is forbidden", "Pod", "broke-pod", "default")
        self.assertEqual(rbac["scenario"], "RBACForbidden")
        self.assertIn("update_rbac_manifest", rbac["valid_actions"])
        self.assertIn("retry_same_action", rbac["invalid_actions"])

        missing = build_kubernetes_error_context(404, "pods not found", "Pod", "broke-pod", "default")
        self.assertEqual(missing["scenario"], "NotFound")
        self.assertIn("refresh_resource_context", missing["valid_actions"])

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

    @patch('subprocess.run')
    @patch('main.apps_v1')
    def test_rollback_deployment_success(self, mock_apps_v1, mock_run):
        mock_apps_v1.read_namespaced_deployment.return_value = {}
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "deployment.apps/test-deploy rolled back"
        mock_run.return_value = mock_result

        response = self.client.post("/actions/rollback/kubi/test-deploy")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["message"], "deployment.apps/test-deploy rolled back")
        mock_run.assert_called_once_with(
            ["kubectl", "rollout", "undo", "deployment", "test-deploy", "-n", "kubi"],
            capture_output=True,
            text=True,
            timeout=30,
        )

    @patch('subprocess.run')
    @patch('main.apps_v1')
    @patch('main.v1')
    def test_rollback_pod_resolves_owner_deployment(self, mock_v1, mock_apps_v1, mock_run):
        from kubernetes.client.rest import ApiException

        mock_apps_v1.read_namespaced_deployment.side_effect = ApiException(status=404)

        pod_owner = MagicMock()
        pod_owner.kind = "ReplicaSet"
        pod_owner.name = "api-server-7f9b4d"
        mock_pod = MagicMock()
        mock_pod.metadata.owner_references = [pod_owner]
        mock_v1.read_namespaced_pod.return_value = mock_pod

        deployment_owner = MagicMock()
        deployment_owner.kind = "Deployment"
        deployment_owner.name = "api-server"
        mock_rs = MagicMock()
        mock_rs.metadata.owner_references = [deployment_owner]
        mock_apps_v1.read_namespaced_replica_set.return_value = mock_rs

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "deployment.apps/api-server rolled back"
        mock_run.return_value = mock_result

        response = self.client.post("/actions/rollback/kubi/api-server-7f9b4d-xk2j9")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("Resolved pod api-server-7f9b4d-xk2j9 to deployment api-server", data["message"])
        mock_run.assert_called_once_with(
            ["kubectl", "rollout", "undo", "deployment", "api-server", "-n", "kubi"],
            capture_output=True,
            text=True,
            timeout=30,
        )

    @patch('subprocess.run')
    @patch('main.apps_v1')
    @patch('main.v1')
    def test_rollback_bare_pod_returns_actionable_error(self, mock_v1, mock_apps_v1, mock_run):
        from kubernetes.client.rest import ApiException

        mock_apps_v1.read_namespaced_deployment.side_effect = ApiException(status=404)
        mock_pod = MagicMock()
        mock_pod.metadata.owner_references = []
        mock_v1.read_namespaced_pod.return_value = mock_pod

        response = self.client.post("/actions/rollback/default/broke-pod")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["success"])
        self.assertIn("Cannot rollback pod broke-pod", data["message"])
        self.assertIn("not managed by a Deployment", data["message"])
        mock_run.assert_not_called()

    @patch('subprocess.run')
    @patch('main.apps_v1')
    def test_rollback_deployment_failure(self, mock_apps_v1, mock_run):
        mock_apps_v1.read_namespaced_deployment.return_value = {}
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = 'deployment "missing-deploy" not found'
        mock_result.stdout = ""
        mock_run.return_value = mock_result

        response = self.client.post("/actions/rollback/kubi/missing-deploy")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["success"])
        self.assertEqual(data["message"], 'deployment "missing-deploy" not found')

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
