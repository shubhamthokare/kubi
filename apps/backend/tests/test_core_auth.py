"""
Unit tests for app.core.auth

Covers:
  - base64url_encode / base64url_decode round-trip
  - create_jwt_token / decode_jwt_token round-trip
  - Token expiry enforcement
  - Invalid signature detection
  - Invalid token format
  - create_access_token with and without workspace_id
  - verify_token_scopes admin bypass, scope matching, missing scope
  - _make_serializable edge cases
"""
import pytest
import time
from unittest.mock import patch, MagicMock

from app.core.auth import (
    base64url_encode,
    base64url_decode,
    create_jwt_token,
    decode_jwt_token,
    create_access_token,
    verify_token_scopes,
    _make_serializable,
)


SECRET = "test-secret-key-for-unit-tests"


# ── base64url round-trip ─────────────────────────────────────────────────

class TestBase64Url:
    def test_encode_decode_roundtrip(self):
        original = b"hello world"
        encoded = base64url_encode(original)
        decoded = base64url_decode(encoded)
        assert decoded == original

    def test_encode_strips_padding(self):
        encoded = base64url_encode(b"a")
        assert "=" not in encoded

    def test_decode_handles_missing_padding(self):
        # "YQ" is base64url for b"a" without padding
        decoded = base64url_decode("YQ")
        assert decoded == b"a"


# ── JWT create / decode round-trip ───────────────────────────────────────

class TestJWT:
    def test_create_and_decode_roundtrip(self):
        payload = {"sub": "alice@example.com", "role": "admin", "scopes": ["sre:read"]}
        token = create_jwt_token(payload, SECRET)
        decoded = decode_jwt_token(token, SECRET)
        assert decoded["sub"] == "alice@example.com"
        assert decoded["role"] == "admin"
        assert decoded["scopes"] == ["sre:read"]

    def test_token_has_three_parts(self):
        token = create_jwt_token({"sub": "x"}, SECRET)
        assert len(token.split(".")) == 3

    def test_expired_token_raises(self):
        payload = {"sub": "x", "exp": int(time.time()) - 100}
        token = create_jwt_token(payload, SECRET)
        with pytest.raises(ValueError, match="expired"):
            decode_jwt_token(token, SECRET)

    def test_invalid_signature_raises(self):
        token = create_jwt_token({"sub": "x"}, SECRET)
        # Tamper with the signature
        parts = token.split(".")
        parts[2] = "INVALID_SIGNATURE_AAAA"
        tampered_token = ".".join(parts)
        with pytest.raises(ValueError, match="Invalid signature"):
            decode_jwt_token(tampered_token, SECRET)

    def test_invalid_format_raises(self):
        with pytest.raises(ValueError, match="Invalid token format"):
            decode_jwt_token("not.a.valid.token.format", SECRET)

    def test_two_parts_raises(self):
        with pytest.raises(ValueError, match="Invalid token format"):
            decode_jwt_token("only.two", SECRET)

    def test_no_exp_field_succeeds(self):
        """Tokens without exp should be decoded successfully."""
        payload = {"sub": "no-expiry"}
        token = create_jwt_token(payload, SECRET)
        decoded = decode_jwt_token(token, SECRET)
        assert decoded["sub"] == "no-expiry"


# ── create_access_token ──────────────────────────────────────────────────

class TestCreateAccessToken:
    @patch("app.core.auth.settings")
    def test_basic_token(self, mock_settings):
        mock_settings.JWT_SECRET_KEY = SECRET
        token = create_access_token(
            username="bob@test.com",
            role="member",
            org="test-org",
            scopes=["sre:read", "sre:write"]
        )
        decoded = decode_jwt_token(token, SECRET)
        assert decoded["sub"] == "bob@test.com"
        assert decoded["role"] == "member"
        assert decoded["org"] == "test-org"
        assert "sre:read" in decoded["scopes"]
        assert "exp" in decoded
        assert "iat" in decoded

    @patch("app.core.auth.settings")
    def test_with_workspace_id(self, mock_settings):
        mock_settings.JWT_SECRET_KEY = SECRET
        token = create_access_token(
            username="bob@test.com",
            role="owner",
            org="org",
            scopes=["sre:read"],
            workspace_id="ws-123"
        )
        decoded = decode_jwt_token(token, SECRET)
        assert decoded["workspace_id"] == "ws-123"

    @patch("app.core.auth.settings")
    def test_without_workspace_id(self, mock_settings):
        mock_settings.JWT_SECRET_KEY = SECRET
        token = create_access_token(
            username="bob@test.com",
            role="viewer",
            org="org",
            scopes=["sre:read"]
        )
        decoded = decode_jwt_token(token, SECRET)
        assert "workspace_id" not in decoded

    @patch("app.core.auth.settings")
    def test_custom_expiry(self, mock_settings):
        mock_settings.JWT_SECRET_KEY = SECRET
        token = create_access_token(
            username="x",
            role="viewer",
            org="org",
            scopes=["sre:read"],
            expires_in=7200
        )
        decoded = decode_jwt_token(token, SECRET)
        assert decoded["exp"] - decoded["iat"] == 7200


# ── verify_token_scopes ──────────────────────────────────────────────────

class TestVerifyTokenScopes:
    def test_admin_bypasses_all(self):
        payload = {"scopes": ["admin"]}
        assert verify_token_scopes(payload, "sre:write") is True
        assert verify_token_scopes(payload, "any:scope") is True

    def test_matching_scope(self):
        payload = {"scopes": ["sre:read", "sre:write"]}
        assert verify_token_scopes(payload, "sre:read") is True

    def test_missing_scope(self):
        payload = {"scopes": ["sre:read"]}
        assert verify_token_scopes(payload, "sre:write") is False

    def test_empty_scopes(self):
        payload = {"scopes": []}
        assert verify_token_scopes(payload, "sre:read") is False

    def test_no_scopes_key(self):
        payload = {}
        assert verify_token_scopes(payload, "sre:read") is False


# ── _make_serializable ───────────────────────────────────────────────────

class TestMakeSerializable:
    def test_simple_types_pass_through(self):
        assert _make_serializable("hello") == "hello"
        assert _make_serializable(42) == 42
        assert _make_serializable(True) is True
        assert _make_serializable(None) is None

    def test_list_recursion(self):
        result = _make_serializable([1, "a", [2, 3]])
        assert result == [1, "a", [2, 3]]

    def test_dict_recursion(self):
        result = _make_serializable({"a": 1, "b": {"c": 2}})
        assert result == {"a": 1, "b": {"c": 2}}

    def test_non_serializable_converted_to_string(self):
        mock = MagicMock()
        result = _make_serializable(mock)
        assert isinstance(result, str)

    def test_tuple_converted_to_list(self):
        result = _make_serializable((1, 2, 3))
        assert result == [1, 2, 3]
