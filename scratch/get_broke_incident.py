import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://127.0.0.1:27018")
    client = AsyncIOMotorClient(mongo_url)
    db = client["kubi"]
    
    docs = await db.incidents.find({
        "$or": [
            {"pod_name": {"$regex": "broke-pod", "$options": "i"}},
            {"pod.name": {"$regex": "broke-pod", "$options": "i"}},
            {"id": {"$regex": "broke-pod", "$options": "i"}}
        ]
    }).to_list(length=100)
    
    print(f"FOUND {len(docs)} MATCHING INCIDENTS:")
    for idx, d in enumerate(docs):
        print(f"\n--- Incident #{idx+1} ---")
        print(f"ID: {d.get('id')}")
        print(f"Plan ID: {d.get('plan_id')}")
        print(f"Status: {d.get('status')}")
        print(f"Pod Name: {d.get('pod_name')} or {d.get('pod', {}).get('name')}")
        print(f"Owner: {d.get('pod', {}).get('has_owner')}")
        print(f"Plan Actions: {d.get('plan_actions')}")

if __name__ == "__main__":
    asyncio.run(main())
