import os
from pydantic_settings import BaseSettings
from app.core.vault import get_secret


class Settings(BaseSettings):
    PROJECT_NAME: str = "kubi AI"
    ENVIRONMENT: str = get_secret("ENVIRONMENT", "production")

    # ── AI ──────────────────────────────────────────────────────
    GEMINI_API_KEY: str = get_secret("GEMINI_API_KEY", "")

    # ── GitLab ───────────────────────────────────────────────────
    GITLAB_API_URL: str = get_secret("GITLAB_API_URL", "https://gitlab.com/api/v4")
    GITLAB_PRIVATE_TOKEN: str = get_secret("GITLAB_PRIVATE_TOKEN", "") or get_secret("GITLAB_TOKEN", "")

    # ── MongoDB ───────────────────────────────────────────────────
    MONGODB_URL: str = get_secret("MONGODB_URL", "mongodb://localhost:27017")
    DATABASE_NAME: str = get_secret("DATABASE_NAME", "kubi")

    # ── Agent ─────────────────────────────────────────────────────
    # In-cluster default; override via AGENT_URL env var for local dev
    AGENT_URL: str = get_secret("AGENT_URL", "http://kubi-agent-service:8080")

    # ── CORS ──────────────────────────────────────────────────────
    CORS_ORIGINS: str = get_secret(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:49262,http://192.168.49.2:30001",
    )
    CORS_ORIGIN_REGEX: str = get_secret("CORS_ORIGIN_REGEX", "")

    # ── Elasticsearch ─────────────────────────────────────────────
    # In-cluster default: elasticsearch-service:9200
    # Local dev override: http://localhost:9200  (kubectl port-forward)
    ELASTICSEARCH_HOST: str = get_secret(
        "ELASTICSEARCH_HOST", "http://elasticsearch-service:9200"
    )
    ELASTICSEARCH_INDEX: str = get_secret("ELASTICSEARCH_INDEX", "kubi-incidents")
    ELASTICSEARCH_INDEX_LOGS: str = get_secret(
        "ELASTICSEARCH_INDEX_LOGS", "kubi-pod-logs"
    )
    ELASTICSEARCH_INDEX_EVENTS: str = get_secret(
        "ELASTICSEARCH_INDEX_EVENTS", "kubi-events"
    )
    ELASTICSEARCH_INDEX_RCA: str = get_secret("ELASTICSEARCH_INDEX_RCA", "kubi-rca")
    ELASTICSEARCH_INDEX_REMEDIATION: str = get_secret(
        "ELASTICSEARCH_INDEX_REMEDIATION", "kubi-remediation"
    )
    ELASTICSEARCH_USERNAME: str = get_secret("ELASTICSEARCH_USERNAME", "")
    ELASTICSEARCH_PASSWORD: str = get_secret("ELASTICSEARCH_PASSWORD", "")
    ELASTICSEARCH_API_KEY: str = get_secret("ELASTICSEARCH_API_KEY", "")
    ELASTICSEARCH_SHARDS: int = int(get_secret("ELASTICSEARCH_SHARDS", "1"))
    ELASTICSEARCH_REPLICAS: int = int(get_secret("ELASTICSEARCH_REPLICAS", "0"))

    # ── Legacy (kept for backward compat) ────────────────────────
    ELASTIC_MCP_URL: str = get_secret("ELASTIC_MCP_URL", "http://localhost:8000")

    # ── Email / OTP Settings ────────────────────────────────────────
    RESEND_API_KEY: str = get_secret("RESEND_API_KEY", "")
    EMAIL_FROM: str = get_secret("EMAIL_FROM", "no-reply@kubi.ai")
    OTP_EXPIRY_MINUTES: int = int(get_secret("OTP_EXPIRY_MINUTES", "10"))

    JWT_SECRET_KEY: str = get_secret("JWT_SECRET_KEY", "kubi-sre-secret-key-change-me-in-production")
    SSO_CLIENT_ID: str = get_secret("SSO_CLIENT_ID", "")
    SSO_CLIENT_SECRET: str = get_secret("SSO_CLIENT_SECRET", "")
    SSO_REDIRECT_URI: str = get_secret("SSO_REDIRECT_URI", "http://localhost:8000/api/auth/callback")

    # ── OpenTelemetry ─────────────────────────────────────────────────────
    OTEL_EXPORTER_OTLP_ENDPOINT: str = get_secret("OTEL_EXPORTER_OTLP_ENDPOINT", "https://132219246.otel.gitlab-o11y.com:14318")
    OTEL_RESOURCE_ATTRIBUTES: str = get_secret("OTEL_RESOURCE_ATTRIBUTES", "")

    # ── Domain Configuration ────────────────────────────────────────────────
    GLOBAL_DOMAIN: str = get_secret("GLOBAL_DOMAIN", "example.com")
    LOCAL_DOMAIN: str = get_secret("LOCAL_DOMAIN", "localhost")
    DOMAIN_NAME: str = get_secret("DOMAIN_NAME", "")
    SERVICE_SUBDOMAIN: str = get_secret("SERVICE_SUBDOMAIN", "api")

    def __init__(self, **values):
        super().__init__(**values)
        # Compute dynamic DOMAIN_NAME if empty
        if not self.DOMAIN_NAME:
            self.DOMAIN_NAME = self.LOCAL_DOMAIN if self.ENVIRONMENT == "development" else self.GLOBAL_DOMAIN

        # Resolve SSO_REDIRECT_URI dynamically based on domain variables
        if not self.SSO_REDIRECT_URI or self.SSO_REDIRECT_URI == "http://localhost:8000/api/auth/callback":
            if self.ENVIRONMENT == "development":
                self.SSO_REDIRECT_URI = f"http://{self.LOCAL_DOMAIN}:8000/api/auth/callback"
            else:
                sub = f"{self.SERVICE_SUBDOMAIN}." if self.SERVICE_SUBDOMAIN else ""
                self.SSO_REDIRECT_URI = f"https://{sub}{self.DOMAIN_NAME}/api/auth/callback"

        # Resolve CORS_ORIGINS dynamically based on domain variables
        if not self.CORS_ORIGINS or self.CORS_ORIGINS == "http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:49262,http://192.168.49.2:30001":
            if self.ENVIRONMENT == "development":
                self.CORS_ORIGINS = f"http://{self.LOCAL_DOMAIN}:3000,http://{self.LOCAL_DOMAIN}:8000,http://127.0.0.1:3000,http://127.0.0.1:49262,http://192.168.49.2:30001"
            else:
                sub = f"{self.SERVICE_SUBDOMAIN}." if self.SERVICE_SUBDOMAIN else ""
                self.CORS_ORIGINS = f"https://{self.DOMAIN_NAME},https://{sub}{self.DOMAIN_NAME}"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

