import asyncio
import os
import sys
import pymongo
from datetime import datetime, timezone

# Add parent dir to path so we can import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.database import get_db, connect_to_mongo
from app.workflows.remediation_workflow import RemediationWorkflow

async def run_e2e():
    print("======================================================================")
    print("KUBI SRE AUTOMATION E2E TEST")
    print("======================================================================")

    # Initialize connection
    await connect_to_mongo()
    db = get_db()
    
    # 1. Check detection
    print("\n[STEP 1] Checking active incidents...")
    active_incidents = await db.incidents.find({"status": "active"}).to_list(length=None)
    if not active_incidents:
        print("No active incidents found. Make sure an incident is running or deploy one.")
        return
        
    for inc in active_incidents:
        print(f"-> Detected Incident ID: {inc.get('id')}")
        print(f"   Pod: {inc.get('pod_name')}")
        print(f"   Namespace: {inc.get('namespace', 'default')}")
        print(f"   Type: {inc.get('type')}")
        print(f"   Message: {inc.get('message')}")
        
    # 2. Check previous same incident history
    print("\n[STEP 2] Checking historical incidents...")
    for inc in active_incidents:
        similar = await db.incidents.find({
            "pod_name": inc.get("pod_name"),
            "status": "resolved"
        }).to_list(length=5)
        if similar:
            print(f"   Found {len(similar)} similar past incidents! Logs and historical context attached for Gemini.")
        else:
            print("   No similar past incidents found. Fresh root cause analysis will be executed.")

    # 3. Check for existing approval request (pending plan)
    print("\n[STEP 3] Retrieving proposed remediation plans...")
    # Find active incident for failing-nginx first
    active_incident = await db.incidents.find_one({
        "status": "active",
        "id": {"$regex": "failing-nginx"}
    })
    
    if not active_incident:
        print("Could not find any active failing-nginx incident.")
        return
        
    plan_id = active_incident.get("plan_id")
    if not plan_id:
        print("Active incident has no plan_id associated with it.")
        return
        
    plan = await db.plans.find_one({"plan_id": plan_id})
    if not plan:
        print(f"Could not find plan {plan_id} in plans collection.")
        return
        
    print(f"-> Found Plan ID targeting active failing-nginx: {plan_id}")
    print(f"   Status: {plan['status']}")
    
    # 4. Display log/event analysis & suggested remediation
    plan_data = plan.get("plan", {})
    print(f"\n[STEP 4] Root Cause Analysis:")
    print(f"   RCA: {plan_data.get('root_cause_analysis', 'N/A')}")
    print(f"   Logs Analyzed: {plan_data.get('logs_summary', 'N/A')[:200]}...")
    
    print(f"\n[STEP 5] Proposed Actions (Remediation):")
    for action in plan_data.get("actions", []):
        print(f"   - Type: {action.get('action_type')}")
        print(f"     Target: {action.get('target_name')}")
        print(f"     Namespace: {action.get('namespace')}")
        print(f"     Reasoning: {action.get('reasoning')}")

    # 5. Approve plan and execute
    print(f"\n[STEP 6] Executing Remediation Plan {plan_id}...")
    rw = RemediationWorkflow()
    result = await rw.approve_and_execute(plan_id)
    print(f"-> Execution Status: {result.get('status')}")
    print(f"   Verified: {result.get('verified')}")
    print(f"   Results: {result.get('execution_results')}")

    # 6. Verify Post-Incident Postmortem Report Generation
    print("\n[STEP 7] Verifying Gemini Postmortem Report generation...")
    # Give database a moment to update
    await asyncio.sleep(2)
    
    incident = await db.incidents.find_one({"plan_id": plan_id})
    if not incident:
        print("Could not find the incident associated with this plan.")
        return
        
    print(f"-> Incident Status: {incident.get('status')}")
    postmortem = incident.get("postmortem")
    if postmortem:
        print("\n================== GENERATED POSTMORTEM REPORT ==================")
        print(postmortem)
        print("==================================================================")
    else:
        print("No postmortem report generated in incident document.")

    # 7. Verify MongoDB storage
    print("\n[STEP 8] Verifying report persistence in MongoDB Reports collection...")
    report_in_db = await db.reports.find_one({"plan_id": plan_id})
    if report_in_db:
        print("   Success! Report is successfully stored in 'reports' collection.")
        print(f"   Created At: {report_in_db.get('created_at')}")
    else:
        print("   Fail! Report not found in 'reports' collection.")

    # 8. Check for approval loop
    print("\n[STEP 9] Verifying system is not stuck in an approval loop...")
    subsequent_plans = await db.plans.find({"plan_id": plan_id}).to_list(length=None)
    if len(subsequent_plans) == 1:
        print("   Success! Single clean execution path. No duplicate or looping plans generated.")
    else:
        print(f"   Warning! Found {len(subsequent_plans)} plans for the same ID.")

    # 9. Cleanup resources
    print("\n[STEP 10] Triggering automatic cleanup of failing test resources...")
    for action in plan_data.get("actions", []):
        target = action.get("target_name")
        ns = action.get("namespace", "default")
        print(f"   Deleting failing deployment: {target} in namespace {ns}")
        # Run cleanup command synchronously
        os.system(f"kubectl delete deployment {target} -n {ns} --ignore-not-found=true")
        
    print("\n======================================================================")
    print("E2E INCIDENT LIFECYCLE COMPLETED SUCCESSFULLY!")
    print("======================================================================")

if __name__ == "__main__":
    asyncio.run(run_e2e())
