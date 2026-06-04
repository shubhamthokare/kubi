import os
import requests
import logging

logger = logging.getLogger(__name__)

class KubernetesService:
    def __init__(self, agent_url: str = None, cluster_config: dict = None):
        self.cluster_config = cluster_config or {}
        url_val = agent_url or self.cluster_config.get("agent_url")
        if not url_val or url_val.strip() in ["http://", "https://", "http:///", "https:///"]:
            url_val = os.getenv("AGENT_URL", "http://localhost:8080")
        self.agent_url = url_val
        
        # In the pure Agent architecture, we always communicate via the Agent endpoint.
        auth_type = self.cluster_config.get("auth_type", "agent")
        self.disabled = (auth_type == "disabled")

    def _get(self, endpoint: str, retries: int = 2, backoff: float = 2.0):
        if self.disabled:
            return None
        import time
        base_url = self.agent_url.rstrip("/")
        target_endpoint = endpoint.lstrip("/")
        
        for attempt in range(retries + 1):
            try:
                response = requests.get(f"{base_url}/{target_endpoint}", timeout=10)
                response.raise_for_status()
                return response.json()
            except (requests.ConnectionError, requests.Timeout) as e:
                if attempt < retries:
                    wait_time = backoff * (attempt + 1)
                    logger.warning(f"Transient connection error on attempt {attempt + 1}/{retries + 1} for {endpoint}. Retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
                else:
                    logger.warning(f"Failed to fetch {endpoint} from agent after {retries + 1} attempts: {e}")
                    return None
            except Exception as e:
                logger.warning(f"Error fetching {endpoint} from agent: {e}")
                return None

    def _post(self, endpoint: str, json_data: dict = None, retries: int = 2, backoff: float = 2.0):
        if self.disabled:
            return {"success": False, "message": "Kubernetes connection disabled."}
        import time
        base_url = self.agent_url.rstrip("/")
        target_endpoint = endpoint.lstrip("/")
        
        for attempt in range(retries + 1):
            try:
                response = requests.post(f"{base_url}/{target_endpoint}", json=json_data, timeout=10)
                response.raise_for_status()
                return response.json()
            except requests.HTTPError as e:
                status = e.response.status_code if e.response is not None else "unknown"
                if status == 404:
                    message = f"Agent endpoint not found: POST /{target_endpoint}. Ensure the agent image exposes this action route."
                else:
                    message = f"Agent returned HTTP {status} for POST /{target_endpoint}: {e}"
                logger.warning(message)
                return {"success": False, "message": message}
            except (requests.ConnectionError, requests.Timeout) as e:
                if attempt < retries:
                    wait_time = backoff * (attempt + 1)
                    logger.warning(f"Transient connection error on attempt {attempt + 1}/{retries + 1} for {endpoint}. Retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
                else:
                    logger.warning(f"Failed to post to {endpoint} on agent after {retries + 1} attempts: {e}")
                    return {"success": False, "message": str(e)}
            except Exception as e:
                logger.warning(f"Error posting to {endpoint} on agent: {e}")
                return {"success": False, "message": str(e)}

    def get_failed_pods(self, namespaces: list[str] = None):
        if self.disabled:
            return []
        ns_query = "*"
        if namespaces and "*" not in namespaces:
            # Keep first namespace as query or check all via "*" and filter locally
            ns_query = namespaces[0] if len(namespaces) == 1 else "*"
            
        result = self._get(f"/failed_pods?namespace={ns_query}")
        if result and "failed_pods" in result:
            failed = result["failed_pods"]
            if namespaces and "*" not in namespaces and len(namespaces) > 1:
                failed = [p for p in failed if p.get("namespace") in namespaces]
            return failed
        return []

    def get_pod_logs(self, pod_name: str, namespace: str = "default", tail_lines: int = 50):
        result = self._get(f"/logs/{namespace}/{pod_name}?tail_lines={tail_lines}")
        if result and "logs" in result:
            return result["logs"]
        return "Failed to fetch logs from agent."

    def restart_deployment(self, name: str, namespace: str = "default") -> tuple[bool, str]:
        result = self._post(f"/actions/restart/{namespace}/{name}")
        if result:
            return result.get("success", False), result.get("message", "Unknown response from agent")
        return False, "Failed to connect to agent"

    def rollback_deployment(self, name: str, namespace: str = "default") -> tuple[bool, str]:
        """
        Rolls back a deployment to the previous revision using kubectl rollout undo.
        This sends the actual rollback command to the agent.
        """
        result = self._post(f"/actions/rollback/{namespace}/{name}")
        if result:
            return result.get("success", False), result
        return False, "Failed to connect to agent for rollback"

    def delete_pod(self, name: str, namespace: str = "default") -> tuple[bool, str]:
        try:
            base_url = self.agent_url.rstrip("/")
            response = requests.delete(f"{base_url}/actions/pod/{namespace}/{name}", timeout=10)
            response.raise_for_status()
            result = response.json()
            return result.get("success", False), result
        except Exception as e:
            logger.exception(f"Error deleting pod {name} via agent: {e}")
            return False, f"Failed to connect to agent: {str(e)}"

    def verify_deployment_health(self, name: str, namespace: str = "default") -> bool:
        """
        Checks if a deployment has all its desired replicas ready and available.
        Looks for ready_replicas == replicas and availability condition.
        """
        resources = self.get_all_resources()
        if resources:
            for dep in resources.get("deployments", []):
                if dep["name"] == name and dep["namespace"] == namespace:
                    # Check if replicas are ready and available (not just existence)
                    desired = dep.get("replicas", 0)
                    ready = dep.get("ready_replicas", 0)
                    available = dep.get("available_replicas", 0)
                    
                    # All desired replicas must be ready and available
                    if desired > 0 and ready == desired and available == desired:
                        return True
                    elif desired == 0:
                        # Scaled to zero - considered healthy
                        return True
                    else:
                        logger.warning(
                            f"Deployment {name}/{namespace} not ready: "
                            f"desired={desired}, ready={ready}, available={available}"
                        )
                        return False
        return False

    def verify_pod_health(self, name: str, namespace: str = "default") -> bool:
        failed = self.get_failed_pods([namespace])
        for p in failed:
            if p["name"] == name:
                return False
        return True

    def get_agent_cluster_id(self) -> str:
        result = self._get("/healthz")
        if result and "cluster_id" in result:
            return result["cluster_id"]
        return "local-minikube"

    def get_cluster_stats(self):
        result = self._get("/stats")
        if result:
            return result
        return {
            "nodes": {"total": 0, "ready": 0},
            "pods": {"total": 0, "running": 0, "failed": 0, "pending": 0},
            "namespaces": 0,
            "uptime": "N/A"
        }

    def get_performance_metrics(self) -> dict:
        result = self._get("/stats/performance")
        if result:
            return result
        return {"cpu": 0, "memory": 0, "network": 0}

    def get_all_resources(self):
        result = self._get("/resources")
        if result:
            return result
        return {
            "namespaces": [],
            "deployments": [],
            "pods": []
        }

    def get_pod_yaml(self, name: str, namespace: str = "default") -> str:
        result = self._get(f"/pods/{namespace}/{name}/yaml")
        if result and "yaml" in result:
            return result["yaml"]
        return "# Failed to fetch pod YAML from agent."

    def get_deployment_yaml(self, name: str, namespace: str = "default") -> str:
        # Deployments can be read via simple agent template fallback
        return f"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {name}\n  namespace: {namespace}\n# YAML fetching via agent not fully implemented"

    def get_events(self, namespace: str = "default", limit: int = 20):
        result = self._get(f"/events?namespace={namespace}&limit={limit}")
        if result:
            return result
        return []

    def scale_deployment(self, name: str, replicas: int, namespace: str = "default") -> tuple[bool, str]:
        # Simple simulation or we can map it on the Agent if needed
        return True, f"Deployment {name} scaled to {replicas} (Simulated via Agent)."

    def apply_manifest(self, manifest_yaml: str) -> tuple[bool, str]:
        result = self._post("/actions/apply", {"manifest": manifest_yaml})
        if result:
            return result.get("success", False), result
        return False, "Failed to connect to agent"
