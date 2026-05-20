import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "kubi AI"

    # ── AI ──────────────────────────────────────────────────────
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # ── GitLab ───────────────────────────────────────────────────
    GITLAB_API_URL: str = os.getenv("GITLAB_API_URL", "https://gitlab.com/api/v4")
    GITLAB_PRIVATE_TOKEN: str = os.getenv("GITLAB_PRIVATE_TOKEN", "")

    # ── MongoDB ───────────────────────────────────────────────────
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "kubi")

    # ── Agent ─────────────────────────────────────────────────────
    # In-cluster default; override via AGENT_URL env var for local dev
    AGENT_URL: str = os.getenv("AGENT_URL", "http://kubi-agent-service:8080")

    # ── CORS ──────────────────────────────────────────────────────
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:49262,http://192.168.49.2:30001",
    )
    CORS_ORIGIN_REGEX: str = os.getenv("CORS_ORIGIN_REGEX", "")

    # ── Elasticsearch ─────────────────────────────────────────────
    # In-cluster default: elasticsearch-service:9200
    # Local dev override: http://localhost:9200  (kubectl port-forward)
    ELASTICSEARCH_HOST: str = os.getenv(
        "ELASTICSEARCH_HOST", "http://elasticsearch-service:9200"
    )
    ELASTICSEARCH_INDEX: str = os.getenv("ELASTICSEARCH_INDEX", "kubi-incidents")
    ELASTICSEARCH_INDEX_LOGS: str = os.getenv(
        "ELASTICSEARCH_INDEX_LOGS", "kubi-pod-logs"
    )
    ELASTICSEARCH_INDEX_EVENTS: str = os.getenv(
        "ELASTICSEARCH_INDEX_EVENTS", "kubi-events"
    )
    ELASTICSEARCH_INDEX_RCA: str = os.getenv("ELASTICSEARCH_INDEX_RCA", "kubi-rca")
    ELASTICSEARCH_INDEX_REMEDIATION: str = os.getenv(
        "ELASTICSEARCH_INDEX_REMEDIATION", "kubi-remediation"
    )
    ELASTICSEARCH_USERNAME: str = os.getenv("ELASTICSEARCH_USERNAME", "")
    ELASTICSEARCH_PASSWORD: str = os.getenv("ELASTICSEARCH_PASSWORD", "")
    ELASTICSEARCH_API_KEY: str = os.getenv("ELASTICSEARCH_API_KEY", "")
    ELASTICSEARCH_SHARDS: int = int(os.getenv("ELASTICSEARCH_SHARDS", "1"))
    ELASTICSEARCH_REPLICAS: int = int(os.getenv("ELASTICSEARCH_REPLICAS", "0"))

    # ── Legacy (kept for backward compat) ────────────────────────
    ELASTIC_MCP_URL: str = os.getenv("ELASTIC_MCP_URL", "http://localhost:8000")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
