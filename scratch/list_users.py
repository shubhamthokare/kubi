import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import json

async def main():
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://127.0.0.1:27018")
    db_name = os.environ.get("DATABASE_NAME", "kubi")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    users = await db.users.find().to_list(length=100)
    print(f"FOUND {len(users)} USERS:")
    for u in users:
        if "_id" in u:
            u["_id"] = str(u["_id"])
        print(f"\n--- User: {u.get('email')} ---")
        # Serialize datetime fields
        for k, v in u.items():
            if isinstance(v, datetime):
                u[k] = str(v)
        print(json.dumps(u, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
