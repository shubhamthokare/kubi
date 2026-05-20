import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def test_resolution():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.kubi
    
    # 1. Create a dummy active incident
    pod_id = "default-test-pod-uid123"
    await db.incidents.update_one(
        {"id": pod_id, "status": "active"},
        {
            "$set": {
                "pod": {"name": "test-pod", "namespace": "default", "phase": "Failed"},
                "last_seen": datetime.now(timezone.utc),
                "status": "active"
            },
            "$setOnInsert": {"id": pod_id}
        },
        upsert=True
    )
    print(f"Created active incident: {pod_id}")
    
    # 2. Check if it's there
    doc = await db.incidents.find_one({"id": pod_id, "status": "active"})
    print(f"Found active: {doc is not None}")
    
    # 3. Try to resolve it via a "fake" scan (that doesn't include this pod_id)
    # This simulates IncidentDetectionWorkflow.run_scan logic
    current_failed_pod_ids = [] # Empty list, so pod_id is "missing"
    
    active_incidents_in_db = await db.incidents.find({"status": "active"}).to_list(1000)
    for doc in active_incidents_in_db:
        doc_id = doc.get("id")
        if doc_id and doc_id not in current_failed_pod_ids:
            # Simulate verify_pod_health returning True
            print(f"Resolving {doc_id}...")
            await db.incidents.update_one(
                {"_id": doc["_id"]},
                {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc).isoformat()}}
            )
            
    # 4. Check if it's now resolved
    doc = await db.incidents.find_one({"id": pod_id, "status": "resolved"})
    print(f"Now resolved: {doc is not None}")
    
    await client.close()

if __name__ == "__main__":
    asyncio.run(test_resolution())
