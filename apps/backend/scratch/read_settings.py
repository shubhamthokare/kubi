import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.kubi
    doc = await db.settings.find_one({"id": "system_config"})
    print("SETTINGS:", doc)
    
    incidents = await db.incidents.find().to_list(100)
    print("INCIDENTS count:", len(incidents))
    for i in incidents:
        print(f"Incident: id={i.get('id')}, status={i.get('status')}, plan_id={i.get('plan_id')}")
        
    plans = await db.plans.find().to_list(100)
    print("PLANS count:", len(plans))
    for p in plans:
        print(f"Plan: id={p.get('plan_id')}, status={p.get('status')}")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
