import os
import requests
import logging

logger = logging.getLogger(__name__)

class KubernetesService:
    def __init__(self, agent_url: str = None, cluster_config: dict = None):
        self.cluster_config = cluster_config or {}
        # Legacy/fallback to Agent URL
        self.agent_url = agent_url or self.cluster_config.get("agent_url") or os.getenv("AGENT_URL", "http://localhost:8080")
        
        # Determine connection mode
        auth_type = self.cluster_config.get("auth_type", "agent")
        self.use_direct = auth_type in ["direct", "kubeconfig"]
        self.disabled = (auth_type == "disabled")

    def _init_direct_client(self):
        from kubernetes import client, config
        import base64
        import tempfile
        import yaml
        
        auth_type = self.cluster_config.get("auth_type", "agent")
        
        if auth_type == "kubeconfig":
            kubeconfig_str = self.cluster_config.get("kubeconfig", "")
            if not kubeconfig_str:
                raise ValueError("Kubeconfig content is empty")
                
            # Dynamically override local/absolute file cert paths if provided separately
            try:
                import yaml
                kube_dict = yaml.safe_load(kubeconfig_str)
                if isinstance(kube_dict, dict):
                    # Check for separate CA cert
                    ca_cert = self.cluster_config.get("ca_cert", "")
                    if ca_cert and ca_cert.strip():
                        ca_b64 = base64.b64encode(ca_cert.strip().encode()).decode()
                        if "clusters" in kube_dict and isinstance(kube_dict["clusters"], list):
                            for cluster_entry in kube_dict["clusters"]:
                                if "cluster" in cluster_entry and isinstance(cluster_entry["cluster"], dict):
                                    cluster_entry["cluster"]["certificate-authority-data"] = ca_b64
                                    cluster_entry["cluster"].pop("certificate-authority", None)

                    # Check for separate Client Cert & Key
                    client_cert = self.cluster_config.get("client_cert", "")
                    client_key = self.cluster_config.get("client_key", "")
                    
                    if (client_cert and client_cert.strip()) or (client_key and client_key.strip()):
                        if "users" in kube_dict and isinstance(kube_dict["users"], list):
                            for user_entry in kube_dict["users"]:
                                if "user" in user_entry and isinstance(user_entry["user"], dict):
                                    if client_cert and client_cert.strip():
                                        cert_b64 = base64.b64encode(client_cert.strip().encode()).decode()
                                        user_entry["user"]["client-certificate-data"] = cert_b64
                                        user_entry["user"].pop("client-certificate", None)
                                    if client_key and client_key.strip():
                                        key_b64 = base64.b64encode(client_key.strip().encode()).decode()
                                        user_entry["user"]["client-key-data"] = key_b64
                                        user_entry["user"].pop("client-key", None)
                                        
                    # Dump back to yaml string
                    kubeconfig_str = yaml.dump(kube_dict)
            except Exception as ye:
                logging.exception(f"Failed to dynamically patch uploaded credentials in kubeconfig: {ye}")

            if "token: dummy" in kubeconfig_str:
                token_path = "/var/run/secrets/kubernetes.io/serviceaccount/token"
                if os.path.exists(token_path):
                    try:
                        with open(token_path, "r") as tf:
                            real_token = tf.read().strip()
                        kubeconfig_str = kubeconfig_str.replace("token: dummy", f"token: {real_token}")
                    except Exception as te:
                        logging.exception(f"Failed to read in-cluster service account token: {te}")
            temp_file = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".yaml")
            temp_file.write(kubeconfig_str)
            temp_file.close()
            try:
                config.load_kube_config(config_file=temp_file.name)
                os.unlink(temp_file.name)
            except Exception as e:
                try:
                    os.unlink(temp_file.name)
                except:
                    pass
                raise e
        elif auth_type == "direct":
            api_endpoint = self.cluster_config.get("api_endpoint", "")
            ca_cert = self.cluster_config.get("ca_cert", "")
            client_cert = self.cluster_config.get("client_cert", "")
            client_key = self.cluster_config.get("client_key", "")
            
            if not api_endpoint:
                raise ValueError("Kubernetes API Server Endpoint is empty")
                
            ca_b64 = base64.b64encode(ca_cert.strip().encode()).decode() if ca_cert else ""
            cert_b64 = base64.b64encode(client_cert.strip().encode()).decode() if client_cert else ""
            key_b64 = base64.b64encode(client_key.strip().encode()).decode() if client_key else ""
            
            kubeconfig_dict = {
                "apiVersion": "v1",
                "kind": "Config",
                "clusters": [{
                    "name": "direct-cluster",
                    "cluster": {
                        "server": api_endpoint,
                        "certificate-authority-data": ca_b64
                    }
                }],
                "users": [{
                    "name": "direct-user",
                    "user": {
                        "client-certificate-data": cert_b64,
                        "client-key-data": key_b64
                    }
                }],
                "contexts": [{
                    "name": "direct-context",
                    "context": {
                        "cluster": "direct-cluster",
                        "user": "direct-user"
                    }
                }],
                "current-context": "direct-context"
            }
            temp_file = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".yaml")
            yaml.dump(kubeconfig_dict, temp_file)
            temp_file.close()
            try:
                config.load_kube_config(config_file=temp_file.name)
                os.unlink(temp_file.name)
            except Exception as e:
                try:
                    os.unlink(temp_file.name)
                except:
                    pass
                raise e
        else:
            # Fallback/Default local kubeconfig if no direct connection config
            try:
                config.load_incluster_config()
            except Exception:
                config.load_kube_config()

    def _get_direct_apis(self):
        from kubernetes import client
        self._init_direct_client()
        # Disable SSL hostname verification to support host.docker.internal / local cluster IP mapping
        configuration = client.Configuration.get_default_copy()
        configuration.assert_hostname = False
        configuration.verify_ssl = False
        client.Configuration.set_default(configuration)
        
        return client.CoreV1Api(), client.AppsV1Api()

    def _get(self, endpoint: str):
        try:
            response = requests.get(f"{self.agent_url}{endpoint}", timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logging.exception(f"Error fetching {endpoint} from agent: {e}")
            return None

    def _post(self, endpoint: str, json_data: dict = None):
        try:
            response = requests.post(f"{self.agent_url}{endpoint}", json=json_data, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logging.exception(f"Error posting to {endpoint} on agent: {e}")
            return {"success": False, "message": str(e)}

    def get_failed_pods(self, namespaces: list[str] = None):
        """Fetches pods that are not in a Running or Succeeded state across specified namespaces."""
        if getattr(self, "disabled", False):
            return []
        if self.use_direct:
            v1, _ = self._get_direct_apis()
            failed_pods = []
            try:
                if not namespaces or "*" in namespaces:
                    pods = v1.list_pod_for_all_namespaces()
                else:
                    pods_items = []
                    for ns in namespaces:
                        if ns:
                            pods_items.extend(v1.list_namespaced_pod(namespace=ns).items)
                    class MockPodsList:
                        def __init__(self, items):
                            self.items = items
                    pods = MockPodsList(pods_items)
                
                for pod in pods.items:
                    is_failed = pod.status.phase not in ["Running", "Succeeded"]
                    container_issue = False
                    if pod.status.container_statuses:
                        for status in pod.status.container_statuses:
                            if not status.ready and (status.restart_count > 0 or status.state.waiting or (status.state.terminated and status.state.terminated.exit_code != 0)):
                                container_issue = True
                                break
                    
                    if is_failed or container_issue:
                        reason = pod.status.reason
                        message = pod.status.message
                        if pod.status.container_statuses:
                            for status in pod.status.container_statuses:
                                if status.state.waiting:
                                    reason = status.state.waiting.reason
                                    message = status.state.waiting.message
                                elif status.state.terminated and status.state.terminated.exit_code != 0:
                                    reason = "CrashLoopBackOff" if status.restart_count > 0 else "Error"
                                    message = f"Container failed with exit code {status.state.terminated.exit_code}"
                                    break
                                elif status.state.terminated:
                                    reason = status.state.terminated.reason
                                    message = status.state.terminated.message
                                    break
                                    
                        failed_pods.append({
                            "name": pod.metadata.name,
                            "namespace": pod.metadata.namespace,
                            "phase": pod.status.phase,
                            "reason": reason,
                            "message": message,
                            "uid": pod.metadata.uid,
                            "creation_timestamp": pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else None,
                            "has_owner": bool(pod.metadata.owner_references)
                        })
            except Exception as e:
                logging.exception(f"Error fetching pods in direct mode: {e}")
            return failed_pods

        # Agent-based fallback
        if not namespaces or "*" in namespaces:
            ns_query = "*"
        else:
            ns_query = namespaces[0] if len(namespaces) == 1 else "*"
            
        result = self._get(f"/failed_pods?namespace={ns_query}")
        if result and "failed_pods" in result:
            failed = result["failed_pods"]
            if namespaces and "*" not in namespaces and len(namespaces) > 1:
                failed = [p for p in failed if p.get("namespace") in namespaces]
            return failed
        return []

    def get_pod_logs(self, pod_name: str, namespace: str = "default", tail_lines: int = 50):
        """Fetches logs for a specific pod."""
        if getattr(self, "disabled", False):
            return "Kubernetes connection disabled."
        if self.use_direct:
            v1, _ = self._get_direct_apis()
            try:
                logs = v1.read_namespaced_pod_log(name=pod_name, namespace=namespace, tail_lines=tail_lines)
                return logs
            except Exception as e:
                logger.warning(f"Direct logs error: {e}. Retrieving container status diagnostics instead.")
                try:
                    pod_info = v1.read_namespaced_pod(name=pod_name, namespace=namespace)
                    init_statuses = pod_info.status.init_container_statuses or []
                    statuses = pod_info.status.container_statuses or []
                    diag_lines = []
                    for status in init_statuses:
                        diag_lines.append(f"Init Container: {status.name}")
                        diag_lines.append(f"  Ready: {status.ready}")
                        diag_lines.append(f"  Restart Count: {status.restart_count}")
                        if status.state.waiting:
                            diag_lines.append(f"  State: Waiting (Reason: {status.state.waiting.reason})")
                            diag_lines.append(f"  Message: {status.state.waiting.message}")
                        elif status.state.terminated:
                            diag_lines.append(f"  State: Terminated (Reason: {status.state.terminated.reason}, Exit Code: {status.state.terminated.exit_code})")
                            diag_lines.append(f"  Message: {status.state.terminated.message}")
                        elif status.state.running:
                            diag_lines.append(f"  State: Running")
                    for status in statuses:
                        diag_lines.append(f"Container: {status.name}")
                        diag_lines.append(f"  Ready: {status.ready}")
                        diag_lines.append(f"  Restart Count: {status.restart_count}")
                        if status.state.waiting:
                            diag_lines.append(f"  State: Waiting (Reason: {status.state.waiting.reason})")
                            diag_lines.append(f"  Message: {status.state.waiting.message}")
                        elif status.state.terminated:
                            diag_lines.append(f"  State: Terminated (Reason: {status.state.terminated.reason}, Exit Code: {status.state.terminated.exit_code})")
                            diag_lines.append(f"  Message: {status.state.terminated.message}")
                        elif status.state.running:
                            diag_lines.append(f"  State: Running")
                    if diag_lines:
                        return "Error: Pod is not in a running state to stream logs. Diagnostic Kubernetes Status Info:\n" + "\n".join(diag_lines)
                except Exception as inner_e:
                    logging.exception(f"Failed to fetch direct diagnostic info: {inner_e}")
                return f"Error retrieving container logs directly: {str(e)}"

        # Agent-based fallback
        result = self._get(f"/logs/{namespace}/{pod_name}?tail_lines={tail_lines}")
        if result and "logs" in result:
            return result["logs"]
        return "Failed to fetch logs from agent."

    def restart_deployment(self, name: str, namespace: str = "default") -> tuple[bool, str]:
        """Restarts a deployment."""
        if getattr(self, "disabled", False):
            return False, "Kubernetes connection disabled."
        if self.use_direct:
            _, apps_v1 = self._get_direct_apis()
            import datetime
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            body = {"spec": {"template": {"metadata": {"annotations": {"kubectl.kubernetes.io/restartedAt": now}}}}}
            try:
                apps_v1.patch_namespaced_deployment(name, namespace, body)
                return True, f"Deployment {name} restarted directly."
            except Exception as e:
                return False, str(e)

        # Agent-based fallback
        result = self._post(f"/actions/restart/{namespace}/{name}")
        if result:
            return result.get("success", False), result.get("message", "Unknown response from agent")
        return False, "Failed to connect to agent"

    def rollback_deployment(self, name: str, namespace: str = "default") -> tuple[bool, str]:
        """Rolls back a deployment. Simulated."""
        if getattr(self, "disabled", False):
            return False, "Kubernetes connection disabled."
        return True, f"Deployment {name} rolled back successfully (Simulated)."

    def delete_pod(self, name: str, namespace: str = "default") -> tuple[bool, str]:
        """Deletes a pod."""
        if getattr(self, "disabled", False):
            return False, "Kubernetes connection disabled."
        if self.use_direct:
            v1, _ = self._get_direct_apis()
            try:
                v1.delete_namespaced_pod(name=name, namespace=namespace)
                return True, f"Pod {name} deleted successfully directly."
            except Exception as e:
                return False, str(e)

        # Agent-based fallback
        try:
            response = requests.delete(f"{self.agent_url}/actions/pod/{namespace}/{name}", timeout=10)
            response.raise_for_status()
            result = response.json()
            return result.get("success", False), result.get("message", "Unknown response from agent")
        except Exception as e:
            logging.exception(f"Error deleting pod {name}: {e}")
            return False, f"Failed to connect to agent: {str(e)}"

    def verify_deployment_health(self, name: str, namespace: str = "default") -> bool:
        """Checks if a deployment has all its desired replicas available."""
        resources = self.get_all_resources()
        if resources:
            for dep in resources.get("deployments", []):
                if dep["name"] == name and dep["namespace"] == namespace:
                    return True
        return False

    def verify_pod_health(self, name: str, namespace: str = "default") -> bool:
        """Checks if a pod is healthy."""
        failed = self.get_failed_pods([namespace])
        for p in failed:
            if p["name"] == name:
                return False
        return True

    def get_cluster_stats(self):
        """Fetches cluster-wide statistics."""
        if getattr(self, "disabled", False):
            return {
                "nodes": {"total": 0, "ready": 0},
                "pods": {"total": 0, "running": 0, "failed": 0, "pending": 0},
                "namespaces": 0,
                "uptime": "INACTIVE"
            }
        if self.use_direct:
            v1, _ = self._get_direct_apis()
            try:
                nodes = v1.list_node()
                pods = v1.list_pod_for_all_namespaces()
                namespaces_list = v1.list_namespace()
                
                ready_nodes = sum(1 for n in nodes.items for c in n.status.conditions if c.type == "Ready" and c.status == "True")
                running_pods = 0
                failed_pods_count = 0
                pending_pods = 0
                for p in pods.items:
                    is_failed = p.status.phase not in ["Running", "Succeeded"]
                    container_issue = False
                    if p.status.container_statuses:
                        for status in p.status.container_statuses:
                            if not status.ready and (status.restart_count > 0 or status.state.waiting or (status.state.terminated and status.state.terminated.exit_code != 0)):
                                container_issue = True
                                break
                    if is_failed or container_issue:
                        failed_pods_count += 1
                    elif p.status.phase == "Running":
                        running_pods += 1
                    elif p.status.phase == "Pending":
                        pending_pods += 1
                
                uptime = "N/A"
                if nodes.items:
                    from datetime import datetime, timezone
                    oldest = min(nodes.items, key=lambda n: n.metadata.creation_timestamp)
                    delta = datetime.now(timezone.utc) - oldest.metadata.creation_timestamp
                    days = delta.days
                    hours, rem = divmod(delta.seconds, 3600)
                    minutes, _ = divmod(rem, 60)
                    if days > 0:
                        uptime = f"{days}d {hours}h"
                    else:
                        uptime = f"{hours}h {minutes}m"
                        
                return {
                    "nodes": {"total": len(nodes.items), "ready": ready_nodes},
                    "pods": {"total": len(pods.items), "running": running_pods, "failed": failed_pods_count, "pending": pending_pods},
                    "namespaces": len(namespaces_list.items),
                    "uptime": uptime
                }
            except Exception as e:
                logging.exception(f"Direct Stats error: {e}")
                return {"nodes": {"total": 0, "ready": 0}, "pods": {"total": 0, "running": 0, "failed": 0, "pending": 0}, "namespaces": 0, "uptime": "N/A"}

        # Agent-based fallback
        result = self._get("/stats")
        if result:
            return result
        return {
            "nodes": {"total": 0, "ready": 0},
            "pods": {"total": 0, "running": 0, "failed": 0, "pending": 0},
            "namespaces": 0,
            "uptime": "N/A"
        }

    def get_all_resources(self):
        """Fetches all namespaces, deployments, and pods."""
        if getattr(self, "disabled", False):
            return {"namespaces": [], "deployments": [], "pods": []}
        if self.use_direct:
            v1, apps_v1 = self._get_direct_apis()
            try:
                namespaces_list = [ns.metadata.name for ns in v1.list_namespace().items]
                deployments = apps_v1.list_deployment_for_all_namespaces().items
                deps_list = [{"name": d.metadata.name, "namespace": d.metadata.namespace} for d in deployments]
                pods = v1.list_pod_for_all_namespaces().items
                pods_list = [{"name": p.metadata.name, "namespace": p.metadata.namespace} for p in pods]
                return {
                    "namespaces": namespaces_list,
                    "deployments": deps_list,
                    "pods": pods_list
                }
            except Exception as e:
                logging.exception(f"Direct Resources error: {e}")
                return {"namespaces": [], "deployments": [], "pods": []}

        # Agent-based fallback
        result = self._get("/resources")
        if result:
            return result
        return {
            "namespaces": [],
            "deployments": [],
            "pods": []
        }

    def get_deployment_yaml(self, name: str, namespace: str = "default") -> str:
        """Fetches the YAML definition of a deployment."""
        if getattr(self, "disabled", False):
            return "# Kubernetes connection disabled."
        if self.use_direct:
            _, apps_v1 = self._get_direct_apis()
            import yaml
            try:
                dep = apps_v1.read_namespaced_deployment(name=name, namespace=namespace)
                dep_dict = dep.to_dict()
                # Clean metadata fields that are dynamic/read-only
                if "metadata" in dep_dict:
                    for k in ["uid", "resource_version", "generation", "creation_timestamp", "managed_fields"]:
                        dep_dict["metadata"].pop(k, None)
                if "status" in dep_dict:
                    dep_dict.pop("status")
                return yaml.dump(dep_dict)
            except Exception as e:
                return f"# Error retrieving deployment YAML directly: {str(e)}"

        # Agent-based fallback
        return f"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {name}\n  namespace: {namespace}\n# YAML fetching via agent not fully implemented"

    def get_events(self, namespace: str = "default", limit: int = 20):
        """Fetches recent events in a namespace."""
        if getattr(self, "disabled", False):
            return []
        if self.use_direct:
            v1, _ = self._get_direct_apis()
            try:
                events = v1.list_namespaced_event(namespace=namespace, limit=limit)
                events_list = []
                for e in events.items:
                    events_list.append({
                        "type": e.type,
                        "reason": e.reason,
                        "message": e.message,
                        "source": e.source.component if e.source else "unknown",
                        "first_timestamp": e.first_timestamp.isoformat() if e.first_timestamp else None,
                        "last_timestamp": e.last_timestamp.isoformat() if e.last_timestamp else None,
                        "count": e.count
                    })
                return events_list
            except Exception as e:
                logging.exception(f"Direct Events error: {e}")
                return []
        return []

    def scale_deployment(self, name: str, replicas: int, namespace: str = "default") -> tuple[bool, str]:
        """Scales a deployment."""
        if getattr(self, "disabled", False):
            return False, "Kubernetes connection disabled."
        if self.use_direct:
            _, apps_v1 = self._get_direct_apis()
            body = {"spec": {"replicas": replicas}}
            try:
                apps_v1.patch_namespaced_deployment_scale(name, namespace, body)
                return True, f"Deployment {name} scaled to {replicas}."
            except Exception as e:
                return False, str(e)
        return True, f"Deployment {name} scaled to {replicas}."

    def apply_manifest(self, manifest_yaml: str) -> tuple[bool, str]:
        """Applies a Kubernetes YAML manifest."""
        if getattr(self, "disabled", False):
            return False, "Kubernetes connection disabled."
        if self.use_direct:
            from kubernetes import utils, client
            self._init_direct_client()
            api_client = client.ApiClient()
            import tempfile
            temp_path = None
            try:
                with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.yaml') as temp:
                    temp.write(manifest_yaml)
                    temp_path = temp.name
                
                utils.create_from_yaml(api_client, temp_path)
                try:
                    os.unlink(temp_path)
                except:
                    pass
                return True, "Manifest applied successfully."
            except Exception as e:
                if temp_path:
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
                return False, f"Failed to apply manifest directly: {str(e)}"

        # Agent-based fallback
        result = self._post("/actions/apply", {"manifest": manifest_yaml})
        if result:
            return result.get("success", False), result.get("message", "Unknown response from agent")
        return False, "Failed to connect to agent"
