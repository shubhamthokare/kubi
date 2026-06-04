import asyncio
import os
import sys

# Set environment variables for local database and agent connection
os.environ["MONGODB_URL"] = "mongodb://127.0.0.1:27018"
os.environ["DATABASE_NAME"] = "kubi"
os.environ["ENVIRONMENT"] = "development"

# Add apps/backend to sys.path so we can import app modules
sys.path.insert(0, r"c:\Users\shubh\Downloads\repo\kubi\apps\backend")

from main import app
from app.core.auth import create_access_token
from app.db.database import connect_to_mongo, get_db
import httpx

async def main():
    # Connect to MongoDB
    await connect_to_mongo()
    db = get_db()
    
    # Find settings to get a valid workspace ID
    settings_doc = await db.settings.find_one({"clusters": {"$exists": True, "$not": {"$size": 0}}})
    if not settings_doc:
        print("Error: No settings with clusters found in DB.")
        return
        
    settings_id = settings_doc["id"]
    print(f"Using settings document: {settings_id}")
    
    workspace_id = None
    if settings_id.startswith("workspace_"):
        workspace_id = settings_id.replace("workspace_", "")
        
    print(f"Decoded workspace ID: {workspace_id}")
    
    # Create an access token for this workspace
    token = create_access_token(
        username="dev-sre",
        role="admin",
        org="kubi-org",
        scopes=["sre:read", "sre:write", "admin"],
        workspace_id=workspace_id
    )
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    active_cluster_id = settings_doc.get("active_cluster_id")
    if active_cluster_id:
        headers["x-cluster-id"] = active_cluster_id
        print(f"Using x-cluster-id: {active_cluster_id}")
        
    # Query /api/stats
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        print("\n--- GET /api/stats ---")
        res = await client.get("/api/stats", headers=headers)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
        
        print("\n--- GET /api/resources ---")
        res = await client.get("/api/resources", headers=headers)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
        
        print("\n--- GET /api/settings ---")
        res = await client.get("/api/settings", headers=headers)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")

if __name__ == "__main__":
    asyncio.run(main())
