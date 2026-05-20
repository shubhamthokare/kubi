import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

class GitLabService:
    def __init__(self):
        # Fallback values kept at initialization for sync code references if any
        self.api_url = settings.GITLAB_API_URL
        self.token = settings.GITLAB_PRIVATE_TOKEN
        
    async def _get_config(self) -> tuple[str, str]:
        """
        Gets GitLab API URL and private token dynamically from the database settings,
        falling back to environment settings.
        """
        from app.db.database import get_db
        api_url = settings.GITLAB_API_URL
        token = settings.GITLAB_PRIVATE_TOKEN
        try:
            db = get_db()
            db_settings = await db.settings.find_one({"id": "system_config"})
            if db_settings:
                db_url = db_settings.get("gitlab_api_url", "")
                db_token = db_settings.get("gitlab_private_token", "")
                if db_url:
                    api_url = db_url
                if db_token:
                    token = db_token
        except Exception as e:
            logger.error(f"Error loading dynamic GitLab configuration: {e}")
        return api_url, token

    async def get_latest_pipeline_status(self, service_name: str) -> dict:
        """
        Fetches the latest pipeline status for a service from GitLab API.
        """
        logger.info(f"Fetching latest GitLab pipeline for {service_name}")
        api_url, token = await self._get_config()
        
        if not token:
            logger.warning("GITLAB_PRIVATE_TOKEN not set, returning simulated data for MVP.")
            return {
                "status": "failed",
                "pipeline_id": 12345,
                "project": service_name,
                "stage": "deploy",
                "commit_message": f"Update {service_name} image tag to latest",
                "author": "devops-bot"
            }

        try:
            headers = {"PRIVATE-TOKEN": token}
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1. Search for project
                search_resp = await client.get(
                    f"{api_url}/projects", 
                    params={"search": service_name, "simple": True},
                    headers=headers
                )
                search_resp.raise_for_status()
                projects = search_resp.json()

                if not projects:
                    return {"status": "unknown", "message": f"Project {service_name} not found"}

                project_id = projects[0]["id"]

                # 2. Get latest pipeline
                pipe_resp = await client.get(
                    f"{api_url}/projects/{project_id}/pipelines",
                    params={"per_page": 1},
                    headers=headers
                )
                pipe_resp.raise_for_status()
                pipelines = pipe_resp.json()

                if not pipelines:
                    return {"status": "none", "message": "No pipelines found"}

                pipeline = pipelines[0]
                
                # 3. Get detailed info
                detail_resp = await client.get(
                    f"{api_url}/projects/{project_id}/pipelines/{pipeline['id']}",
                    headers=headers
                )
                detail_resp.raise_for_status()
                detail = detail_resp.json()

                return {
                    "status": detail.get("status"),
                    "pipeline_id": detail.get("id"),
                    "project": service_name,
                    "stage": "ci/cd",
                    "commit_message": detail.get("ref", "N/A"),
                    "author": detail.get("user", {}).get("name", "GitLab User")
                }
        except Exception as e:
            logger.error(f"GitLab API Error for {service_name}: {e}")
            return {"status": "error", "message": str(e)}

    async def trigger_pipeline(self, target_name: str, action: str) -> tuple[bool, str]:
        """
        Triggers a GitLab pipeline for a project.
        """
        logger.info(f"Triggering GitLab pipeline for {target_name} with action {action}")
        api_url, token = await self._get_config()
        
        if not token:
            logger.warning("GITLAB_PRIVATE_TOKEN not set, but simulating success for MVP.")
            return True, f"Successfully triggered {action} pipeline for {target_name} (Simulated)."

        try:
            headers = {"PRIVATE-TOKEN": token}
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1. Search for project
                search_resp = await client.get(
                    f"{api_url}/projects", 
                    params={"search": target_name, "simple": True},
                    headers=headers
                )
                search_resp.raise_for_status()
                projects = search_resp.json()

                if not projects:
                    return False, f"Project {target_name} not found"

                project_id = projects[0]["id"]

                # 2. Trigger pipeline
                # We default to 'main' branch for the trigger
                trigger_resp = await client.post(
                    f"{api_url}/projects/{project_id}/pipeline",
                    params={"ref": "main"},
                    headers=headers
                )
                
                if trigger_resp.status_code == 201:
                    data = trigger_resp.json()
                    return True, f"Triggered GitLab pipeline {data.get('id')} for {target_name} (Action: {action})"
                else:
                    logger.error(f"GitLab Trigger Error: {trigger_resp.text}")
                    return False, f"GitLab API returned {trigger_resp.status_code}"

        except Exception as e:
            logger.error(f"Failed to trigger GitLab pipeline for {target_name}: {e}")
            return False, str(e)

    async def validate_connection(self, data: dict = None) -> dict:
        """
        Validates connection to GitLab API using provided or stored config.
        """
        api_url, token = await self._get_config()
        if data:
            if "gitlab_api_url" in data and data["gitlab_api_url"]:
                api_url = data["gitlab_api_url"]
            if "gitlab_private_token" in data and data["gitlab_private_token"]:
                token = data["gitlab_private_token"]

        if not token:
            return {"status": "error", "message": "GitLab Private Token is not configured."}

        # Handle bullet masking placeholders
        if token and all(c in "*•" for c in token):
            # Try to get the actual token from the database
            _, actual_token = await self._get_config()
            if actual_token:
                token = actual_token
            else:
                return {"status": "error", "message": "GitLab Private Token is masked and not configured in DB."}

        try:
            headers = {"PRIVATE-TOKEN": token}
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{api_url}/user", headers=headers)
                if resp.status_code == 200:
                    user_data = resp.json()
                    return {
                        "status": "success", 
                        "message": f"Successfully connected to GitLab. Authenticated as: {user_data.get('name', 'User')}"
                    }
                else:
                    return {
                        "status": "error", 
                        "message": f"GitLab API returned status code {resp.status_code}: {resp.text[:200]}"
                    }
        except Exception as e:
            return {"status": "error", "message": f"Failed to connect to GitLab: {str(e)}"}
