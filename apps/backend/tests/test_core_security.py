"""
Unit tests for app.core.security

Covers:
  - InMemoryRateLimiter: within limit, exactly at limit, over limit, window expiry
  - get_current_user_with_scope dependency: valid token, missing token, invalid token, missing scope
  - rate_limit dependency: x-forwarded-for, x-real-ip, client.host extraction
"""
import pytest
import time
from unittest.mock import patch, MagicMock
from fastapi import HTTPException

from app.core.security import InMemoryRateLimiter, get_current_user_with_scope, rate_limit


# ── InMemoryRateLimiter ──────────────────────────────────────────────────

class TestInMemoryRateLimiter:
    def test_within_limit(self):
        rl = InMemoryRateLimiter()
        for _ in range(5):
            rl.check_rate_limit("127.0.0.1", 10)  # Should not raise

    def test_exactly_at_limit_raises(self):
        rl = InMemoryRateLimiter()
        for _ in range(5):
            rl.check_rate_limit("10.0.0.1", 5)
        with pytest.raises(HTTPException) as exc_info:
            rl.check_rate_limit("10.0.0.1", 5)
        assert exc_info.value.status_code == 429

    def test_different_ips_independent(self):
        rl = InMemoryRateLimiter()
        for _ in range(5):
            rl.check_rate_limit("10.0.0.1", 5)
        # Different IP should still be within limit
        rl.check_rate_limit("10.0.0.2", 5)

    def test_window_expiry(self):
        rl = InMemoryRateLimiter()
        # Fill the bucket
        for _ in range(5):
            rl.check_rate_limit("10.0.0.3", 5, window=1)
        # Wait for window to expire
        time.sleep(1.1)
        # Should be allowed again
        rl.check_rate_limit("10.0.0.3", 5, window=1)

    def test_old_entries_cleaned(self):
        rl = InMemoryRateLimiter()
        rl.check_rate_limit("10.0.0.4", 2, window=1)
        time.sleep(1.1)
        # Old entry expired; two more should be allowed
        rl.check_rate_limit("10.0.0.4", 2, window=1)
        rl.check_rate_limit("10.0.0.4", 2, window=1)
        with pytest.raises(HTTPException):
            rl.check_rate_limit("10.0.0.4", 2, window=1)


# ── get_current_user_with_scope ──────────────────────────────────────────

class TestGetCurrentUserWithScope:
    def test_missing_credentials_raises_401(self):
        dep = get_current_user_with_scope("sre:read")
        with pytest.raises(HTTPException) as exc_info:
            dep(credentials=None)
        assert exc_info.value.status_code == 401

    @patch("app.core.security.decode_jwt_token")
    @patch("app.core.security.verify_token_scopes", return_value=True)
    def test_valid_token_returns_payload(self, mock_verify, mock_decode):
        mock_decode.return_value = {"sub": "alice", "scopes": ["sre:read"]}
        dep = get_current_user_with_scope("sre:read")
        creds = MagicMock()
        creds.credentials = "valid_token"
        result = dep(credentials=creds)
        assert result["sub"] == "alice"

    @patch("app.core.security.decode_jwt_token", side_effect=ValueError("expired"))
    def test_invalid_token_raises_401(self, mock_decode):
        dep = get_current_user_with_scope("sre:read")
        creds = MagicMock()
        creds.credentials = "bad_token"
        with pytest.raises(HTTPException) as exc_info:
            dep(credentials=creds)
        assert exc_info.value.status_code == 401

    @patch("app.core.security.decode_jwt_token")
    @patch("app.core.security.verify_token_scopes", return_value=False)
    def test_missing_scope_raises_403(self, mock_verify, mock_decode):
        mock_decode.return_value = {"sub": "alice", "scopes": ["sre:read"]}
        dep = get_current_user_with_scope("sre:write")
        creds = MagicMock()
        creds.credentials = "valid_token"
        with pytest.raises(HTTPException) as exc_info:
            dep(credentials=creds)
        assert exc_info.value.status_code == 403


# ── rate_limit dependency IP extraction ──────────────────────────────────

class TestRateLimitIPExtraction:
    @pytest.mark.asyncio
    async def test_x_forwarded_for(self):
        dep = rate_limit(100)
        request = MagicMock()
        request.headers = {"x-forwarded-for": "192.168.1.1, 10.0.0.1"}
        request.url.path = "/api/test"
        request.client.host = "127.0.0.1"
        await dep(request)  # Should not raise

    @pytest.mark.asyncio
    async def test_x_real_ip(self):
        dep = rate_limit(100)
        request = MagicMock()
        headers_mock = MagicMock()
        headers_mock.get = MagicMock(side_effect=lambda key, default=None: {"x-forwarded-for": None, "x-real-ip": "172.16.0.1"}.get(key, default))
        request.headers = headers_mock
        request.url.path = "/api/test2"
        request.client.host = "127.0.0.1"
        await dep(request)

    @pytest.mark.asyncio
    async def test_fallback_to_client_host(self):
        dep = rate_limit(100)
        request = MagicMock()
        headers_mock = MagicMock()
        headers_mock.get = MagicMock(return_value=None)
        request.headers = headers_mock
        request.url.path = "/api/test3"
        request.client.host = "10.0.0.99"
        await dep(request)

    @pytest.mark.asyncio
    @patch("app.core.security.decode_jwt_token")
    async def test_admin_rate_limit_raise(self, mock_decode):
        # Set rate limit to 2
        dep = rate_limit(2)
        
        request = MagicMock()
        headers_mock = MagicMock()
        headers_mock.get = MagicMock(side_effect=lambda key, default=None: {
            "Authorization": "Bearer admin_token",
            "x-forwarded-for": None,
            "x-real-ip": None
        }.get(key, default))
        request.headers = headers_mock
        request.url.path = "/api/test_admin"
        request.client.host = "127.0.0.1"
        
        # Mock decode to return admin scope
        mock_decode.return_value = {"scopes": ["admin"], "role": "admin"}
        
        # Should allow up to 100 requests
        for _ in range(100):
            await dep(request)
            
        # 101st request should raise 429
        with pytest.raises(HTTPException) as exc_info:
            await dep(request)
        assert exc_info.value.status_code == 429


