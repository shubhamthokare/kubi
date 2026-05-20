import asyncio
import argparse
import json
from app.workflows.incident_detection import IncidentDetectionWorkflow

async def main():
    parser = argparse.ArgumentParser(description="kubi AI CLI")
    parser.add_argument("--namespaces", nargs="+", default=["default"], help="Kubernetes namespaces to scan (use * for all)")
    
    args = parser.parse_args()
    
    print(f"[*] Starting kubi AI Scan for namespaces: {args.namespaces}")
    workflow = IncidentDetectionWorkflow()
    
    result = await workflow.run_scan(args.namespaces)
    
    print("\n--- Scan Results ---")
    print(json.dumps(result, indent=2))
    
    if result.get("status") == "issues_found":
        for incident in result.get("incidents", []):
            plan_id = incident.get("plan_id")
            if plan_id:
                print(f"\n[!] Remediation Plan proposed for pod {incident['pod']['name']}:")
                print(f"    Summary: {incident.get('plan_summary')}")
                print(f"    Actions:")
                for action in incident.get("plan_actions", []):
                    print(f"      - {action.get('action_type')} on {action.get('target_name')} (Reason: {action.get('reason')})")
                
                choice = input(f"\nDo you want to approve and execute this plan? (y/N): ").strip().lower()
                if choice == 'y':
                    print("[*] Executing plan...")
                    exec_result = await workflow.remediation_workflow.approve_and_execute(plan_id)
                    print(json.dumps(exec_result, indent=2))
                else:
                    print("[-] Plan rejected.")
                    await workflow.remediation_workflow.reject_plan(plan_id)

if __name__ == "__main__":
    from app.db.database import connect_to_mongo, close_mongo_connection
    
    async def run_cli():
        await connect_to_mongo()
        try:
            await main()
        finally:
            await close_mongo_connection()
            
    asyncio.run(run_cli())
