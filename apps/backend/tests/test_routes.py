import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from app.api.routes import get_k8s_service

class TestRoutesFallback(unittest.IsolatedAsyncioTestCase):
    @patch('app.db.database.get_db')
    async def test_get_k8s_service_fallback(self, mock_get_db):
        # 1. Mock DB and settings
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        
        # Async mock for db.settings.find_one
        mock_db.settings.find_one = AsyncMock()
        
        # Test case A: settings is None
        mock_db.settings.find_one.return_value = None
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            await get_k8s_service(x_cluster_id="stale-cluster-id")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("No registered cluster connections exist", ctx.exception.detail)
        
        # Test case B: settings exists, but has empty clusters
        mock_db.settings.find_one.return_value = {
            "id": "system_config",
            "clusters": [],
            "active_cluster_id": None
        }
        with self.assertRaises(HTTPException) as ctx2:
            await get_k8s_service(x_cluster_id="stale-cluster-id")
        self.assertEqual(ctx2.exception.status_code, 400)
        self.assertIn("No registered cluster connections exist", ctx2.exception.detail)
        
        # Test case C: settings exists, clusters exist, active_cluster_id is set
        mock_db.settings.find_one.return_value = {
            "id": "system_config",
            "clusters": [
                {
                    "id": "my-cluster-1",
                    "name": "Cluster 1",
                    "auth_type": "agent",
                    "agent_url": "http://cluster-1:8080"
                },
                {
                    "id": "my-cluster-2",
                    "name": "Cluster 2",
                    "auth_type": "agent",
                    "agent_url": "http://cluster-2:8080"
                }
            ],
            "active_cluster_id": "my-cluster-2"
        }
        
        # When querying for existing cluster
        ks = await get_k8s_service(x_cluster_id="my-cluster-1")
        self.assertEqual(ks.agent_url, "http://cluster-1:8080")
        
        # When querying with a stale / missing cluster ID, it should fall back to active_cluster_id
        ks = await get_k8s_service(x_cluster_id="stale-cluster-id")
        self.assertEqual(ks.agent_url, "http://cluster-2:8080")
        
        # When querying with no cluster ID, it should fall back to active_cluster_id
        ks = await get_k8s_service(x_cluster_id=None)
        self.assertEqual(ks.agent_url, "http://cluster-2:8080")
        
        # Test case D: settings exists, clusters exist, active_cluster_id is stale / missing
        mock_db.settings.find_one.return_value = {
            "id": "system_config",
            "clusters": [
                {
                    "id": "my-cluster-1",
                    "name": "Cluster 1",
                    "auth_type": "agent",
                    "agent_url": "http://cluster-1:8080"
                }
            ],
            "active_cluster_id": "deleted-cluster"
        }
        
        # Stale x_cluster_id and stale active_cluster_id should fall back to the first available cluster in list
        ks = await get_k8s_service(x_cluster_id="stale-cluster-id")
        self.assertEqual(ks.agent_url, "http://cluster-1:8080")

        # Test case E: settings resolution with workspace_id from Request context
        mock_request = MagicMock()
        mock_request.headers = {
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3b3Jrc3BhY2VfaWQiOiJ0ZXN0X3dzXzEyMyJ9.sig",
            "x-cluster-id": "workspace-cluster"
        }
        
        mock_db.settings.find_one.reset_mock()
        mock_db.settings.find_one.return_value = {
            "id": "workspace_test_ws_123",
            "clusters": [
                {
                    "id": "workspace-cluster",
                    "name": "Workspace Cluster",
                    "auth_type": "agent",
                    "agent_url": "http://workspace-cluster:8080"
                }
            ],
            "active_cluster_id": "workspace-cluster"
        }
        
        with patch('app.core.auth.decode_jwt_token') as mock_decode:
            mock_decode.return_value = {"workspace_id": "test_ws_123"}
            ks = await get_k8s_service(x_cluster_id=None, request=mock_request)
            
        mock_db.settings.find_one.assert_any_call({"id": "workspace_test_ws_123"})
        self.assertEqual(ks.agent_url, "http://workspace-cluster:8080")

    @patch('app.db.database.get_db')
    async def test_get_performance_stats_real_data(self, mock_get_db):
        from app.api.routes import get_performance_stats
        
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        
        mock_find_cursor = MagicMock()
        mock_db.incidents.find.return_value = mock_find_cursor
        
        # First 4 months return no incidents, last month returns 2 incidents (1 critical, 1 high)
        mock_find_cursor.to_list = AsyncMock()
        mock_find_cursor.to_list.side_effect = [
            [], [], [], [],
            [
                {"severity": "critical", "org": "kubi-org"},
                {"severity": "high", "org": "kubi-org"}
            ]
        ]
        
        mock_ks = MagicMock()
        mock_ks.get_performance_metrics.return_value = {
            "cpu": 45,
            "memory": 60,
            "network": 15
        }
        
        current_user = {"role": "admin", "org": "kubi-org"}
        
        res = await get_performance_stats(current_user=current_user, ks=mock_ks)
        
        self.assertIn("performance", res)
        self.assertIn("incident_trends", res)
        
        trends = res["incident_trends"]
        self.assertEqual(len(trends), 5)
        
        # Verify mock fallback is eliminated and returns zero counts
        for i in range(4):
            self.assertEqual(trends[i]["critical"], 0)
            self.assertEqual(trends[i]["high"], 0)
            self.assertEqual(trends[i]["medium"], 0)
            self.assertEqual(trends[i]["low"], 0)
            
        # Verify real database counts are returned for the last month
        self.assertEqual(trends[4]["critical"], 1)
        self.assertEqual(trends[4]["high"], 1)
        self.assertEqual(trends[4]["medium"], 0)
        self.assertEqual(trends[4]["low"], 0)

if __name__ == '__main__':
    unittest.main()
