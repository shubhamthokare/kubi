import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import time
import requests
import json

from main import app
from app.core.vault import get_secret
import app.core.vault as vault
from app.core.auth import (
    create_access_token, decode_jwt_token, verify_token_scopes,
    create_jwt_token
)
from app.core.security import rate_limiter

class TestPhase1Security(unittest.TestCase):
    def setUp(self):
        vault._vault_loaded = False
        vault._vault_cache = {}
        rate_limiter._requests = {}

    @patch('app.core.vault.requests.get')
    def test_vault_kv_v2_success(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "data": {
                    "GEMINI_API_KEY": "vault-gemini-key",
                    "MONGODB_URL": "vault-mongodb-url"
                }
            }
        }
        mock_get.return_value = mock_response

        with patch('app.core.vault.VAULT_ADDR', 'http://vault-test:8200'), \
             patch('app.core.vault.VAULT_TOKEN', 'test-token'):
            val = get_secret("GEMINI_API_KEY")
            self.assertEqual(val, "vault-gemini-key")
            
            val_fallback = get_secret("NON_EXISTENT_KEY", "fallback-default")
            self.assertEqual(val_fallback, "fallback-default")

    @patch('app.core.vault.requests.get')
    def test_vault_kv_v1_success(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "GEMINI_API_KEY": "vault-v1-gemini-key"
            }
        }
        mock_get.return_value = mock_response

        with patch('app.core.vault.VAULT_ADDR', 'http://vault-test:8200'), \
             patch('app.core.vault.VAULT_TOKEN', 'test-token'):
            val = get_secret("GEMINI_API_KEY")
            self.assertEqual(val, "vault-v1-gemini-key")

    def test_vault_fallback_to_env(self):
        with patch('app.core.vault.VAULT_ADDR', ''), \
             patch.dict('os.environ', {'TEST_ENV_VAR': 'env-value'}):
            val = get_secret("TEST_ENV_VAR")
            self.assertEqual(val, "env-value")

    def test_jwt_signature_and_scopes(self):
        secret = "test-secret-key-12345"
        payload = {
            "sub": "user-sre",
            "scopes": ["sre:read"],
            "exp": int(time.time()) + 10
        }
        
        token = create_jwt_token(payload, secret)
        
        decoded = decode_jwt_token(token, secret)
        self.assertEqual(decoded["sub"], "user-sre")
        self.assertEqual(decoded["scopes"], ["sre:read"])
        
        self.assertTrue(verify_token_scopes(decoded, "sre:read"))
        self.assertFalse(verify_token_scopes(decoded, "sre:write"))
        
        admin_payload = {"scopes": ["admin"]}
        self.assertTrue(verify_token_scopes(admin_payload, "sre:write"))

        tampered_token = token[:-5] + "aaaaa"
        with self.assertRaises(ValueError):
            decode_jwt_token(tampered_token, secret)
            
        expired_payload = {
            "sub": "user-sre",
            "scopes": ["sre:read"],
            "exp": int(time.time()) - 10
        }
        expired_token = create_jwt_token(expired_payload, secret)
        with self.assertRaises(ValueError):
            decode_jwt_token(expired_token, secret)

    def test_dev_token_generation_endpoint(self):
        client = TestClient(app)
        with patch('app.api.auth_routes.settings.ENVIRONMENT', 'development'):
            response = client.get("/api/auth/dev-token?username=test-user&scopes=sre:read,admin")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["username"], "test-user")
            self.assertEqual(data["scopes"], ["sre:read", "admin"])
            self.assertIn("access_token", data)

    def test_login_routes_fallback_redirection(self):
        client = TestClient(app)
        with patch('app.api.auth_routes.settings.SSO_CLIENT_ID', ''), \
             patch('app.api.auth_routes.settings.ENVIRONMENT', 'development'):
            response = client.get("/api/auth/login/google", follow_redirects=False)
            self.assertEqual(response.status_code, 307)
            self.assertIn("/auth/callback?code=mock_dev_code&state=google", response.headers["location"])

    @patch('app.db.database.get_db')
    def test_protected_routes_authorization(self, mock_get_db):
        client = TestClient(app)
        
        # Mock database and system_config settings
        from unittest.mock import AsyncMock
        mock_db = MagicMock()
        mock_db.settings.find_one = AsyncMock(return_value={
            "id": "system_config",
            "clusters": [
                {
                    "id": "kubi-internal-agent",
                    "name": "Local Agent",
                    "agent_url": "http://localhost:8080"
                }
            ],
            "active_cluster_id": "kubi-internal-agent"
        })
        mock_get_db.return_value = mock_db
        
        response = client.get("/api/plans")
        self.assertEqual(response.status_code, 401)
        
        read_only_token = create_access_token(username="readonly", role="viewer", org="kubi-org", scopes=["sre:read"])
        headers = {"Authorization": f"Bearer {read_only_token}"}
        
        response = client.post("/api/scan", headers=headers)
        self.assertEqual(response.status_code, 403)
        
        write_token = create_access_token(username="writer", role="sre-write", org="kubi-org", scopes=["sre:read", "sre:write"])
        headers_write = {"Authorization": f"Bearer {write_token}"}
        
        with patch('app.workflows.incident_detection.IncidentDetectionWorkflow.run_scan') as mock_run:
            mock_run.return_value = {"status": "success", "incidents_detected": 0}
            response = client.post("/api/scan", headers=headers_write)
            self.assertEqual(response.status_code, 200)

    def test_sliding_window_rate_limiter(self):
        ip = "192.168.1.50"
        rate_limiter._requests[ip] = []
        
        with patch('time.time') as mock_time:
            mock_time.return_value = 1000.0
            rate_limiter.check_rate_limit(ip, limit=3, window=2)
            rate_limiter.check_rate_limit(ip, limit=3, window=2)
            rate_limiter.check_rate_limit(ip, limit=3, window=2)
            
            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as context:
                rate_limiter.check_rate_limit(ip, limit=3, window=2)
            self.assertEqual(context.exception.status_code, 429)
            
            # Advance time beyond the 2-second window deterministically
            mock_time.return_value = 1002.5
            rate_limiter.check_rate_limit(ip, limit=3, window=2)

    def test_google_login_defaults_to_select_account(self):
        client = TestClient(app)
        with patch('app.api.auth_routes.settings.SSO_CLIENT_ID', 'test_client_id'), \
             patch('app.api.auth_routes.settings.SSO_CLIENT_SECRET', 'test_client_secret'), \
             patch('app.api.auth_routes.settings.SSO_REDIRECT_URI', 'https://localhost/callback'), \
             patch('app.api.auth_routes.settings.ENVIRONMENT', 'production'):
            response = client.get("/api/auth/login/google", follow_redirects=False)
            self.assertEqual(response.status_code, 307)
            location = response.headers["location"]
            self.assertIn("prompt=select_account", location)
            self.assertIn("client_id=test_client_id", location)

if __name__ == '__main__':
    unittest.main()
