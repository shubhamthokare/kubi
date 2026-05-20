import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import json
from bson import ObjectId

class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        from datetime import datetime
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.kubi
    incidents = await db.incidents.find().to_list(10)
    print(json.dumps(incidents, indent=2, cls=JSONEncoder))
    await client.close()

if __name__ == "__main__":
    asyncio.run(check())
