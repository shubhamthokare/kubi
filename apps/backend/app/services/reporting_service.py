import logging
from app.services.gemini_service import GeminiService
from app.db.database import get_db
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class ReportingService:
    def __init__(self):
        self.gemini_service = GeminiService()

    async def generate_postmortem(self, incident_data: dict, execution_results: dict = None) -> str:
        """
        Generates a comprehensive postmortem report using Gemini and saves it to DB.
        """
        pod_name = incident_data.get("pod", {}).get("name", "Unknown")
        incident_id = incident_data.get("id")
        plan_id = incident_data.get("plan_id")
        
        # Merge execution results to resolve python:S1172 and improve postmortem report context
        data_copy = dict(incident_data)
        if execution_results:
            logger.info("Merging execution results into incident data for postmortem generation")
            if "actions" in execution_results and "plan_actions" not in data_copy:
                data_copy["plan_actions"] = execution_results["actions"]
            if "status" in execution_results and "plan_status" not in data_copy:
                data_copy["plan_status"] = execution_results["status"]
            data_copy["execution_results"] = execution_results

        try:
            # Generate report content with token tracking
            from app.services.gemini_service import tokens_tracker
            token_token = tokens_tracker.set(0)
            try:
                postmortem = await self.gemini_service.generate_postmortem(data_copy)
                pm_tokens = tokens_tracker.get()
            finally:
                tokens_tracker.reset(token_token)
            
            # Save to both incidents and reports collection
            await self.save_report(incident_id, plan_id, postmortem, pm_tokens)
            
            # Index RCA into Elasticsearch for historical retrieval
            try:
                from app.services.incident_indexing import store_rca
                if incident_id:
                    store_rca(incident_id=incident_id, analysis=postmortem, root_causes=postmortem, affected_resources=[], confidence_score=1.0)
            except Exception as e:
                logger.warning(f"Failed to index RCA in Elasticsearch: {e}")
            
            return postmortem
        except Exception as e:
            logging.exception(f"Failed to generate postmortem: {e}")
            return f"# Postmortem Generation Error\nAn error occurred while generating the report for {pod_name}. Technical error: {str(e)}"

    async def save_report(self, incident_id: str, plan_id: str, report_content: str, pm_tokens: int = 0):
        """
        Saves the postmortem report to both incidents and reports collections for UI consistency.
        """
        db = get_db()
        
        # 1. Update the incident itself
        await db.incidents.update_one(
            {"id": incident_id},
            {
                "$set": {"postmortem": report_content},
                "$inc": {"tokens_consumed": pm_tokens}
            }
        )
        
        # 2. Create entry in reports collection for the dedicated Reports page
        report_doc = {
            "incident_id": incident_id,
            "plan_id": plan_id,
            "content": report_content,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        }
        
        # Upsert into reports
        await db.reports.update_one(
            {"incident_id": incident_id},
            {"$set": report_doc},
            upsert=True
        )
        
        logger.info(f"Saved postmortem report for incident {incident_id} to both collections")
