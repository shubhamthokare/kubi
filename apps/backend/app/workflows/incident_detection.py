import logging
from app.services.kubernetes_service import KubernetesService
from app.services.elastic_mcp_service import ElasticMCPService
from app.services.gemini_service import GeminiService
from app.workflows.remediation_workflow import RemediationWorkflow
# Elasticsearch indexing helpers
from app.services.incident_indexing import (
    store_incident,
    store_rca,
    store_remediation,
)

logger = logging.getLogger(__name__)

class IncidentDetectionWorkflow:
    def __init__(self, agent_url: str = None, cluster_config: dict = None):
        self.k8s_service = KubernetesService(agent_url=agent_url, cluster_config=cluster_config)
        self.elastic_service = ElasticMCPService()
        self.gemini_service = GeminiService()
        self.remediation_workflow = RemediationWorkflow()

    async def run_scan(self, namespaces: list[str] = None, cluster_id: str = None):
        """
        Runs an incident detection scan.
        1. Identifies failed pods across target namespaces.
        2. Fetches logs for failed pods (from K8s or Elastic).
        3. Sends data to Gemini for RCA and Remediation Plan.
        """
        target_info = f"namespaces: {namespaces}" if namespaces else "cluster-wide"
        logger.info(f"Starting incident scan across {target_info}")
        
        failed_pods = self.k8s_service.get_failed_pods(namespaces)
        if not failed_pods:
            return {"status": "ok", "message": "No failed pods detected.", "incidents": []}
        
        incidents = []
        current_failed_pod_ids = []
        from datetime import datetime, timezone
        from app.db.database import get_db
        db = get_db()
        import asyncio

        # Fetch gitlab_enabled setting
        gitlab_enabled = False
        try:
            db_settings = await db.settings.find_one({"id": "system_config"})
            if db_settings:
                gitlab_enabled = db_settings.get("gitlab_enabled", False)
        except Exception as e:
            logger.error(f"Error fetching gitlab_enabled setting: {e}")

        for pod in failed_pods:
            pod_name = pod["name"]
            pod_ns = pod["namespace"]
            pod_uid = pod["uid"]
            pod_id = f"{pod_ns}-{pod_name}-{pod_uid}"
            current_failed_pod_ids.append(pod_id)
            
            has_owner = pod.get("has_owner", False)
            
            # Extract deployment name robustly to prevent infinite loops for pods recreated by the same deployment
            if has_owner:
                parts = pod_name.split("-")
                deployment_name = "-".join(parts[:-2]) if len(parts) > 2 else "-".join(parts[:-1]) if len(parts) > 1 else pod_name
                
                # Prevent infinite approval loops by skipping if an incident for this deployment is already active
                query = {
                    "pod.name": {"$regex": f"^{deployment_name}-[a-z0-9]+-[a-z0-9]+$"},
                    "pod.namespace": pod_ns,
                    "status": "active"
                }
                if cluster_id:
                    query["cluster_id"] = cluster_id
                existing_incident = await db.incidents.find_one(query)
            else:
                deployment_name = pod_name
                # Prevent infinite approval loops by exact matching on standalone pods
                query = {
                    "pod.name": pod_name,
                    "pod.namespace": pod_ns,
                    "status": "active"
                }
                if cluster_id:
                    query["cluster_id"] = cluster_id
                existing_incident = await db.incidents.find_one(query)
                
            if existing_incident:
                should_skip = True
                plan_id = existing_incident.get("plan_id")
                if plan_id:
                    plan = await db.plans.find_one({"plan_id": plan_id})
                    if plan and plan.get("status") in ["failed_verification", "failed_execution", "rejected"]:
                        should_skip = False
                
                if should_skip:
                    logger.info(f"An incident for {deployment_name} is already active. Skipping re-analysis.")
                    obj_id = existing_incident["_id"]
                    existing_incident["_id"] = str(existing_incident["_id"])
                    # Update last_seen to keep it fresh
                    from datetime import datetime, timezone
                    await db.incidents.update_one({"_id": obj_id}, {"$set": {"last_seen": datetime.now(timezone.utc)}})
                    incidents.append(existing_incident)
                    continue
                else:
                    logger.info(f"An active incident for {deployment_name} has a failed/rejected plan. Re-running analysis.")
                
            logger.info(f"Analyzing failed pod: {pod_ns}/{pod_name} (UID: {pod_uid})")
            
            # Extract service name to detect infinite loops
            if has_owner:
                service_name = pod_name.split("-")[0]
                regex_query = {"$regex": f"^{service_name}-"}
            else:
                service_name = pod_name
                regex_query = pod_name
            
            # Infinite Loop Detection
            from datetime import timedelta
            time_threshold = datetime.now(timezone.utc) - timedelta(minutes=15)
            recent_incident_count = await db.incidents.count_documents({
                "pod.name": regex_query,
                "first_detected": {"$gte": time_threshold.isoformat()}
            })
            
            loop_detected = recent_incident_count >= 3
            if loop_detected:
                logger.warning(f"Infinite loop detected for service {service_name}. {recent_incident_count} incidents in last 15 mins.")
            
            # Fetch logs
            k8s_logs = self.k8s_service.get_pod_logs(pod_name, pod_ns)
            elastic_logs = await self.elastic_service.get_logs_for_service(pod_name)
            
            # Fetch CI/CD pipeline context
            from app.services.gitlab_service import GitLabService
            gitlab_service = GitLabService()
            pipeline_status = await gitlab_service.get_latest_pipeline_status(service_name)
            
            combined_logs = f"--- Kubernetes Logs ---\n{k8s_logs}\n\n--- Elastic Logs ---\n{elastic_logs}\n\n--- GitLab CI/CD Context ---\nLatest Pipeline Status: {pipeline_status['status']}\nStage: {pipeline_status['stage']}\nCommit: {pipeline_status['commit_message']}"
            
            pod_status_str = f"Phase: {pod['phase']}, Reason: {pod['reason']}, Message: {pod['message']}"
            
            # Generate RCA
            rca_result = await self.gemini_service.analyze_incident(pod_name, pod_status_str, combined_logs)
            
            # Generate Remediation Plan
            remediation_plan = await self.gemini_service.generate_remediation_plan(pod_name, rca_result, combined_logs)
            
            plan_id = None
            if remediation_plan:
                plan_id = await self.remediation_workflow.store_plan(remediation_plan)
                
                # Auto-trigger GitLab pipeline if enabled and plan contains trigger_gitlab_pipeline action
                if gitlab_enabled and plan_id and not loop_detected:
                    has_gitlab_action = any(
                        action.action_type == "trigger_gitlab_pipeline"
                        for action in remediation_plan.actions
                    )
                    if has_gitlab_action:
                        logger.info(f"Auto-triggering remediation plan {plan_id} in background since gitlab is enabled.")
                        asyncio.create_task(self.remediation_workflow.approve_and_execute(plan_id))
            
            # Create or update incident in MongoDB
            await db.incidents.update_one(
                {"id": pod_id, "status": "active"},
                {
                    "$set": {
                        "status": "active",
                        "pod": pod,
                        "last_seen": datetime.now(timezone.utc),
                        "rca": rca_result,
                        "logs_context": combined_logs,
                        "plan_summary": remediation_plan.summary if remediation_plan else None,
                        "plan_id": plan_id,
                        "plan_actions": [a.model_dump() for a in remediation_plan.actions] if remediation_plan else [],
                        "ai_failed": plan_id is None,
                        "error_type": "API_KEY_BLOCKED" if plan_id is None and "API_KEY_SERVICE_BLOCKED" in rca_result else "GENERIC_FAILURE" if plan_id is None else None,
                        "cluster_id": cluster_id,
                        "gitlab_pipeline": pipeline_status,
                        "loop_detected": loop_detected,
                        "requires_manual_approval": True if loop_detected else False
                    },
                    "$setOnInsert": {
                        "id": pod_id,
                        "first_detected": datetime.now(timezone.utc).isoformat()
                    }
                },
                upsert=True
            )
            
            incident_data = await db.incidents.find_one({"id": pod_id, "status": "active"})
            if incident_data:
                incident_data["_id"] = str(incident_data["_id"])
                incidents.append(incident_data)

                # Index incident into Elasticsearch for search and RCA context
                try:
                    # Normalize dates to ISO if necessary
                    if isinstance(incident_data.get("created_at"), (str,)):
                        # keep as-is
                        pass
                    # Store incident document
                    store_incident(incident_data)
                except Exception as e:
                    logger.error(f"Error indexing incident into Elasticsearch: {e}")

                # Store RCA and remediation artifacts in ES if available
                try:
                    if incident_data.get("rca"):
                        store_rca(
                            incident_id=incident_data.get("id"),
                            analysis=incident_data.get("rca"),
                            root_causes=incident_data.get("rca"),
                            affected_resources=[pod_name],
                            confidence_score=1.0,
                        )
                except Exception as e:
                    logger.error(f"Error indexing RCA into Elasticsearch: {e}")

                try:
                    if plan_id:
                        # store a summary remediation document
                        store_remediation(
                            incident_id=incident_data.get("id"),
                            action_type="autogenerated_plan",
                            target_resource=pod_name,
                            namespace=pod_ns,
                            status="created",
                            details=str(remediation_plan.summary) if remediation_plan else "",
                        )
                except Exception as e:
                    logger.error(f"Error indexing remediation into Elasticsearch: {e}")
            
        # 3. Resolution Tracking: Check if previously active incidents are now resolved
        try:
            # Only consider incidents for the namespaces and cluster we actually scanned
            resolution_query = {"status": "active"}
            if namespaces and "*" not in namespaces:
                resolution_query["pod.namespace"] = {"$in": namespaces}
            if cluster_id:
                resolution_query["cluster_id"] = cluster_id
            else:
                resolution_query["cluster_id"] = {"$in": [None, "local-minikube"]}
            
            active_incidents_in_db = await db.incidents.find(resolution_query).to_list(1000)
            for doc in active_incidents_in_db:
                doc_id = doc.get("id")
                if doc_id and doc_id not in current_failed_pod_ids:
                    # Pod is no longer in the failed list. Verify health.
                    pod_name = doc["pod"]["name"]
                    pod_ns = doc["pod"]["namespace"]
                    if self.k8s_service.verify_pod_health(pod_name, pod_ns):
                        logger.info(f"Incident for pod {pod_name} resolved. Updating status and generating postmortem.")
                        resolved_at = datetime.now(timezone.utc).isoformat()
                        
                        await db.incidents.update_one(
                            {"_id": doc["_id"]},
                            {
                                "$set": {
                                    "status": "resolved", 
                                    "resolved_at": resolved_at
                                }
                            }
                        )
                        
                        doc["status"] = "resolved"
                        doc["resolved_at"] = resolved_at
                        
                        from app.services.reporting_service import ReportingService
                        rs = ReportingService()
                        await rs.generate_postmortem(doc)
        except Exception as e:
            logger.error(f"Error during resolution tracking: {e}")
            
        return {"status": "issues_found", "incidents": incidents}
