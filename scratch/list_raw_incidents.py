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
    
    incidents = await db.incidents.find().to_list(length=100)
    
    output_path = r"C:\Users\shubh\.gemini\antigravity\brain\c13af72c-1cb4-4e23-abf9-d475dff96063\scratch\raw_incidents_utf8.txt"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"Connecting to MongoDB at {mongo_url} (DB: {db_name})...\n")
        f.write(f"FOUND {len(incidents)} INCIDENTS:\n")
        for idx, inc in enumerate(incidents):
            if "_id" in inc:
                inc["_id"] = str(inc["_id"])
            for k, v in list(inc.items()):
                if not isinstance(v, (dict, list, str, int, float, bool, type(None))):
                    inc[k] = str(v)
            f.write(f"\n--- Incident #{idx+1} ---\n")
            f.write(json.dumps(inc, indent=2))
            f.write("\n")
    print("Successfully wrote output to raw_incidents_utf8.txt")

if __name__ == "__main__":
    asyncio.run(main())
