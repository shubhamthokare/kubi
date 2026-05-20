import uuid
import logging
import asyncio
from datetime import datetime, timezone
from app.services.action_engine import ActionEngine
from app.services.gemini_service import RemediationPlan
from app.services.reporting_service import ReportingService
from app.db.database import get_db

logger = logging.getLogger(__name__)

class RemediationWorkflow:
    def __init__(self):
        self.action_engine = ActionEngine()
        self.reporting_service = ReportingService()

    async def store_plan(self, plan: RemediationPlan) -> str:
        """Stores a plan in MongoDB and returns its unique ID."""
        db = get_db()
        plan_id = str(uuid.uuid4())
        
        plan_dict = {
            "plan_id": plan_id,
            "status": "pending_approval",
            "plan": plan.model_dump(),
            "generated_by": "ai"
        }
        
        await db.plans.insert_one(plan_dict)
        logger.info(f"Stored pending remediation plan {plan_id} in MongoDB")
        return plan_id

    async def get_plan(self, plan_id: str) -> dict | None:
        """Retrieves a plan by ID from MongoDB."""
        db = get_db()
        plan_entry = await db.plans.find_one({"plan_id": plan_id})
        if plan_entry:
            plan_entry["_id"] = str(plan_entry["_id"]) # stringify ObjectId
        return plan_entry

    async def get_all_plans(self) -> list:
        """Retrieves all plans from MongoDB."""
        db = get_db()
        plans = await db.plans.find().to_list(length=None)
        for p in plans:
            p["_id"] = str(p["_id"])
        return plans

    async def approve_and_execute(self, plan_id: str) -> dict:
        """Approves a plan, executes its actions, verifies health, and updates MongoDB."""
        db = get_db()
        plan_entry = await db.plans.find_one({"plan_id": plan_id})
        
        if not plan_entry:
            return {"status": "error", "message": "Plan not found."}
            
        if plan_entry["status"] != "pending_approval":
            return {"status": "error", "message": f"Plan cannot be executed. Current status: {plan_entry['status']}"}
            
        await db.plans.update_one({"plan_id": plan_id}, {"$set": {"status": "executing"}})
        
        # Resolve cluster's agent_url from the incident associated with this plan
        incident = await db.incidents.find_one({"plan_id": plan_id})
        agent_url = None
        cluster_config = None
        if incident and incident.get("cluster_id"):
            settings = await db.settings.find_one({"id": "system_config"})
            if settings and "clusters" in settings:
                for cluster in settings["clusters"]:
                    if cluster.get("id") == incident["cluster_id"]:
                        agent_url = cluster.get("agent_url")
                        cluster_config = cluster
                        break
        
        # Instantiate ActionEngine with this cluster's agent_url and config
        action_engine = ActionEngine(agent_url=agent_url, cluster_config=cluster_config)
        
        # Execute actions (async)
        # Note: We parse the plan dict back into RemediationPlan
        plan_obj = RemediationPlan(**plan_entry["plan"])
        results = await action_engine.execute_plan(plan_obj.actions)
        
        # Check if all executions were technically successful
        all_success = all(r.get("success", False) for r in results)
        
        if not all_success:
            await db.plans.update_one({"plan_id": plan_id}, {"$set": {"status": "failed_execution"}})
            return {"status": "failed_execution", "execution_results": results}
            
        # Phase 4: Health Verification Polling
        logger.info(f"Waiting for health verification for plan {plan_id}...")
        await db.plans.update_one({"plan_id": plan_id}, {"$set": {"status": "verifying"}})
        
        verified = True
        for action in plan_obj.actions:
            if action.action_type in ["restart_deployment", "rollback_deployment"]:
                # Poll deployment health
                is_healthy = False
                for attempt in range(5): # 5 attempts
                    await asyncio.sleep(2) # 2 seconds per attempt
                    if action_engine.k8s_service.verify_deployment_health(action.target_name, action.namespace):
                        is_healthy = True
                        break
                if not is_healthy:
                    logger.warning(f"Health verification failed for {action.target_name}")
                    verified = False
            elif action.action_type == "restart_pod":
                # Poll pod health
                is_healthy = False
                for attempt in range(5):
                    await asyncio.sleep(2)
                    if action_engine.k8s_service.verify_pod_health(action.target_name, action.namespace):
                        is_healthy = True
                        break
                if not is_healthy:
                    logger.warning(f"Health verification failed for pod {action.target_name}")
                    verified = False
        
        final_status = "completed" if verified else "failed_verification"
        await db.plans.update_one({"plan_id": plan_id}, {"$set": {"status": final_status}})
        
        if verified:
            # Explicitly mark the incident as resolved for immediate feedback
            resolved_at = datetime.now(timezone.utc).isoformat()
            await db.incidents.update_one(
                {"plan_id": plan_id, "status": "active"},
                {"$set": {"status": "resolved", "resolved_at": resolved_at}}
            )
            logger.info(f"Incident associated with plan {plan_id} marked as resolved.")

            # Index remediation actions into Elasticsearch
            try:
                from app.services.incident_indexing import store_remediation
                incident = await db.incidents.find_one({"plan_id": plan_id})
                incident_id = incident.get("id") if incident else plan_id
                for r in results:
                    action_type = r.get("action_type") or r.get("type") or "unknown"
                    target = r.get("target") or r.get("target_name") or r.get("target_resource")
                    namespace = r.get("namespace") or r.get("ns") or ""
                    status = "succeeded" if r.get("success") else "failed"
                    details = r.get("details") or r.get("message") or str(r)
                    try:
                        store_remediation(incident_id=incident_id, action_type=action_type, target_resource=target, namespace=namespace, status=status, details=details)
                    except Exception as re:
                        logger.warning(f"Failed to index remediation action: {re}")
            except Exception as e:
                logger.warning(f"Failed to index remediation actions: {e}")

            # Phase 5: Postmortem Generation
            try:
                logger.info(f"Generating postmortem for successful remediation {plan_id}...")
                # Find the incident associated with this plan
                incident = await db.incidents.find_one({"plan_id": plan_id})
                if incident:
                    incident["status"] = "resolved"
                    incident["resolved_at"] = resolved_at
                    report = await self.reporting_service.generate_postmortem(incident, {"verified": True, "actions": results})
                    logger.info(f"Postmortem generated and saved for plan {plan_id}")
            except Exception as e:
                logger.error(f"Failed to generate postmortem for {plan_id}: {e}")
        else:
            logger.error(f"Plan {plan_id} failed health verification.")
            
        return {
            "status": final_status,
            "execution_results": results,
            "verified": verified
        }

    async def reject_plan(self, plan_id: str) -> dict:
        """Rejects a plan and updates MongoDB."""
        db = get_db()
        plan_entry = await db.plans.find_one({"plan_id": plan_id})
        
        if not plan_entry:
            return {"status": "error", "message": "Plan not found."}
            
        await db.plans.update_one({"plan_id": plan_id}, {"$set": {"status": "rejected"}})
        return {"status": "rejected", "message": "Plan has been rejected and will not be executed."}
