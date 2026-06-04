import asyncio
import os
import sys
import httpx
from pymongo import MongoClient
import jwt
from datetime import datetime, timedelta, timezone

def generate_token(workspace_id):
    payload = {
        "sub": "dev-sre",
        "username": "dev-sre",
        "role": "admin",
        "org": "kubi-org",
        "scopes": ["sre:read", "sre:write", "admin"],
        "workspace_id": workspace_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2)
    }
    return jwt.encode(payload, "dummy", algorithm="HS256")

def main():
    # Connect to local MongoDB
    client = MongoClient("mongodb://127.0.0.1:27018")
    db = client["kubi"]
    
    settings_doc = db["settings"].find_one({"clusters": {"$exists": True, "$not": {"$size": 0}}})
    if not settings_doc:
        print("Error: No settings with clusters found in DB.")
        return
        
    settings_id = settings_doc["id"]
    print(f"Using settings document: {settings_id}")
    
    workspace_id = None
    if settings_id.startswith("workspace_"):
        workspace_id = settings_id.replace("workspace_", "")
    print(f"Workspace ID: {workspace_id}")
    
    token = generate_token(workspace_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    active_cluster_id = settings_doc.get("active_cluster_id")
    if active_cluster_id:
        headers["x-cluster-id"] = active_cluster_id
        print(f"Using x-cluster-id: {active_cluster_id}")
        
    # Query port-forwarded backend with cluster ID
    print("\n--- GET http://127.0.0.1:8000/api/stats (With Cluster ID) ---")
    try:
        res = httpx.get("http://127.0.0.1:8000/api/stats", headers=headers, timeout=10.0)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")

    # Query port-forwarded backend without cluster ID
    headers_no_cluster = headers.copy()
    headers_no_cluster.pop("x-cluster-id", None)
    print("\n--- GET http://127.0.0.1:8000/api/stats (WITHOUT Cluster ID Header) ---")
    try:
        res = httpx.get("http://127.0.0.1:8000/api/stats", headers=headers_no_cluster, timeout=10.0)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")

    # Query with a completely new/empty workspace
    new_token = generate_token("workspace_empty_tenant_id")
    headers_empty_ws = {
        "Authorization": f"Bearer {new_token}",
        "Content-Type": "application/json"
    }
    print("\n--- GET http://127.0.0.1:8000/api/stats (Empty Workspace Fallback) ---")
    try:
        res = httpx.get("http://127.0.0.1:8000/api/stats", headers=headers_empty_ws, timeout=10.0)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")
        
    print("\n--- GET http://127.0.0.1:8000/api/resources ---")
    try:
        res = httpx.get("http://127.0.0.1:8000/api/resources", headers=headers, timeout=10.0)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")
        
    print("\n--- GET http://127.0.0.1:8000/api/settings ---")
    try:
        res = httpx.get("http://127.0.0.1:8000/api/settings", headers=headers, timeout=10.0)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
