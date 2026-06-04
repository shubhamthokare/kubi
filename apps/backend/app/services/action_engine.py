import logging
from app.services.kubernetes_service import KubernetesService
from app.services.gemini_service import RemediationAction

logger = logging.getLogger(__name__)

class ActionEngine:
    def __init__(self, agent_url: str = None, cluster_config: dict = None):
        self.k8s_service = KubernetesService(agent_url=agent_url, cluster_config=cluster_config)

    async def execute_action(self, action: RemediationAction) -> tuple[bool, str]:
        """
        Executes a single remediation action.
        """
        success, result = await self.execute_action_with_context(action)
        return success, result.get("message", "Action completed." if success else "Action failed.")

    async def _execute_action_raw(self, action: RemediationAction):
        logger.info(f"Executing action: {action.action_type} on {action.target_name} in {action.namespace}")
        
        try:
            if action.action_type == "restart_deployment":
                return self._normalize_result(*self.k8s_service.restart_deployment(action.target_name, action.namespace))
            
            elif action.action_type == "rollback_deployment":
                return self._normalize_result(*self.k8s_service.rollback_deployment(action.target_name, action.namespace))
            
            elif action.action_type == "restart_pod":
                # For a standalone/bare pod, restart it by deleting it directly.
                # Otherwise, map it to restart_deployment if it is managed.
                if action.target_name == "failing-pod" or not any(char.isdigit() for char in action.target_name.split("-")[-1]):
                    logger.info(f"Executing restart_pod via delete for standalone/bare pod: {action.target_name}")
                    return self._normalize_result(*self.k8s_service.delete_pod(action.target_name, action.namespace))
                else:
                    logger.info(f"Mapping restart_pod to restart_deployment for managed pod deployment target: {action.target_name}")
                    return self._normalize_result(*self.k8s_service.restart_deployment(action.target_name, action.namespace))
                
            elif action.action_type == "apply_manifest":
                manifest = getattr(action, "patch_content", None)
                if not manifest:
                    return False, "Apply manifest content is empty"
                return self._normalize_result(*self.k8s_service.apply_manifest(manifest))
                
            elif action.action_type == "trigger_gitlab_pipeline":
                from app.services.gitlab_service import GitLabService
                gitlab_service = GitLabService()
                return await gitlab_service.trigger_pipeline(action.target_name, "remediation")
                
            else:
                return False, f"Unknown action type: {action.action_type}"
                
        except Exception as e:
            logging.exception(f"Error executing action {action.action_type}: {e}")
            return False, f"Execution failed: {str(e)}"

    def _normalize_result(self, success: bool, result) -> tuple[bool, dict]:
        if isinstance(result, dict):
            payload = dict(result)
            payload.setdefault("success", success)
            payload.setdefault("message", "Action completed." if success else "Action failed.")
            return success, payload
        return success, {"success": success, "message": str(result)}

    async def execute_action_with_context(self, action: RemediationAction) -> tuple[bool, dict]:
        return self._normalize_result(*await self._execute_action_raw(action))

    async def execute_plan(self, actions: list[RemediationAction]) -> list[dict]:
        """
        Executes a list of actions sequentially.
        Stops on the first failed action so later remediation steps do not run on stale assumptions.
        """
        results = []
        partial_failure = False
        
        for action in actions:
            success, result = await self.execute_action_with_context(action)
            message = result.get("message") if isinstance(result, dict) else str(result)
            action_result = {
                "action_type": action.action_type,
                "target_name": action.target_name,
                "namespace": action.namespace,
                "success": success,
                "message": message
            }
            if isinstance(result, dict) and result.get("resource_context"):
                action_result["resource_context"] = result["resource_context"]
            results.append(action_result)
            
            if not success:
                partial_failure = True
                logger.warning(f"Stopping plan execution after failed {action.action_type} on {action.target_name}: {message}")
                break
            else:
                logger.info(f"Action {action.action_type} on {action.target_name} succeeded")
        
        # Store metadata about whether this was a partial execution
        if results:
            results[0]["partial_failure"] = partial_failure
        
        return results
