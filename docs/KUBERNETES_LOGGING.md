# 🪵 Kubernetes Logging Pipeline Setup: Kubi AI

For production deployments of **Kubi AI**, we recommend using a **Fluent Bit** DaemonSet to automatically collect and forward Kubernetes pod container logs to our **Elasticsearch** ingestion layer.

---

## 🏗️ Architecture Overview

```
Kubernetes Workload Pods
         ↓ (Logs printed to stdout/stderr)
Fluent Bit DaemonSet (kube-system namespace)
         ↓ (Collected, filtered, parsed)
Elasticsearch 8.13.4 Ingestion Service
         ↓ (Vectorized & Indexed)
Gemini RCA Engine (Context-aware search queries)
```

---

## 🛠️ Step 1: Deploy Fluent Bit DaemonSet

Fluent Bit runs as a DaemonSet on every node in your cluster to tail container logs directly from the node's `/var/log/containers/` path.

Create [`deploy/fluent-bit-daemonset.yaml`](file:///c:/Users/shubh/Downloads/repo/kubi/deploy/fluent-bit-daemonset.yaml):

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: fluent-bit
  namespace: kube-system

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: fluent-bit
rules:
- apiGroups: [""]
  resources:
  - namespaces
  - pods
  - pods/logs
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources:
  - replicasets
  verbs: ["get", "list", "watch"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: fluent-bit
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: fluent-bit
subjects:
- kind: ServiceAccount
  name: fluent-bit
  namespace: kube-system

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: kube-system
data:
  fluent-bit.conf: |
    [SERVICE]
      Flush         5
      Log_Level     info
      Daemon        off

    [INPUT]
      Name              systemd
      Tag               host.*
      Read_From_Tail    On

    [INPUT]
      Name                tail
      Tag                 kube.*
      Path                /var/log/containers/*.log
      Parser              docker
      DB                  /var/log/flb_kube.db
      Mem_Buf_Limit       50MB
      Skip_Long_Lines     On
      Skip_Empty_Lines    On

    [FILTER]
      Name                kubernetes
      Match               kube.*
      Kube_URL            https://kubernetes.default.svc:443
      Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
      Merge_Log           On
      Keep_Log            Off

    [OUTPUT]
      Name            es
      Match           kube.*
      Host            ${ELASTICSEARCH_HOST}
      Port            ${ELASTICSEARCH_PORT}
      HTTP_User       ${ELASTICSEARCH_USER}
      HTTP_Passwd     ${ELASTICSEARCH_PASSWORD}
      Logstash_Format On
      Logstash_Prefix kube-logs
      Retry_Limit     5
      Time_Key        @timestamp

  parsers.conf: |
    [PARSER]
      Name        docker
      Format      json
      Time_Key    time
      Time_Format %Y-%m-%dT%H:%M:%S.%L%z

---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: fluent-bit
  template:
    metadata:
      labels:
        app: fluent-bit
    spec:
      serviceAccountName: fluent-bit
      terminationGracePeriodSeconds: 30
      containers:
      - name: fluent-bit
        image: fluent/fluent-bit:2.1.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 2020
        env:
        - name: ELASTICSEARCH_HOST
          value: "elasticsearch.default.svc.cluster.local"
        - name: ELASTICSEARCH_PORT
          value: "9200"
        - name: ELASTICSEARCH_USER
          valueFrom:
            secretKeyRef:
              name: elasticsearch-credentials
              key: username
              optional: true
        - name: ELASTICSEARCH_PASSWORD
          valueFrom:
            secretKeyRef:
              name: elasticsearch-credentials
              key: password
              optional: true
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
        - name: config
          mountPath: /fluent-bit/etc/
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
      - name: config
        configMap:
          name: fluent-bit-config

---
apiVersion: v1
kind: Service
metadata:
  name: fluent-bit-stats
  namespace: kube-system
spec:
  selector:
    app: fluent-bit
  ports:
  - port: 2020
    targetPort: 2020
```

Deploy:
```bash
kubectl apply -f deploy/fluent-bit-daemonset.yaml
```

---

## 🗄️ Step 2: Configure Elasticsearch with ILM

Apply Index Lifecycle Management (ILM) to automatically compress and expire old log indices inside Elasticsearch.

Run this configuration from your backend environment using [`apps/backend/app/services/elasticsearch_service.py`](file:///c:/Users/shubh/Downloads/repo/kubi/apps/backend/app/services/elasticsearch_service.py):

```python
from elasticsearch import Elasticsearch

es = Elasticsearch(["http://elasticsearch:9200"])

# 1. Define ILM policy (rollover after 10GB or 1 day, delete after 90 days)
ilm_policy = {
    "policy": "k8s-log-retention",
    "phases": {
        "hot": {
            "min_age": "0d",
            "actions": {
                "rollover": {"max_age": "1d", "max_size": "10gb"}
            }
        },
        "warm": {
            "min_age": "7d",
            "actions": {
                "set_priority": {"priority": 50},
                "forcemerge": {"max_num_segments": 1}
            }
        },
        "delete": {
            "min_age": "90d",
            "actions": {"delete": {}}
        }
    }
}

es.ilm.put_lifecycle("k8s-log-retention", body=ilm_policy)

# 2. Create index template mapping to ILM
index_template = {
    "index_patterns": ["kube-logs-*"],
    "template": {
        "settings": {
            "number_of_shards": 3,
            "number_of_replicas": 1,
            "index.lifecycle.name": "k8s-log-retention",
            "index.lifecycle.rollover_alias": "kube-logs"
        },
        "mappings": {
            "properties": {
                "log": {"type": "text"},
                "kubernetes": {
                    "properties": {
                        "namespace_name": {"type": "keyword"},
                        "pod_name": {"type": "keyword"},
                        "container_name": {"type": "keyword"},
                        "host": {"type": "keyword"}
                    }
                },
                "@timestamp": {"type": "date"}
            }
        }
    }
}

es.indices.put_template("kube-logs", body=index_template)
```

---

## 🧠 Step 3: Google Gemini RCA Logs Integration

Kubi AI queries indexed logs from Elasticsearch to build high-fidelity context for the Gemini SRE reasoning engine.

```python
# Location: apps/backend/app/services/elasticsearch_service.py
from app.services.elasticsearch_service import search_pod_logs
from app.services.gemini_service import GeminiService

async def analyze_pod_failure(pod_name: str, namespace: str):
    # 1. Fetch relevant logs from Elasticsearch
    logs = await search_pod_logs(pod_name, namespace, limit=100)
    log_text = "\n".join([log["log_content"] for log in logs])
    
    # 2. Query similar past incidents for RAG context
    from app.services.elasticsearch_service import search_similar_incidents
    similar_incidents = await search_similar_incidents(log_text, limit=3)
    
    # 3. Compile prompt context
    prompt = f"""
    You are the Kubi AI SRE engine.
    Analyze the following Kubernetes workload failure:
    
    Pod Name: {pod_name}
    Namespace: {namespace}
    
    Workload Logs:
    {log_text[:2000]}
    
    Similar Historic Incidents for Context:
    {similar_incidents}
    
    Provide a detailed Root Cause Analysis (RCA) and structured recovery steps.
    """
    
    gemini = GeminiService()
    analysis = await gemini.generate_rca(prompt)
    return analysis
```

---

## 🔍 Troubleshooting

### 1. Fluent Bit Cannot Connect to Elasticsearch
- **Diagnose**: Run `kubectl logs -n kube-system -l app=fluent-bit` and search for connection timeouts.
- **Fix**: Check that `Host` and `Port` settings inside `fluent-bit-config` point to the correct cluster-internal service name (`elasticsearch.default.svc.cluster.local` or equivalent).

### 2. High Disk/Memory Footprint
- **Fix**: Lower Fluent Bit buffer memory limits inside `fluent-bit.conf` to avoid resource pressure:
  ```
  Mem_Buf_Limit    10MB
  ```

---
*Updated: May 18, 2026*  
*For general Elasticsearch configurations, refer to the unified **[Elasticsearch Integration Guide](file:///c:/Users/shubh/Downloads/repo/kubi/docs/ELASTICSEARCH.md)**.*
