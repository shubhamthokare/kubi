import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27018")
    db = client["kubeguardian"]
    await db.settings.delete_many({})
    print("Settings collection cleared.")

asyncio.run(main())
