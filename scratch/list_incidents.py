import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://127.0.0.1:27018")
    db_name = os.environ.get("DATABASE_NAME", "kubi")
    print(f"Connecting to MongoDB at {mongo_url} (DB: {db_name})...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    incidents = await db.incidents.find().to_list(length=100)
    print(f"FOUND {len(incidents)} INCIDENTS:")
    for inc in incidents:
        print(f"- ID: {inc.get('id')}, Status: {inc.get('status')}, Pod: {inc.get('pod', {}).get('name')}, NS: {inc.get('pod', {}).get('namespace')}, Org: {inc.get('org')}, Cluster: {inc.get('cluster_id')}")

if __name__ == "__main__":
    asyncio.run(main())
