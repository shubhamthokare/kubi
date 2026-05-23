"""
Kubi AI Backend Service

Copyright (c) 2026 Kubi AI Authors
Licensed under the MIT License - see LICENSE file for details.

This module provides the core FastAPI application for Kubi AI backend services,
including autonomous Kubernetes monitoring, AI-driven root cause analysis, and
automated remediation workflows.
"""

from fastapi import FastAPI
import asyncio
from contextlib import asynccontextmanager
from app.api.routes import router
from app.api.auth_routes import router as auth_router
from app.db.database import connect_to_mongo, close_mongo_connection
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

# Initialize Arize AX tracing (must be before other imports use Gemini or HTTP)
from app.core.arize_tracing import initialize_arize_tracing
initialize_arize_tracing()

# CORS configuration – use origins defined in .env via CORS_ORIGINS
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

async def background_scanner():
    """Periodically scans for incidents in the background using DB settings."""
    from app.workflows.incident_detection import IncidentDetectionWorkflow
    from app.db.database import get_db
    
    while True:
        try:
            db = get_db()
            settings = await db.settings.find_one({"id": "system_config"})
            interval = settings.get("scan_interval", 30) if settings else 30
            
            if settings and "clusters" in settings and settings["clusters"]:
                active_id = settings.get("active_cluster_id")
                target_cluster = None
                if active_id:
                    for cluster in settings["clusters"]:
                        if cluster.get("id") == active_id:
                            target_cluster = cluster
                            break
                
                if target_cluster:
                    cluster_id = target_cluster.get("id")
                    cluster_name = target_cluster.get("name", "Unnamed Cluster")
                    agent_url = target_cluster.get("agent_url")
                    print(f"Running background cluster scan for active cluster '{cluster_name}' ({cluster_id}) across all namespaces")
                    try:
                        cluster_workflow = IncidentDetectionWorkflow(agent_url=agent_url, cluster_config=target_cluster)
                        await cluster_workflow.run_scan(namespaces=None, cluster_id=cluster_id)
                    except Exception as ce:
                        print(f"Scan failed for cluster {cluster_name}: {ce}")
                else:
                    print("No active cluster configured or active cluster not found in list. Skipping background scan.")
            elif settings and "clusters" in settings and not settings["clusters"]:
                print("No clusters configured in settings. Skipping background scan.")
            else:
                workflow = IncidentDetectionWorkflow()
                print("Running background cluster scan across default cluster (ALL namespaces)")
                await workflow.run_scan(namespaces=None)
            
            await asyncio.sleep(interval)
        except Exception as e:
            print(f"Background scan error: {e}")
            await asyncio.sleep(30) # Wait 30s before retry on error

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    
    # Seed default GKE direct cluster connection if settings are empty or not initialized
    try:
        from app.db.database import get_db
        db = get_db()
        existing = await db.settings.find_one({"id": "system_config"})
        
        default_cluster = {
            "id": "kubi-internal-agent",
            "name": "Local Kubi Cluster",
            "auth_type": "kubeconfig",
            "kubeconfig": (
                "apiVersion: v1\n"
                "kind: Config\n"
                "clusters:\n"
                "- name: local-cluster\n"
                "  cluster:\n"
                "    server: https://kubernetes.default.svc\n"
                "    insecure-skip-tls-verify: true\n"
                "contexts:\n"
                "- name: local-context\n"
                "  context:\n"
                "    cluster: local-cluster\n"
                "    user: dummy\n"
                "current-context: local-context\n"
                "users:\n"
                "- name: dummy\n"
                "  user:\n"
                "    token: dummy"
            ),
            "namespace": "*",
            "agent_url": "http://kubi-agent-service:8080"
        }
        
        if not existing:
            print("Seeding new system_config with pre-configured direct GKE cluster connection...")
            await db.settings.insert_one({
                "id": "system_config",
                "namespaces": ["default"],
                "scan_interval": 30,
                "gemini_model": "gemini-2.5-pro",
                "gitlab_enabled": False,
                "gitlab_api_url": "",
                "gitlab_private_token": "",
                "gemini_api_key": "",
                "clusters": [default_cluster],
                "active_cluster_id": "kubi-internal-agent"
            })
        elif "clusters" not in existing or not existing["clusters"]:
            print("Seeding empty GKE clusters list with pre-configured direct cluster connection...")
            await db.settings.update_one(
                {"id": "system_config"},
                {"$set": {
                    "clusters": [default_cluster],
                    "active_cluster_id": "kubi-internal-agent"
                }}
            )
        else:
            print("System config already seeded with active clusters.")
    except Exception as se:
        print(f"Failed to seed default cluster configuration: {se}")
    
    # Validate Gemini API Key connection
    try:
        from app.services.gemini_service import GeminiService
        gemini_service = GeminiService()
        print("Validating Gemini API key connection at startup...")
        status = await gemini_service.validate_connection()
        if status.get("status") == "success":
            print(f"Gemini API check: SUCCESS - {status.get('message')}")
        else:
            print(f"Gemini API check: WARNING/ERROR - {status.get('message')}")
    except Exception as e:
        print(f"Failed to execute startup Gemini connection diagnosis: {e}")
        
    # Initialize Elasticsearch indices
    from app.services.incident_indexing import initialize_indices
    initialize_indices()
    
    # Start background scanner
    scan_task = asyncio.create_task(background_scanner())
    yield
    # Shutdown
    scan_task.cancel()
    await close_mongo_connection()
    
    # Close Elasticsearch connection
    from app.services.elasticsearch_service import close_es
    close_es()

app = FastAPI(
    title="kubi AI",
    description="Autonomous Kubernetes Incident Recovery Agent",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(auth_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Welcome to kubi AI API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
