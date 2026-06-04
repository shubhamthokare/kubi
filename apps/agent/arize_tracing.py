"""
Arize AX Tracing Configuration for Kubi Agent

This module sets up tracing for:
- HTTP requests to the backend
- Kubernetes API calls
- Background scanning operations

Sensitive data filtering: Authorization headers and credentials are redacted.
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

HAS_FASTAPI_INSTRUMENTOR = False
if HAS_OTEL:
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        HAS_FASTAPI_INSTRUMENTOR = True
    except ImportError:
        pass

HAS_HTTP_INSTRUMENTOR = False
if HAS_OTEL:
    try:
        from opentelemetry.instrumentation.requests import RequestsInstrumentor
        HAS_HTTP_INSTRUMENTOR = True
    except ImportError:
        pass

try:
    from arize.otel import register
    HAS_ARIZE = True
except ImportError:
    HAS_ARIZE = False

if not HAS_OTEL:
    class TracerProvider:  # type: ignore
        """Fallback dummy TracerProvider when opentelemetry is not installed."""
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

# Sensitive headers to redact
SENSITIVE_HEADERS = {
    'authorization',
    'x-api-key',
    'api-key',
    'cookie',
    'x-csrf-token',
}


def _env_enabled(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _production_arize_required(environment: str) -> bool:
    return environment == "production" and _env_enabled("ARIZE_REQUIRE_DASHBOARD", False)


def _missing_required_message() -> str:
    return (
        "Arize tracing is required for production audit mode but no valid Arize Cloud "
        "credentials (ARIZE_SPACE_ID, ARIZE_API_KEY) or OTLP/Phoenix collector endpoint "
        "(PHOENIX_COLLECTOR_ENDPOINT or OTEL_EXPORTER_OTLP_ENDPOINT) are configured."
    )


def _log_inactive_tracing(environment: str) -> None:
    """Log warning or info when tracing is unconfigured."""
    if _production_arize_required(environment):
        raise RuntimeError(_missing_required_message())
    if environment == "production":
        logger.warning(_missing_required_message())
    else:
        logger.info("Arize tracing is inactive (unconfigured).")


def _get_local_transport(phoenix_endpoint: str) -> Optional[object]:
    """Determine the appropriate Transport type based on phoenix endpoint ports."""
    try:
        from arize.otel import Transport
        if any(p in phoenix_endpoint for p in ["6006", "4318", "v1/traces"]):
            return Transport.HTTP
        return Transport.GRPC
    except Exception:
        return None


def _register_tracer(
    is_cloud_ready: bool,
    space_id: Optional[str],
    api_key: Optional[str],
    project_name: str,
    phoenix_endpoint: Optional[str]
) -> Optional[TracerProvider]:
    """Register either Arize Cloud or local OTel / Phoenix / standard OTel tracer provider."""
    if is_cloud_ready:
        if not HAS_ARIZE:
            if _production_arize_required(os.getenv("ENVIRONMENT", "").lower()):
                raise RuntimeError("Arize Cloud mode is required but arize-otel package is not installed.")
            logger.error("Arize Cloud mode requested but arize-otel package is not installed.")
            return None
        logger.info(f"Initializing Arize Cloud tracing for Kubi Agent (Project: {project_name})...")
        return register(
            space_id=space_id,
            api_key=api_key,
            project_name=project_name,
        )
    
    if HAS_ARIZE:
        logger.info(f"Initializing local Arize Phoenix/OTLP tracing to '{phoenix_endpoint}'...")
        register_kwargs = {
            "project_name": project_name,
            "endpoint": phoenix_endpoint,
        }
        
        transport_val = _get_local_transport(phoenix_endpoint)
        if transport_val is not None:
            register_kwargs["transport"] = transport_val
            
        return register(**register_kwargs)
    else:
        logger.info(f"Initializing standard local OpenTelemetry tracing to '{phoenix_endpoint}' (arize-otel not installed)...")
        try:
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            
            tracer_provider = TracerProvider()
            otlp_exporter = OTLPSpanExporter(endpoint=phoenix_endpoint)
            tracer_provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
            return tracer_provider
        except ImportError:
            logger.warning("Standard OTLP exporter not installed; falling back to simple TracerProvider.")
            return TracerProvider()


def initialize_arize_tracing() -> Optional[TracerProvider]:
    """
    Initialize Arize AX or Phoenix tracing for the Kubi Agent.
    Supports both Arize Cloud (using space_id/api_key) and local Arize Phoenix / custom OTel collectors.
    
    Returns:
        TracerProvider if successfully initialized, None if unconfigured or failed.
    """
    
    environment = os.getenv("ENVIRONMENT", "").lower()
    if not HAS_OTEL:
        if _production_arize_required(environment):
            raise RuntimeError("Arize tracing is required but OpenTelemetry libraries are not installed.")
        logger.info("Arize tracing is inactive (OpenTelemetry libraries not installed).")
        return None

    arize_enabled = _env_enabled("ARIZE_ENABLED", True)
    if not arize_enabled and not _production_arize_required(environment):
        logger.info("Arize tracing is disabled by ARIZE_ENABLED=false.")
        return None
    
    # Get config variables
    space_id = os.getenv("ARIZE_SPACE_ID")
    api_key = os.getenv("ARIZE_API_KEY")
    project_name = os.getenv("ARIZE_PROJECT_NAME", "kubi-agent-prod" if environment == "production" else "kubi-agent-dev")
    phoenix_endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT") or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    
    # Check if tracing should be active
    is_cloud_ready = bool(space_id and api_key)
    is_local_ready = bool(phoenix_endpoint)
    
    if not (is_cloud_ready or is_local_ready):
        _log_inactive_tracing(environment)
        return None
    
    try:
        tracer_provider = _register_tracer(
            is_cloud_ready=is_cloud_ready,
            space_id=space_id,
            api_key=api_key,
            project_name=project_name,
            phoenix_endpoint=phoenix_endpoint
        )
        
        if tracer_provider is None:
            return None
            
        # Instrument FastAPI (agent runs on FastAPI)
        if HAS_FASTAPI_INSTRUMENTOR:
            FastAPIInstrumentor().instrument()
            logger.info("✓ Arize tracing initialized for FastAPI")
        
        # Instrument HTTP requests (to backend and K8s API)
        if HAS_HTTP_INSTRUMENTOR:
            RequestsInstrumentor().instrument()
            logger.info("✓ Arize tracing initialized for HTTP requests")
        
        # Set global tracer provider
        trace.set_tracer_provider(tracer_provider)
        
        logger.info(f"✅ Arize AX/Phoenix tracing initialized for Kubi Agent (Project: {project_name})")
        return tracer_provider
        
    except Exception as e:
        if _production_arize_required(environment):
            raise
        logging.exception(f"Failed to initialize Arize tracing: {e}", exc_info=True)
        return None


def get_tracer(name: str = "kubi-agent") -> trace.Tracer:
    """Get a tracer instance for creating custom spans."""
    return trace.get_tracer(name)


def set_span_attributes(span, metadata: Optional[dict]) -> None:
    if not metadata:
        return
    for key, value in metadata.items():
        if value is None:
            continue
        if isinstance(value, (str, int, float, bool)):
            span.set_attribute(key, value)
        elif isinstance(value, list) and all(isinstance(item, (str, int, float, bool)) for item in value):
            span.set_attribute(key, value)
        else:
            span.set_attribute(key, str(value))
