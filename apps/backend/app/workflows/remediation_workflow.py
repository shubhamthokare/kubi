import uuid
import logging
import asyncio
from datetime import datetime, timezone
from app.core.logging_sanitizer import sanitize_log
from app.services.action_engine import ActionEngine
from app.services.gemini_service import RemediationPlan
from app.services.reporting_service import ReportingService
from app.db.database import get_db

logger = logging.getLogger(__name__)

class RemediationWorkflow:
    def __init__(self):
        self.action_engine = ActionEngine()
        self.reporting_service = ReportingService()

    async def store_plan(
        self,
        plan: RemediationPlan,
        tokens_consumed: int = 0,
        parent_plan_id: str = None,
        generated_by: str = "ai",
        resource_context: dict | None = None,
    ) -> str:
        """Stores a plan in MongoDB and returns its unique ID."""
        db = get_db()
        plan_id = str(uuid.uuid4())
        
        plan_dict = {
            "plan_id": plan_id,
            "parent_plan_id": parent_plan_id,
            "status": "pending_approval",
            "plan": plan.model_dump(),
            "resource_context": resource_context or getattr(plan, "resource_context", None),
            "generated_by": generated_by,
            "tokens_consumed": tokens_consumed
        }
        
        await db.plans.insert_one(plan_dict)
        logger.info(f"Stored pending remediation plan {sanitize_log(plan_id)} in MongoDB")
        return plan_id

    async def get_plan(self, plan_id: str) -> dict | None:
        """Retrieves a plan by ID from MongoDB."""
        db = get_db()
        plan_entry = await db.plans.find_one({"plan_id": plan_id})
        if plan_entry:
            plan_entry["_id"] = str(plan_entry["_id"]) # stringify ObjectId
            # Populate cluster_id and other details from associated incident
            incident = await db.incidents.find_one({"plan_id": plan_id})
            if incident:
                plan_entry["cluster_id"] = incident.get("cluster_id") or incident.get("connection_id")
                plan_entry["pod_name"] = incident.get("pod", {}).get("name") or incident.get("pod_name")
                plan_entry["namespace"] = incident.get("pod", {}).get("namespace") or incident.get("namespace")
        return plan_entry

    async def get_all_plans(self) -> list:
        """Retrieves all plans from MongoDB."""
        db = get_db()
        plans = await db.plans.find().to_list(length=None)
        for p in plans:
            p["_id"] = str(p["_id"])
            # Populate cluster_id and other details from associated incident
            incident = await db.incidents.find_one({"plan_id": p["plan_id"]})
            if incident:
                p["cluster_id"] = incident.get("cluster_id") or incident.get("connection_id")
                p["pod_name"] = incident.get("pod", {}).get("name") or incident.get("pod_name")
                p["namespace"] = incident.get("pod", {}).get("namespace") or incident.get("namespace")
        return plans

    async def approve_and_execute(self, plan_id: str, rating: int = None, feedback: str = None) -> dict:
        """Approves a plan, executes its actions, verifies health, and updates MongoDB."""
        db = get_db()
        plan_entry = await db.plans.find_one({"plan_id": plan_id})
        
        if not plan_entry:
            return {"status": "error", "message": "Plan not found."}
            
        if plan_entry["status"] != "pending_approval":
            return {"status": "error", "message": f"Plan cannot be executed. Current status: {plan_entry['status']}"}
            
        update_fields = {"status": "executing"}
        if rating is not None:
            update_fields["rating"] = rating
        if feedback is not None:
            update_fields["feedback"] = feedback
        await db.plans.update_one({"plan_id": plan_id}, {"$set": update_fields})
        
        # Resolve cluster's agent_url from the incident associated with this plan
        incident = await db.incidents.find_one({"plan_id": plan_id})
        if incident:
            incident_update = {}
            if rating is not None:
                incident_update["rating"] = rating
            if feedback is not None:
                incident_update["feedback"] = feedback
            if incident_update:
                await db.incidents.update_one({"plan_id": plan_id}, {"$set": incident_update})
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
        try:
            from app.core.arize_tracing import get_tracer, set_span_attributes
            tracer = get_tracer("kubi.remediation")
        except Exception:
            tracer = None

        if tracer:
            with tracer.start_as_current_span("action.agent_execute") as span:
                set_span_attributes(span, {
                    "plan_id": plan_id,
                    "approval_state": "approved",
                    "resource_context": plan_entry.get("resource_context"),
                    "action_count": len(plan_obj.actions),
                })
                results = await action_engine.execute_plan(plan_obj.actions)
                span.set_attribute("execution_success", all(r.get("success", False) for r in results))
        else:
            results = await action_engine.execute_plan(plan_obj.actions)
        
        # Check if all executions were technically successful
        all_success = all(r.get("success", False) for r in results)
        
        if not all_success:
            final_status = "failed_execution"
            await db.plans.update_one({"plan_id": plan_id}, {"$set": {"status": final_status}})
            
            # Trigger ChatOps remediation notification for failed execution
            try:
                from app.services.chatops_service import get_chatops_service
                incident_doc = await db.incidents.find_one({"plan_id": plan_id})
                pod_n = incident_doc.get("pod", {}).get("name") if incident_doc else None
                ns_n = incident_doc.get("pod", {}).get("namespace") if incident_doc else None
                summary_parts = [
                    f"- {r.get('action_type', 'Action')}: {r.get('target_name', '')} -> {'Success' if r.get('success') else 'Failed'}"
                    for r in results
                ]
                actions_summary = "\n".join(summary_parts)
                async def send_remediation_chatops():
                    chatops = await get_chatops_service()
                    if chatops:
                        await chatops.notify_remediation(
                            plan_id=plan_id,
                            pod_name=pod_n,
                            namespace=ns_n,
                            status=final_status,
                            actions_summary=actions_summary
                        )
                asyncio.create_task(send_remediation_chatops())
            except Exception as e:
                logger.warning(f"Failed to initiate ChatOps remediation notification task: {e}")

            return {"status": "failed_execution", "execution_results": results}
            
        # Phase 4: Health Verification Polling
        logger.info(f"Waiting for health verification for plan {sanitize_log(plan_id)}...")
        await db.plans.update_one({"plan_id": plan_id}, {"$set": {"status": "verifying"}})
        
        # Initial delay to allow K8s operations to complete (deployments take 30-90s to stabilize)
        logger.info("Allowing 10 seconds for Kubernetes operations to stabilize...")
        await asyncio.sleep(10)
        
        verified = True
        for action in plan_obj.actions:
            if action.action_type in ["restart_deployment", "rollback_deployment"]:
                # Poll deployment health with extended window (60 seconds total)
                # Use exponential backoff: 15 attempts × 4 seconds each
                is_healthy = False
                for attempt in range(15):
                    await asyncio.sleep(4)
                    logger.info(f"Health check attempt {attempt + 1}/15 for {sanitize_log(action.target_name)}...")
                    if action_engine.k8s_service.verify_deployment_health(action.target_name, action.namespace):
                        is_healthy = True
                        logger.info(f"Deployment {sanitize_log(action.target_name)} is healthy")
                        break
                if not is_healthy:
                    logger.warning(f"Health verification failed for {sanitize_log(action.target_name)} after 60 seconds")
                    verified = False
            elif action.action_type == "restart_pod":
                # Poll pod health with extended window (60 seconds total)
                is_healthy = False
                for attempt in range(15):
                    await asyncio.sleep(4)
                    logger.info(f"Health check attempt {attempt + 1}/15 for pod {sanitize_log(action.target_name)}...")
                    if action_engine.k8s_service.verify_pod_health(action.target_name, action.namespace):
                        is_healthy = True
                        logger.info(f"Pod {sanitize_log(action.target_name)} is healthy")
                        break
                if not is_healthy:
                    logger.warning(f"Health verification failed for pod {sanitize_log(action.target_name)} after 60 seconds")
                    verified = False
        
        final_status = "completed" if verified else "failed_verification"
        await db.plans.update_one({"plan_id": plan_id}, {"$set": {"status": final_status}})
        
        # Trigger ChatOps remediation notification for completed / failed verification
        try:
            from app.services.chatops_service import get_chatops_service
            incident_doc = await db.incidents.find_one({"plan_id": plan_id})
            pod_n = incident_doc.get("pod", {}).get("name") if incident_doc else None
            ns_n = incident_doc.get("pod", {}).get("namespace") if incident_doc else None
            summary_parts = [
                f"- {r.get('action_type', 'Action')}: {r.get('target_name', '')} -> {'Success' if r.get('success') else 'Failed'}"
                for r in results
            ]
            actions_summary = "\n".join(summary_parts)
            async def send_remediation_chatops():
                chatops = await get_chatops_service()
                if chatops:
                    await chatops.notify_remediation(
                        plan_id=plan_id,
                        pod_name=pod_n,
                        namespace=ns_n,
                        status=final_status,
                        actions_summary=actions_summary
                    )
            asyncio.create_task(send_remediation_chatops())
        except Exception as e:
            logger.warning(f"Failed to initiate ChatOps remediation notification task: {e}")
        
        if verified:
            # Explicitly mark the incident as resolved for immediate feedback
            resolved_at = datetime.now(timezone.utc).isoformat()
            await db.incidents.update_one(
                {"plan_id": plan_id, "status": "active"},
                {"$set": {"status": "resolved", "resolved_at": resolved_at}}
            )
            logger.info(f"Incident associated with plan {sanitize_log(plan_id)} marked as resolved.")

            # Spawn safe-mode rollback guards for eligible actions
            for action in plan_obj.actions:
                if action.action_type in ["restart_deployment", "rollback_deployment", "restart_pod"]:
                    asyncio.create_task(
                        self.monitor_safe_mode(
                            plan_id=plan_id,
                            action_type=action.action_type,
                            target_name=action.target_name,
                            namespace=action.namespace,
                            duration_secs=300,
                            agent_url=agent_url,
                            cluster_config=cluster_config
                        )
                    )

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
                logger.info(f"Generating postmortem for successful remediation {sanitize_log(plan_id)}...")
                # Find the incident associated with this plan
                incident = await db.incidents.find_one({"plan_id": plan_id})
                if incident:
                    incident["status"] = "resolved"
                    incident["resolved_at"] = resolved_at
                    report = await self.reporting_service.generate_postmortem(incident, {"verified": True, "actions": results})
                    logger.info(f"Postmortem generated and saved for plan {sanitize_log(plan_id)}")
            except Exception as e:
                logging.exception(f"Failed to generate postmortem for {sanitize_log(plan_id)}: {e}")
        else:
            logging.exception(f"Plan {sanitize_log(plan_id)} failed health verification.")
            
        return {
            "status": final_status,
            "execution_results": results,
            "verified": verified
        }

    async def reject_plan(self, plan_id: str, rating: int = None, feedback: str = None) -> dict:
        """Rejects a plan and updates MongoDB."""
        db = get_db()
        plan_entry = await db.plans.find_one({"plan_id": plan_id})
        
        if not plan_entry:
            return {"status": "error", "message": "Plan not found."}
            
        update_fields = {"status": "rejected"}
        if rating is not None:
            update_fields["rating"] = rating
        if feedback is not None:
            update_fields["feedback"] = feedback
        await db.plans.update_one({"plan_id": plan_id}, {"$set": update_fields})
        
        # Also update associated incident status if any
        incident_update = {"status": "rejected"}
        if rating is not None:
            incident_update["rating"] = rating
        if feedback is not None:
            incident_update["feedback"] = feedback
        await db.incidents.update_one({"plan_id": plan_id}, {"$set": incident_update})
        
        return {"status": "rejected", "message": "Plan has been rejected and will not be executed."}

    async def monitor_safe_mode(self, plan_id: str, action_type: str, target_name: str, namespace: str, duration_secs: int = 300, agent_url: str = None, cluster_config: dict = None):
        """
        Asynchronously monitors the health of the remediated resource for `duration_secs` (default 5 minutes).
        Auto-triggers a rollback if health degrades.
        """
        import os
        db = get_db()
        action_engine = ActionEngine(agent_url=agent_url, cluster_config=cluster_config)
        
        # Support test override for rapid automated testing
        duration_secs = int(os.environ.get("SAFE_MODE_DURATION_SECS", duration_secs))
        poll_interval = int(os.environ.get("SAFE_MODE_POLL_INTERVAL", 30))
        attempts = max(1, duration_secs // poll_interval)
        
        logger.info(f"🛡️ Safe-mode guard started for {target_name} ({action_type}) in namespace {namespace} for {duration_secs}s")
        
        for attempt in range(attempts):
            await asyncio.sleep(poll_interval)
            
            # Check current health
            is_healthy = True
            try:
                if action_type in ["restart_deployment", "rollback_deployment"]:
                    is_healthy = action_engine.k8s_service.verify_deployment_health(target_name, namespace)
                elif action_type == "restart_pod":
                    is_healthy = action_engine.k8s_service.verify_pod_health(target_name, namespace)
            except Exception as e:
                logger.error(f"Error checking health during safe-mode poll: {e}")
                is_healthy = False
                
            if not is_healthy:
                logger.warning(f"🚨 SAFE-MODE ALERT: Health degraded for {target_name}! Initiating auto-rollback.")
                
                # Execute Rollback Action
                rollback_success, msg = action_engine.k8s_service.rollback_deployment(target_name, namespace)
                
                # Update Database
                await db.plans.update_one(
                    {"plan_id": plan_id},
                    {"$set": {"status": "rolled_back", "rollback_reason": f"Health degraded during safe-mode monitoring: {msg}"}}
                )
                await db.incidents.update_one(
                    {"plan_id": plan_id},
                    {"$set": {"status": "rolled_back", "resolved_at": None}}
                )
                
                # Trigger ChatOps Notification
                try:
                    from app.services.chatops_service import get_chatops_service
                    chatops = await get_chatops_service()
                    if chatops:
                        await chatops.notify_remediation(
                            plan_id=plan_id,
                            pod_name=target_name,
                            namespace=namespace,
                            status="rolled_back",
                            actions_summary=f"Auto-rollback triggered: {msg}"
                        )
                except Exception as ce:
                    logger.error(f"Failed to send ChatOps rollback alert: {ce}")
                    
                return
                
        logger.info(f"🛡️ Safe-mode guard completed. Resource {target_name} remained stable.")

    async def get_plan_lineage(self, plan_id: str) -> list:
        """Returns the full parent→child chain for a plan."""
        db = get_db()
        lineage = []
        current_id = plan_id
        
        # Walk up to find the root
        while current_id:
            plan = await db.plans.find_one({"plan_id": current_id})
            if not plan:
                break
            plan["_id"] = str(plan["_id"])
            lineage.insert(0, plan)
            current_id = plan.get("parent_plan_id")
        
        # Walk down from root to find all children
        current_id = plan_id
        while True:
            child = await db.plans.find_one({"parent_plan_id": current_id})
            if not child:
                break
            child["_id"] = str(child["_id"])
            lineage.append(child)
            current_id = child["plan_id"]
        
        return lineage
