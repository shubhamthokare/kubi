from kubernetes import client, config
from kubernetes.client.rest import ApiException
import time
import os

def setup_scenario():
    print("Setting up Scenario: 'Broken Redis Deployment Recovery'")
    
    try:
        config.load_kube_config()
    except:
        config.load_incluster_config()
    
    v1 = client.CoreV1Api()
    apps_v1 = client.AppsV1Api()
    
    namespace = "payments"
    deployment_name = "payment-api"
    
    # 1. Create Namespace
    try:
        v1.create_namespace(client.V1Namespace(metadata=client.V1ObjectMeta(name=namespace)))
        print(f"Created namespace '{namespace}'")
    except ApiException as e:
        if e.status != 409: # Already exists
            print(f"Failed to create namespace: {e}")
            return

    # 2. Deploy Stable Version (v1.4.2)
    print(f"Deploying stable version {deployment_name}:v1.4.2...")
    
    container = client.V1Container(
        name=deployment_name,
        image="busybox",
        command=["sh", "-c", "echo 'Payment API v1.4.2 is running'; sleep 3600"],
        env=[client.V1EnvVar(name="REDIS_HOST", value="redis-cluster.internal")]
    )
    
    template = client.V1PodTemplateSpec(
        metadata=client.V1ObjectMeta(labels={"app": deployment_name}),
        spec=client.V1PodSpec(containers=[container])
    )
    
    spec = client.V1DeploymentSpec(
        replicas=1,
        selector=client.V1LabelSelector(match_labels={"app": deployment_name}),
        template=template
    )
    
    deployment = client.V1Deployment(
        metadata=client.V1ObjectMeta(name=deployment_name, labels={"app": deployment_name}),
        spec=spec
    )
    
    try:
        apps_v1.create_namespaced_deployment(namespace=namespace, body=deployment)
        print(f"Stable deployment {deployment_name} created.")
    except ApiException as e:
        if e.status == 409:
            apps_v1.replace_namespaced_deployment(name=deployment_name, namespace=namespace, body=deployment)
            print(f"Stable deployment {deployment_name} updated.")
        else:
            print(f"Failed to deploy stable version: {e}")
            return

    # Wait for stable version to be ready
    print("Waiting for stable version to initialize...")
    time.sleep(5)

    # 3. Inject Failure (v1.5.0 with missing REDIS_HOST)
    print(f"Injecting Failure: Rolling out {deployment_name}:v1.5.0 WITHOUT REDIS_HOST...")
    
    # We update the container to CRASH if REDIS_HOST is missing
    container.image = "busybox"
    container.command = ["sh", "-c", "if [ -z \"$REDIS_HOST\" ]; then echo 'FATAL: REDIS_HOST environment variable is missing!'; exit 1; else echo 'Payment API v1.5.0 is running'; sleep 3600; fi"]
    container.env = [] # REMOVE REDIS_HOST
    
    try:
        # Use JSON Patch to explicitly REPLACE the env list with an empty one
        # This is more reliable than strategic merge patch for clearing lists
        patch = [
            {
                "op": "replace",
                "path": "/spec/template/spec/containers/0/env",
                "value": []
            },
            {
                "op": "replace",
                "path": "/spec/template/spec/containers/0/command",
                "value": container.command
            },
            {
                "op": "replace",
                "path": "/spec/template/spec/containers/0/image",
                "value": container.image
            }
        ]
        apps_v1.patch_namespaced_deployment(
            name=deployment_name,
            namespace=namespace,
            body=patch
        )
        print(f"Failure injected! Deployment {deployment_name} is now rolling out a broken version.")
    except ApiException as e:
        print(f"Failed to inject failure: {e}")

    print("\nScenario Setup Complete!")
    print(f"View the results in KubeGuardian Dashboard. Look for '{deployment_name}' in namespace '{namespace}'.")

if __name__ == "__main__":
    setup_scenario()
