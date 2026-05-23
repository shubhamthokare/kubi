import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

class ElasticMCPService:
    def __init__(self):
        self.mcp_url = settings.ELASTIC_MCP_URL
        self.client = httpx.AsyncClient(base_url=self.mcp_url)

    async def get_logs_for_service(self, service_name: str, time_range_mins: int = 15):
        """
        Fetches logs from Elastic MCP server, falling back to local Elasticsearch queries
        and then to mock data if Elasticsearch is unreachable or empty.
        """
        logger.info(f"Fetching logs from Elastic service for {service_name}")
        
        # 1. Attempt to use local Elasticsearch service if active
        try:
            from app.services.elasticsearch_service import is_available, search_documents, settings as cfg
            if is_available():
                query = {
                    "bool": {
                        "must": [
                            {"match": {"pod_name": service_name}}
                        ]
                    }
                }
                logs, _ = search_documents(cfg.ELASTICSEARCH_INDEX_LOGS, query, size=50)
                if logs:
                    log_contents = []
                    for log in logs:
                        timestamp = log.get("timestamp", "")
                        content = log.get("log_content") or log.get("message") or ""
                        log_contents.append(f"[{timestamp}] {content}")
                    return "\n".join(log_contents)
        except Exception as e:
            logging.exception(f"Failed to fetch logs from local Elasticsearch: {e}")

        # 2. In a real MCP setup, we send a JSON-RPC request to the MCP server.
        try:
            payload = {
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": {
                    "name": "get_logs",
                    "arguments": {
                        "service_name": service_name,
                        "time_range_mins": time_range_mins
                    }
                },
                "id": 1
            }
            # Try /tools/call first (Standard MCP POST/SSE transport endpoint)
            response = await self.client.post("/tools/call", json=payload, timeout=10.0)
            if response.status_code == 404:
                # Fallback to direct POST root endpoint (common for simple custom JSON-RPC servers)
                response = await self.client.post("/", json=payload, timeout=10.0)
                
            if response.status_code == 200:
                res_data = response.json()
                if "error" in res_data:
                    logger.error(f"Elastic MCP JSON-RPC error response: {res_data['error']}")
                else:
                    # Parse standard MCP result content block
                    result = res_data.get("result", {})
                    content_list = result.get("content", [])
                    if content_list and isinstance(content_list, list):
                        text_content = content_list[0].get("text", "").strip()
                        if text_content:
                            logger.info(f"Successfully retrieved logs via Elastic MCP JSON-RPC for {service_name}")
                            return text_content
        except Exception as e:
            logger.warning(f"Elastic MCP JSON-RPC call failed: {e}. Falling back to simulated log data.")

        # 3. Fallback to simulated data if no other logs are found
        return f"Mock Log Entry 1: ERROR in {service_name}: Connection timeout.\nMock Log Entry 2: WARN Retrying connection."
