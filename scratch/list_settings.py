import asyncio
import os
import sys
import json
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://127.0.0.1:27018")
    db_name = os.environ.get("DATABASE_NAME", "kubi")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    settings = await db.settings.find().to_list(length=100)
    print(f"FOUND {len(settings)} SETTINGS:")
    for s in settings:
        if "_id" in s:
            s["_id"] = str(s["_id"])
        print(f"\n--- Settings: {s.get('id')} ---")
        print(json.dumps(s, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
