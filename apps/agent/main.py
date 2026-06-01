"""
Kubi Agent Service

Copyright (c) 2026 Kubi AI Authors
Licensed under the MIT License - see LICENSE file for details.

This module provides the Kubernetes cluster agent that continuously monitors
pod health, detects failures, collects telemetry, and communicates with the
Kubi backend for AI-driven remediation.
"""

import os
import time
import requests
import logging
import asyncio
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from kubernetes import client, config
from kubernetes.client.rest import ApiException

# Initialize Arize AX tracing (must be before other operations)
from arize_tracing import initialize_arize_tracing
initialize_arize_tracing()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("kubi-agent")

KUBI_BACKEND_URL = os.getenv("KUBI_BACKEND_URL", "http://host.minikube.internal:8000")
CLUSTER_ID_ENV = os.getenv("CLUSTER_ID", "")
CLUSTER_ID = CLUSTER_ID_ENV if CLUSTER_ID_ENV and CLUSTER_ID_ENV.lower() not in ["auto", "dynamic"] else "remote-cluster-1"
NAMESPACE = os.getenv("TARGET_NAMESPACE", "default")
SCAN_INTERVAL = int(os.getenv("SCAN_INTERVAL", "30"))

app = FastAPI(title="Kubi Agent API")

try:
    config.load_incluster_config()
    logger.info("Loaded in-cluster Kubernetes config")
except config.ConfigException:
    logger.warning("Falling back to local kubeconfig")
    config.load_kube_config()

# Disable SSL hostname verification to support host.docker.internal / local cluster IP mapping
configuration = client.Configuration.get_default_copy()
configuration.assert_hostname = False
client.Configuration.set_default(configuration)

v1 = client.CoreV1Api()
apps_v1 = client.AppsV1Api()

def get_failed_pods(namespace: str):
    failed_pods = []
    try:
        if not namespace or namespace == "*":
            pods = v1.list_pod_for_all_namespaces()
        else:
            pods = v1.list_namespaced_pod(namespace=namespace)
        
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
    except ApiException as e:
        logging.exception(f"Error fetching pods: {e}")
    return failed_pods

def report_incident(pod_dict):
    incident_payload = {
        "pod_name": pod_dict["name"],
        "namespace": pod_dict["namespace"],
        "cluster_id": CLUSTER_ID,
        "status": "active",
        "phase": pod_dict["phase"],
        "title": f"Incident: {pod_dict['name']} failing in {CLUSTER_ID}"
    }

    try:
        response = requests.post(f"{KUBI_BACKEND_URL}/api/v1/incidents/ingest", json=incident_payload, timeout=5)
        if response.status_code in [200, 201]:
            logger.info(f"Successfully reported incident for pod: {pod_dict['name']}")
    except Exception as e:
        logging.exception(f"Error contacting Kubi backend: {e}")

async def background_scanner():
    while True:
        logger.info(f"Scanning namespace '{NAMESPACE}' for incidents...")
        # Since it's blocking API, we could run it in thread, but simple for now
        failed_pods = get_failed_pods(NAMESPACE)
        for pod in failed_pods:
            logger.info(f"Detected failing pod: {pod['name']}")
            report_incident(pod)
        await asyncio.sleep(SCAN_INTERVAL)

@app.on_event("startup")
async def startup_event():
    global CLUSTER_ID
    if not CLUSTER_ID_ENV or CLUSTER_ID_ENV.lower() in ["auto", "dynamic"]:
        # 1. Try to resolve CLUSTER_ID from current kubeconfig context name
        try:
            _, active_context = config.list_kube_config_contexts()
            if active_context and 'name' in active_context:
                CLUSTER_ID = active_context['name']
                logger.info(f"Dynamically resolved CLUSTER_ID from kubeconfig context: {CLUSTER_ID}")
        except Exception:
            pass

        # 2. Fall back to unique kube-system namespace UID
        if CLUSTER_ID == "remote-cluster-1":
            try:
                kube_system = v1.read_namespace(name="kube-system")
                if kube_system and kube_system.metadata and kube_system.metadata.uid:
                    short_uid = kube_system.metadata.uid[:8]
                    CLUSTER_ID = f"k8s-{short_uid}"
                    logger.info(f"Dynamically resolved CLUSTER_ID from kube-system namespace UID: {CLUSTER_ID}")
            except Exception as e:
                logger.warning(f"Could not dynamically read kube-system namespace UID: {e}")

    logger.info(f"Using CLUSTER_ID: {CLUSTER_ID}")
    asyncio.create_task(background_scanner())

@app.get("/healthz")
def healthz():
    return {"status": "ok", "cluster_id": CLUSTER_ID}

@app.get("/stats")
def get_stats():
    try:
        nodes = v1.list_node()
        pods = v1.list_pod_for_all_namespaces()
        namespaces_list = v1.list_namespace()
        
        ready_nodes = sum(1 for n in nodes.items for c in n.status.conditions if c.type == "Ready" and c.status == "True")
        running_pods = 0
        failed_pods = 0
        pending_pods = 0
        for p in pods.items:
            is_failed = p.status.phase not in ["Running", "Succeeded", "Pending"]
            container_issue = False
            if p.status.container_statuses:
                for status in p.status.container_statuses:
                    if not status.ready and (status.restart_count > 0 or status.state.waiting or (status.state.terminated and status.state.terminated.exit_code != 0)):
                        container_issue = True
                        break
            if is_failed or container_issue:
                failed_pods += 1
            elif p.status.phase == "Running":
                running_pods += 1
            elif p.status.phase == "Pending":
                pending_pods += 1
        
        total_active_pods = running_pods + failed_pods + pending_pods
        
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
            "pods": {"total": total_active_pods, "running": running_pods, "failed": failed_pods, "pending": pending_pods},
            "namespaces": len(namespaces_list.items),
            "uptime": uptime
        }
    except Exception as e:
        logging.exception(f"Stats error: {e}")
        return {"nodes": {"total": 0, "ready": 0}, "pods": {"total": 0, "running": 0, "failed": 0, "pending": 0}, "namespaces": 0, "uptime": "N/A"}

@app.get("/resources")
def get_resources():
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
        logging.exception(f"Resources error: {e}")
        return {"namespaces": [], "deployments": [], "pods": []}

@app.get("/logs/{namespace}/{pod}")
def get_logs(namespace: str, pod: str, tail_lines: int = 50):
    try:
        logs = v1.read_namespaced_pod_log(name=pod, namespace=namespace, tail_lines=tail_lines)
        return {"logs": logs}
    except ApiException as e:
        logger.warning(f"Logs error: {e}. Retrieving container status diagnostics instead.")
        try:
            pod_info = v1.read_namespaced_pod(name=pod, namespace=namespace)
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
                return {"logs": "Error: Pod is not in a running state to stream logs. Diagnostic Kubernetes Status Info:\n" + "\n".join(diag_lines)}
        except Exception as inner_e:
            logging.exception(f"Failed to fetch diagnostic info: {inner_e}")
        return {"logs": f"Error retrieving container logs: {str(e)}"}

@app.get("/failed_pods")
def list_failed_pods(namespace: str = "*"):
    return {"failed_pods": get_failed_pods(namespace)}

@app.post("/actions/restart/{namespace}/{deployment}")
def restart_deployment(namespace: str, deployment: str):
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    body = {"spec": {"template": {"metadata": {"annotations": {"kubectl.kubernetes.io/restartedAt": now}}}}}
    try:
        apps_v1.patch_namespaced_deployment(deployment, namespace, body)
        return {"success": True, "message": f"Deployment {deployment} restarted."}
    except ApiException as e:
        return {"success": False, "message": str(e)}

@app.delete("/actions/pod/{namespace}/{pod_name}")
def delete_pod(namespace: str, pod_name: str):
    try:
        v1.delete_namespaced_pod(name=pod_name, namespace=namespace)
        return {"success": True, "message": f"Pod {pod_name} deleted successfully."}
    except ApiException as e:
        return {"success": False, "message": str(e)}

class ManifestPayload(BaseModel):
    manifest: str

@app.post("/actions/apply")
def apply_manifest(payload: ManifestPayload):
    import yaml
    import tempfile
    import subprocess
    try:
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.yaml') as temp:
            temp.write(payload.manifest)
            temp_path = temp.name
        
        result = subprocess.run(["kubectl", "apply", "-f", temp_path], capture_output=True, text=True)
        os.unlink(temp_path)
        
        if result.returncode == 0:
            return {"success": True, "message": result.stdout}
        else:
            return {"success": False, "message": result.stderr}
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/pods/{namespace}/{pod_name}/yaml")
def get_pod_yaml(namespace: str, pod_name: str):
    try:
        pod = v1.read_namespaced_pod(name=pod_name, namespace=namespace)
        pod_dict = client.ApiClient().sanitize_for_serialization(pod)
        if "metadata" in pod_dict:
            for k in ["uid", "resourceVersion", "generation", "creationTimestamp", "managedFields"]:
                pod_dict["metadata"].pop(k, None)
        if "status" in pod_dict:
            pod_dict.pop("status")
        import yaml
        return {"yaml": yaml.dump(pod_dict)}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/stats/performance")
def get_performance_stats():
    try:
        from kubernetes_service import KubernetesService
        ks = KubernetesService()
        return ks.get_performance_metrics()
    except Exception as e:
        logger.exception(f"Failed to fetch performance stats: {e}")
        return {"cpu": 0, "memory": 0, "network": 0}

@app.get("/events")
def get_events(namespace: str = "default", limit: int = 20):
    try:
        from kubernetes_service import KubernetesService
        ks = KubernetesService()
        return ks.get_events(namespace, limit)
    except Exception as e:
        logger.exception(f"Failed to fetch events: {e}")
        return []

from action_engine import ActionEngine, RemediationAction

@app.post("/actions/execute")
async def execute_action(action: RemediationAction):
    try:
        engine = ActionEngine()
        success, message = await engine.execute_action(action)
        return {"success": success, "message": message}
    except Exception as e:
        logger.exception(f"Failed to execute action via ActionEngine: {e}")
        return {"success": False, "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080)
