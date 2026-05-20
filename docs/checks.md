# 🔍 SRE Testing & Verification Checklist

This document outlines the SRE testing and verification procedures for **Kubi AI**. It provides step-by-step guidelines for validating API connectivity, running end-to-end incident recovery simulations, and verifying dashboard capabilities.

---

## 🔑 1. Gemini API Key Validation

Before starting the backend or agent, verify your Google Gemini API connectivity and API key permissions using this simple endpoint handshake:

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Hello Gemini! Respond in one short sentence confirming your status as the Kubi AI SRE engine."
      }]
    }]
  }'
```

### Expected Response
You should receive a `200 OK` status with a JSON body resembling the following:
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Hello! I am ready to act as the Kubi AI SRE engine to analyze and recover cluster incidents."
          }
        ],
        "role": "model"
      }
    }
  ]
}
```

---

## 🛠️ 2. End-to-End Incident Recovery Scenario

This scenario simulates a real-world Kubernetes incident and verifies Kubi AI's autonomous self-healing and recovery pipelines using the dashboard.

### 📋 Scenario Setup & Execution Flow

1. **Deploy and Set Up Connection**
   - Boot up Kubi AI in your local Docker environment.
   - Access the dashboard UI.
   - Navigate to **Connections** and create a cluster connection by uploading your kubeconfig and certificate credentials.

2. **Trigger a Failing Pod Incident**
   - Apply a faulty workload to the cluster (e.g., a pod with a broken startup command or crash loop):
     ```bash
     kubectl run faulty-pod --image=nginx --namespace=default -- /bin/sh -c "sleep 5; exit 1"
     ```

3. **Verify Automated Detection**
   - Check the **Incidents Dashboard** to ensure the faulty pod is detected within **15 seconds**.
   - Verify that Kubi AI transitions the incident status to `Investigating`.

4. **Incident Duplication & History Search**
   - The engine checks MongoDB for any previous incidents with the same signature (e.g., `CrashLoopBackOff` in `faulty-pod`).
   - If a matches exists, it pulls the previous resolution report and logs, supplying them to the Gemini reasoning engine as historical context.

5. **Log & Event Diagnostics**
   - The engine pulls logs and events from the failing pod.
   - Gemini analyzes the log trace to locate the root cause (e.g., exit code `1` or wrong command arguments).

6. **Remediation Execution**
   - Gemini generates a step-by-step remediation plan.
   - **GitLab-based Remediation**: If a Git repository matches the deployment source and follows predefined SRE rules, the Git action is performed.
   - **Out-of-Scope Remediation**: If manual/out-of-scope intervention is needed, the agent generates an **Approval Request** in the dashboard and pauses execution.
   - Once approved by an SRE, the plan is executed in the cluster.

7. **Verification & Incident Closure**
   - Post-remediation, the agent verifies the health of the pod.
   - Gemini creates a comprehensive incident summary report including:
     - **What Happened**: Cause of failure.
     - **Why it Happened**: Underlying issue.
     - **How it was Resolved**: Step-by-step remediation taken.
     - **Prevention Steps**: Suggestions to avoid recurrence.
   - The report is written to MongoDB and the incident is marked as `Resolved`.

8. **Clean Up**
   - Delete the test pod:
     ```bash
     kubectl delete pod faulty-pod --namespace=default
     ```

> [!WARNING]
> **Infinite Loop Mitigation**: To prevent the agent from getting stuck in an infinite remediation loop (e.g., repeatedly trying the same failing patch), the engine will automatically flag repetitive actions and escalate the issue by raising a high-priority manual Approval Request.

---

## 📊 3. Dashboard UI Verification Checklist

Ensure the frontend **System Analyzer** dashboard meets all interface and SRE usability standards.

### 🔍 System Analyzer Filters
- [ ] **Cluster Filter**: Dropdown menu successfully lists all configured Kubeconfig cluster profiles. Selecting a cluster dynamically updates workloads and incidents.
- [ ] **Namespace Filter**: A multi-select or dropdown selector to scope incidents and logs to specific namespaces (e.g., `default`, `kube-system`).
- [ ] **Time Range Filter**: Standard presets (`Last 15 minutes`, `Last 1 Hour`, `Last 24 Hours`, `Custom Range`) to filter incident logs.

---

## 📁 4. Pod Log Explorer & Diagnostics UI

Verify that the sidebar and details pane correctly show live diagnostic resources.

```
+-------------------------------------------------------------+
| 📁 Workloads (Sidebar)     | 📝 Pod Diagnostics Pane       |
|                            |                                |
| 🔹 kubi-backend-deployment | Pod Name: kubi-backend-56f7... |
|   ├── pod-56f7b98d-abcde   | Status: Running                |
|   └── pod-56f7b98d-fghij   |                                |
|                            | ------------------------------ |
| 🔹 faulty-pod-deployment   | [ Button: View Live Logs ]     |
|   └── pod-7c89fbf6-xyz12   | [ Button: Describe Pod ]       |
+-------------------------------------------------------------+
```

### Sidebar Workloads Tree
- [ ] Lists active deployments, daemonsets, and statefulsets.
- [ ] Expanding a workload lists all child pods currently managed by it.
- [ ] Clicking on a specific pod opens the **Pod Diagnostics Pane**.

### Diagnostics Options
- [ ] **View Live Logs**: Displays colored tail streams of the selected pod's container logs.
- [ ] **Describe Pod**: Shows equivalent YAML formatting of the `kubectl describe pod` command for quick environment and event debugging.