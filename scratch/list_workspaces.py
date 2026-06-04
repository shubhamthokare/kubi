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
    
    workspaces = await db.workspaces.find().to_list(length=100)
    print(f"FOUND {len(workspaces)} WORKSPACES:")
    for w in workspaces:
        if "_id" in w:
            w["_id"] = str(w["_id"])
        if "owner_id" in w:
            w["owner_id"] = str(w["owner_id"])
        for k, v in list(w.items()):
            if not isinstance(v, (dict, list, str, int, float, bool, type(None))):
                w[k] = str(v)
        # only print if it's Shubham's Workspace or latest 5
        if "Shubham" in w.get("name", ""):
            print(f"\n--- Workspace: {w.get('name')} ({w.get('id') or w.get('_id')}) ---")
            print(json.dumps(w, indent=2))
        
    members = await db.workspace_members.find().to_list(length=100)
    print(f"\nFOUND {len(members)} MEMBERS:")
    for m in members:
        if "_id" in m:
            m["_id"] = str(m["_id"])
        if "workspace_id" in m:
            m["workspace_id"] = str(m["workspace_id"])
        if "user_id" in m:
            m["user_id"] = str(m["user_id"])
        for k, v in list(m.items()):
            if not isinstance(v, (dict, list, str, int, float, bool, type(None))):
                m[k] = str(v)
        # only print for workspace ID matching shubham's workspace
        print(f"- Workspace: {m.get('workspace_id')}, User: {m.get('user_id')}, Role: {m.get('role')}")

if __name__ == "__main__":
    asyncio.run(main())
