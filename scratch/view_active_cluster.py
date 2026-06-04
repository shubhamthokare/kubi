import asyncio
import os
import sys
import json
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://127.0.0.1:27018")
    db_name = os.environ.get("DATABASE_NAME", "kubi")
    print(f"Connecting to MongoDB at {mongo_url} (DB: {db_name})...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    settings = await db.settings.find_one({"id": "system_config"})
    print("SYSTEM CONFIG SETTINGS:")
    if settings:
        if "_id" in settings:
            settings["_id"] = str(settings["_id"])
        print(json.dumps(settings, indent=2))
    else:
        print("NO SYSTEM CONFIG FOUND!")

if __name__ == "__main__":
    asyncio.run(main())
