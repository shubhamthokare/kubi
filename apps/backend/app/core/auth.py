import base64
import json
import hmac
import hashlib
import time
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def base64url_decode(data: str) -> bytes:
    rem = len(data) % 4
    if rem > 0:
        data += '=' * (4 - rem)
    return base64.urlsafe_b64decode(data.encode('utf-8'))

def _make_serializable(obj):
    """Recursively convert non-JSON-serializable objects to strings."""
    if isinstance(obj, (list, tuple)):
        return [_make_serializable(o) for o in obj]
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)

def create_jwt_token(payload: dict, secret_key: str) -> str:
    # Ensure payload is JSON-serializable (e.g., MagicMock objects in tests)
    payload = _make_serializable(payload)
    header = {"alg": "HS256", "typ": "JWT"}
    header_json = json.dumps(header, separators=(',', ':')).encode('utf-8')
    payload_json = json.dumps(payload, separators=(',', ':'), default=str).encode('utf-8')
    
    header_b64 = base64url_encode(header_json)
    payload_b64 = base64url_encode(payload_json)
    
    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(secret_key.encode('utf-8'), signing_input, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)
    
    return f"{header_b64}.{payload_b64}.{signature_b64}"

def decode_jwt_token(token: str, secret_key: str) -> dict:
    parts = token.split('.')
    if len(parts) != 3:
        raise ValueError("Invalid token format")
        
    header_b64, payload_b64, signature_b64 = parts
    
    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    expected_signature = hmac.new(secret_key.encode('utf-8'), signing_input, hashlib.sha256).digest()
    expected_signature_b64 = base64url_encode(expected_signature)
    
    if not hmac.compare_digest(signature_b64.encode('utf-8'), expected_signature_b64.encode('utf-8')):
        raise ValueError("Invalid signature")
        
    payload_json = base64url_decode(payload_b64)
    payload = json.loads(payload_json.decode('utf-8'))
    
    if "exp" in payload and time.time() > payload["exp"]:
        raise ValueError("Token has expired")
        
    return payload

def create_access_token(username: str, role: str, org: str, scopes: list[str], expires_in: int = 3600, workspace_id: str = None) -> str:
    payload = {
        "sub": username,
        "role": role,
        "org": org,
        "scopes": scopes,
        "exp": int(time.time()) + expires_in,
        "iat": int(time.time())
    }
    if workspace_id:
        payload["workspace_id"] = workspace_id
    return create_jwt_token(payload, settings.JWT_SECRET_KEY)

def verify_token_scopes(payload: dict, required_scope: str) -> bool:
    scopes = payload.get("scopes", [])
    if "admin" in scopes:
        return True
    return required_scope in scopes
