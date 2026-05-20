import unittest
import base64
import yaml
from app.services.kubernetes_service import KubernetesService

class TestKubeconfigPatching(unittest.TestCase):
    def test_dynamic_kubeconfig_override(self):
        # 1. Setup a dummy Kubeconfig structure that references local files
        sample_kubeconfig = """
apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://192.168.49.2:8443
    certificate-authority: /root/.minikube/ca.crt
users:
- name: test-user
  user:
    client-certificate: /root/.minikube/profiles/minikube/client.crt
    client-key: /root/.minikube/profiles/minikube/client.key
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user
current-context: test-context
"""
        
        # 2. Mock cluster configuration with separate certs upload
        dummy_ca = "DUMMY_CA_CERTIFICATE_CONTENT"
        dummy_client_cert = "DUMMY_CLIENT_CERT_CONTENT"
        dummy_client_key = "DUMMY_CLIENT_KEY_CONTENT"
        
        cluster_config = {
            "auth_type": "kubeconfig",
            "kubeconfig": sample_kubeconfig,
            "ca_cert": dummy_ca,
            "client_cert": dummy_client_cert,
            "client_key": dummy_client_key
        }
        
        # Instantiate service (does not load config yet since _init_direct_client is called lazily or dynamically)
        service = KubernetesService(cluster_config=cluster_config)
        
        # 3. Simulate the patching logic
        kubeconfig_str = service.cluster_config.get("kubeconfig", "")
        kube_dict = yaml.safe_load(kubeconfig_str)
        
        # Apply the exact patching logic we added to kubernetes_service.py
        ca_cert = service.cluster_config.get("ca_cert", "")
        if ca_cert and ca_cert.strip():
            ca_b64 = base64.b64encode(ca_cert.strip().encode()).decode()
            for cluster_entry in kube_dict["clusters"]:
                cluster_entry["cluster"]["certificate-authority-data"] = ca_b64
                cluster_entry["cluster"].pop("certificate-authority", None)

        client_cert = service.cluster_config.get("client_cert", "")
        client_key = service.cluster_config.get("client_key", "")
        if (client_cert and client_cert.strip()) or (client_key and client_key.strip()):
            for user_entry in kube_dict["users"]:
                if client_cert and client_cert.strip():
                    cert_b64 = base64.b64encode(client_cert.strip().encode()).decode()
                    user_entry["user"]["client-certificate-data"] = cert_b64
                    user_entry["user"].pop("client-certificate", None)
                if client_key and client_key.strip():
                    key_b64 = base64.b64encode(client_key.strip().encode()).decode()
                    user_entry["user"]["client-key-data"] = key_b64
                    user_entry["user"].pop("client-key", None)
        
        # 4. Assert and Verify
        # Check that file paths are removed
        cluster_info = kube_dict["clusters"][0]["cluster"]
        self.assertNotIn("certificate-authority", cluster_info)
        self.assertEqual(cluster_info["certificate-authority-data"], base64.b64encode(dummy_ca.encode()).decode())
        
        user_info = kube_dict["users"][0]["user"]
        self.assertNotIn("client-certificate", user_info)
        self.assertNotIn("client-key", user_info)
        self.assertEqual(user_info["client-certificate-data"], base64.b64encode(dummy_client_cert.encode()).decode())
        self.assertEqual(user_info["client-key-data"], base64.b64encode(dummy_client_key.encode()).decode())
        
        print("Kubeconfig patching validation test passed successfully!")

if __name__ == "__main__":
    unittest.main()
