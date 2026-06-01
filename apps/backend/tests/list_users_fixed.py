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
    
    users = await db.users.find().to_list(length=100)
    print(f"FOUND {len(users)} USERS:")
    for u in users:
        if "_id" in u:
            u["_id"] = str(u["_id"])
        for k, v in list(u.items()):
            if not isinstance(v, (dict, list, str, int, float, bool, type(None))):
                u[k] = str(v)
        # only print users whose email is shubham@gmail.com or playwright-1780130626322 or similar, or just print the latest 5
        print(f"- Email: {u.get('email')}, Org: {u.get('org')}, Role: {u.get('role')}, WorkspaceID: {u.get('workspace_id')}")

if __name__ == "__main__":
    asyncio.run(main())
