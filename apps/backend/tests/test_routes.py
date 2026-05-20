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
        ks = await get_k8s_service(x_cluster_id="stale-cluster-id")
        # Should return a default KubernetesService
        self.assertEqual(ks.agent_url, "http://localhost:8080")
        
        # Test case B: settings exists, but has empty clusters
        mock_db.settings.find_one.return_value = {
            "id": "system_config",
            "clusters": [],
            "active_cluster_id": None
        }
        ks = await get_k8s_service(x_cluster_id="stale-cluster-id")
        # Should return a disabled cluster config
        self.assertTrue(ks.disabled)
        
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

if __name__ == '__main__':
    unittest.main()
