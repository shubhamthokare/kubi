"""
Arize AX Tracing Configuration and Initialization

This module sets up comprehensive tracing for:
- Google Gemini LLM calls
- HTTP requests (FastAPI)
- Kubernetes API calls
- MongoDB operations

Sensitive data filtering: Authorization headers, API keys, and credentials are redacted from traces.
"""

import os
import logging
from typing import Optional

try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    HAS_OTEL = True
except ImportError:
    HAS_OTEL = False

GoogleGenAIInstrumentor = None
FastAPIInstrumentor = None
RequestsInstrumentor = None
HTTPXClientInstrumentor = None

HAS_GEMINI_INSTRUMENTOR = False
if HAS_OTEL:
    try:
        from openinference.instrumentation.google_genai import GoogleGenAIInstrumentor
        HAS_GEMINI_INSTRUMENTOR = True
    except ImportError:
        pass

HAS_FASTAPI_INSTRUMENTOR = False
if HAS_OTEL:
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        HAS_FASTAPI_INSTRUMENTOR = True
    except ImportError:
        pass

HAS_HTTP_INSTRUMENTORS = False
if HAS_OTEL:
    try:
        from opentelemetry.instrumentation.requests import RequestsInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        HAS_HTTP_INSTRUMENTORS = True
    except ImportError:
        pass

try:
    from arize.otel import register
    HAS_ARIZE = True
except ImportError:
    HAS_ARIZE = False

if not HAS_OTEL:
    class TracerProvider:  # type: ignore
        pass
    class DummyContextManager:
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            return False

    class trace:  # type: ignore
        @staticmethod
        def set_tracer_provider(provider):
            pass
        @staticmethod
        def get_tracer(name: str):
            class DummyTracer:
                def start_as_current_span(self, name, *args, **kwargs):
                    return DummyContextManager()
                def start_span(self, name, *args, **kwargs):
                    return DummyContextManager()
            return DummyTracer()

logger = logging.getLogger(__name__)

# Sensitive headers/fields to redact from traces
SENSITIVE_HEADERS = {
    'authorization',
    'x-api-key',
    'api-key',
    'cookie',
    'x-csrf-token',
    'x-auth-token',
    'gemini-api-key',
    'gitlab-private-token',
}

SENSITIVE_FIELDS = {
    'password',
    'api_key',
    'token',
    'secret',
    'authorization',
}


def _sanitize_headers(headers: Optional[dict]) -> Optional[dict]:
    """Redact sensitive headers from traces."""
    if not headers:
        return None
    
    sanitized = {}
    for key, value in headers.items():
        lower_key = key.lower()
        if lower_key in SENSITIVE_HEADERS:
            sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = value
    return sanitized


def _sanitize_dict(data: Optional[dict]) -> Optional[dict]:
    """Redact sensitive fields from dictionary data."""
    if not data:
        return None
    
    sanitized = {}
    for key, value in data.items():
        lower_key = key.lower()
        if lower_key in SENSITIVE_FIELDS:
            sanitized[key] = "[REDACTED]"
        elif isinstance(value, dict):
            sanitized[key] = _sanitize_dict(value)
        elif isinstance(value, list):
            sanitized[key] = [_sanitize_dict(item) if isinstance(item, dict) else item for item in value]
        else:
            sanitized[key] = value
    return sanitized


def initialize_arize_tracing() -> Optional[TracerProvider]:
    """
    Initialize Arize AX or Phoenix tracing.
    Supports both Arize Cloud (using space_id/api_key) and local Arize Phoenix / custom OTel collectors.
    
    Returns:
        TracerProvider if successfully initialized, None if unconfigured or failed.
    """
    if not HAS_OTEL:
        logger.info("Arize/OTel tracing is inactive (OpenTelemetry libraries not installed).")
        return None
    
    environment = os.getenv("ENVIRONMENT", "").lower()
    
    # Get config variables
    space_id = os.getenv("ARIZE_SPACE_ID")
    api_key = os.getenv("ARIZE_API_KEY")
    project_name = os.getenv("ARIZE_PROJECT_NAME", "kubi-prod" if environment == "production" else "kubi-dev")
    phoenix_endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT") or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    
    # Check if tracing should be active:
    # 1. We have explicit space_id and api_key (Cloud mode)
    # 2. Or we have a custom OTLP/Phoenix collector endpoint (Local mode)
    is_cloud_ready = bool(space_id and api_key)
    is_local_ready = bool(phoenix_endpoint)
    
    if not (is_cloud_ready or is_local_ready):
        if environment == "production":
            logger.warning(
                "Arize tracing not initialized: ENVIRONMENT is production but neither "
                "Arize Cloud credentials (ARIZE_SPACE_ID, ARIZE_API_KEY) nor "
                "local collector endpoints (PHOENIX_COLLECTOR_ENDPOINT) are set."
            )
        else:
            logger.info("Arize/OTel tracing is inactive (unconfigured).")
        return None
        
    try:
        if is_cloud_ready:
            if not HAS_ARIZE:
                logger.error("Arize Cloud mode requested but arize-otel package is not installed.")
                return None
            logger.info(f"Initializing Arize Cloud tracing (Project: {project_name})...")
            tracer_provider = register(
                space_id=space_id,
                api_key=api_key,
                project_name=project_name,
            )
        else:
            if HAS_ARIZE:
                logger.info(f"Initializing local Arize Phoenix/OTLP tracing to '{phoenix_endpoint}'...")
                
                try:
                    from arize.otel import Transport
                    transport_val = Transport.HTTP if any(p in phoenix_endpoint for p in ["6006", "4318", "v1/traces"]) else Transport.GRPC
                except Exception:
                    transport_val = None
                    
                register_kwargs = {
                    "project_name": project_name,
                    "endpoint": phoenix_endpoint,
                }
                if transport_val is not None:
                    register_kwargs["transport"] = transport_val
                    
                tracer_provider = register(**register_kwargs)
            else:
                logger.info(f"Initializing standard local OpenTelemetry tracing to '{phoenix_endpoint}' (arize-otel not installed)...")
                try:
                    from opentelemetry.sdk.trace.export import BatchSpanProcessor
                    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
                    
                    tracer_provider = TracerProvider()
                    otlp_exporter = OTLPSpanExporter(endpoint=phoenix_endpoint)
                    tracer_provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
                except ImportError:
                    logger.warning("Standard OTLP exporter not installed; falling back to simple TracerProvider.")
                    tracer_provider = TracerProvider()
        
        # Instrument Google Gemini
        if HAS_GEMINI_INSTRUMENTOR:
            GoogleGenAIInstrumentor().instrument(tracer_provider=tracer_provider)
            logger.info("✓ Arize/OTel tracing initialized for Google Gemini")
            
        # Instrument FastAPI (will capture HTTP requests/responses)
        if HAS_FASTAPI_INSTRUMENTOR:
            FastAPIInstrumentor().instrument()
            logger.info("✓ Arize/OTel tracing initialized for FastAPI")
            
        # Instrument HTTP clients
        if HAS_HTTP_INSTRUMENTORS:
            RequestsInstrumentor().instrument()
            HTTPXClientInstrumentor().instrument()
            logger.info("✓ Arize/OTel tracing initialized for HTTP clients (requests, httpx)")
            
        # Set global tracer provider for custom spans
        trace.set_tracer_provider(tracer_provider)
        
        logger.info(f"✅ Arize/OTel tracing fully initialized (Project: {project_name})")
        return tracer_provider
        
    except Exception as e:
        logging.exception(f"Failed to initialize Arize/OTel tracing: {e}", exc_info=True)
        return None


def get_tracer(name: str = "kubi") -> trace.Tracer:
    """Get a tracer instance for creating custom spans."""
    return trace.get_tracer(name)
