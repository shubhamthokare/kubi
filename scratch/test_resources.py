import httpx
import jwt
from datetime import datetime, timezone, timedelta

def generate_token():
    payload = {
        "sub": "dev-sre",
        "username": "dev-sre",
        "role": "admin",
        "org": "kubi-org",
        "scopes": ["sre:read", "sre:write", "admin"],
        "workspace_id": "6a189c3608073d1a9f46974e",
        "exp": datetime.now(timezone.utc) + timedelta(hours=2)
    }
    return jwt.encode(payload, "dummy", algorithm="HS256")

def main():
    token = generate_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "x-cluster-id": "cluster-3xc4pj374"
    }
    url = "http://127.0.0.1:8000/api/resources"
    print(f"Calling {url}...")
    try:
        res = httpx.get(url, headers=headers, timeout=10.0)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
