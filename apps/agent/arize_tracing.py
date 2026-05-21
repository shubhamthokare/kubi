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

from arize.otel import register
from opentelemetry import trace
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.trace import TracerProvider

logger = logging.getLogger(__name__)

# Sensitive headers to redact
SENSITIVE_HEADERS = {
    'authorization',
    'x-api-key',
    'api-key',
    'cookie',
    'x-csrf-token',
}


def initialize_arize_tracing() -> Optional[TracerProvider]:
    """
    Initialize Arize AX or Phoenix tracing for the Kubi Agent.
    Supports both Arize Cloud (using space_id/api_key) and local Arize Phoenix / custom OTel collectors.
    
    Returns:
        TracerProvider if successfully initialized, None if unconfigured or failed.
    """
    
    environment = os.getenv("ENVIRONMENT", "").lower()
    
    # Get config variables
    space_id = os.getenv("ARIZE_SPACE_ID")
    api_key = os.getenv("ARIZE_API_KEY")
    project_name = os.getenv("ARIZE_PROJECT_NAME", "kubi-agent-prod" if environment == "production" else "kubi-agent-dev")
    phoenix_endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT") or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    
    # Check if tracing should be active
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
            logger.info("Arize tracing is inactive (unconfigured).")
        return None
    
    try:
        if is_cloud_ready:
            logger.info(f"Initializing Arize Cloud tracing for Kubi Agent (Project: {project_name})...")
            tracer_provider = register(
                space_id=space_id,
                api_key=api_key,
                project_name=project_name,
            )
        else:
            logger.info(f"Initializing local Arize Phoenix/OTLP tracing to '{phoenix_endpoint}'...")
            
            # Determine appropriate transport (HTTP for standard port 6006 or 4318, otherwise gRPC)
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
        
        # Instrument FastAPI (agent runs on FastAPI)
        FastAPIInstrumentor().instrument()
        logger.info("✓ Arize tracing initialized for FastAPI")
        
        # Instrument HTTP requests (to backend and K8s API)
        RequestsInstrumentor().instrument()
        logger.info("✓ Arize tracing initialized for HTTP requests")
        
        # Set global tracer provider
        trace.set_tracer_provider(tracer_provider)
        
        logger.info(f"✅ Arize AX/Phoenix tracing initialized for Kubi Agent (Project: {project_name})")
        return tracer_provider
        
    except Exception as e:
        logging.exception(f"Failed to initialize Arize tracing: {e}", exc_info=True)
        return None


def get_tracer(name: str = "kubi-agent") -> trace.Tracer:
    """Get a tracer instance for creating custom spans."""
    return trace.get_tracer(name)
