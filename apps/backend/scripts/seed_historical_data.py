import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta, timezone
import os

# Configuration (matching be/app/core/config.py defaults)
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "kubeguardian")

HISTORICAL_DATA = [
    {
        "id": "past-incident-1",
        "status": "resolved",
        "pod": {
            "name": "payment-api-6f7d8c9b-1",
            "namespace": "production",
            "reason": "CrashLoopBackOff"
        },
        "rca": "The application was crashing due to a missing environment variable 'STRIPE_API_KEY'. The pod would start, fail to initialize the payment client, and exit with code 1.",
        "plan_summary": "Inject the missing secret via a Kubernetes Secret and update the deployment environment variables.",
        "postmortem": "# Postmortem: Payment API CrashLoop\n\n## Executive Summary\nPayment processing was offline for 15 minutes due to missing configuration.\n\n## Root Cause\nA recent deployment removed the STRIPE_API_KEY from the ConfigMap accidentally.\n\n## Resolution\nRe-added the secret and performed a rolling restart.",
        "resolved_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    },
    {
        "id": "past-incident-2",
        "status": "resolved",
        "pod": {
            "name": "auth-service-54321-abc",
            "namespace": "staging",
            "reason": "OOMKilled"
        },
        "rca": "Memory leak in the /login endpoint caused by unbounded caching of session tokens. Under high load, the pod exceeded its 512Mi limit.",
        "plan_summary": "Increase memory limits to 1Gi as a temporary mitigation and trigger a rollback to the previous stable version.",
        "postmortem": "# Postmortem: Auth Service OOM\n\n## Root Cause\nMemory leak in v1.2.4.\n\n## Resolution\nRolled back to v1.2.3 and increased memory limits.",
        "resolved_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    },
    {
        "id": "past-incident-3",
        "status": "resolved",
        "pod": {
            "name": "redis-master-0",
            "namespace": "database",
            "reason": "ImagePullBackOff"
        },
        "rca": "Invalid image tag 'latest-stable' was used in the deployment. The image registry does not have this tag.",
        "plan_summary": "Update the deployment to use a specific versioned tag 'redis:6.2-alpine'.",
        "postmortem": "# Postmortem: Redis Image Pull Failure\n\n## Resolution\nFixed the image tag to a valid version.",
        "resolved_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    }
]

async def seed_data():
    print(f"Connecting to MongoDB at {MONGODB_URL}...")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    print(f"Seeding {len(HISTORICAL_DATA)} historical incidents...")
    for incident in HISTORICAL_DATA:
        await db.incidents.update_one(
            {"id": incident["id"]},
            {"$set": incident},
            upsert=True
        )
    
    print("Seeding complete!")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_data())
