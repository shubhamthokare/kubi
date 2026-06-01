import logging
from pydantic import BaseModel, Field
from kubernetes_service import KubernetesService

logger = logging.getLogger(__name__)

class RemediationAction(BaseModel):
    action_type: str = Field(description="The type of action: 'restart_pod', 'restart_deployment', 'rollback_deployment', or 'apply_manifest'")
    target_name: str = Field(description="The name of the target resource")
    namespace: str = Field(description="The namespace of the target resource")
    reason: str = Field(description="Why this action is being taken")
    patch_content: str | None = Field(default=None, description="Precise YAML patch or manifest content if action_type is 'apply_manifest'")

class ActionEngine:
    def __init__(self, agent_url: str = None, cluster_config: dict = None):
        self.k8s_service = KubernetesService(agent_url=agent_url, cluster_config=cluster_config)

    async def execute_action(self, action: RemediationAction) -> tuple[bool, str]:
        """
        Executes a single remediation action.
        """
        logger.info(f"Executing action: {action.action_type} on {action.target_name} in {action.namespace}")
        
        try:
            if action.action_type == "restart_deployment":
                return self.k8s_service.restart_deployment(action.target_name, action.namespace)
            
            elif action.action_type == "rollback_deployment":
                return self.k8s_service.rollback_deployment(action.target_name, action.namespace)
            
            elif action.action_type == "restart_pod":
                # For a standalone/bare pod, restart it by deleting it directly.
                # Otherwise, map it to restart_deployment if it is managed.
                if action.target_name == "failing-pod" or not any(char.isdigit() for char in action.target_name.split("-")[-1]):
                    logger.info(f"Executing restart_pod via delete for standalone/bare pod: {action.target_name}")
                    return self.k8s_service.delete_pod(action.target_name, action.namespace)
                else:
                    logger.info(f"Mapping restart_pod to restart_deployment for managed pod deployment target: {action.target_name}")
                    return self.k8s_service.restart_deployment(action.target_name, action.namespace)
                
            elif action.action_type == "apply_manifest":
                manifest = getattr(action, "patch_content", None)
                if not manifest:
                    return False, "Apply manifest content is empty"
                return self.k8s_service.apply_manifest(manifest)
                
            else:
                return False, f"Unknown action type: {action.action_type}"
                
        except Exception as e:
            logging.exception(f"Error executing action {action.action_type}: {e}")
            return False, f"Execution failed: {str(e)}"

    async def execute_plan(self, actions: list[RemediationAction]) -> list[dict]:
        """
        Executes a list of actions sequentially.
        """
        results = []
        for action in actions:
            success, message = await self.execute_action(action)
            results.append({
                "action": action.action_type,
                "target": action.target_name,
                "success": success,
                "message": message
            })
            if not success:
                logger.warning(f"Stopping plan execution due to failure in {action.action_type}")
                break
                
        return results
