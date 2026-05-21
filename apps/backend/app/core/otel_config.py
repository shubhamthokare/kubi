import os
from opentelemetry import trace, metrics
from opentelemetry.sdk.resources import Resource, OTELResourceDetector
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

def initialize_otel():
    """Configure OpenTelemetry SDK for tracing and metrics.
    The configuration reads endpoint and resource attributes from environment
    variables defined in Settings (OTEL_EXPORTER_OTLP_ENDPOINT and
    OTEL_RESOURCE_ATTRIBUTES)."""
    # Build resource with default attributes and any user‑provided ones
    default_attrs = {
        "gitlab.project.id": os.getenv("GITLAB_PROJECT_ID", "123"),
        "gitlab.project.name": os.getenv("GITLAB_PROJECT_NAME", "kubi"),
        "service.version": os.getenv("SERVICE_VERSION", "0.1.0"),
        "deployment.environment.name": os.getenv("DEPLOYMENT_ENV", "dev"),
    }
    additional = os.getenv("OTEL_RESOURCE_ATTRIBUTES", "")
    # Parse additional attributes "key=value,key2=value2"
    for part in additional.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            default_attrs[k.strip()] = v.strip()
    resource = Resource(attributes=default_attrs)

    # ----- Tracing -----
    tracer_provider = TracerProvider(resource=resource)
    otlp_endpoint = os.getenv(
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "https://132219246.otel.gitlab-o11y.com:14318",
    )
    span_exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=False)
    span_processor = BatchSpanProcessor(span_exporter)
    tracer_provider.add_span_processor(span_processor)
    trace.set_tracer_provider(tracer_provider)
    # Instrument FastAPI and HTTP clients
    FastAPIInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()
    RequestsInstrumentor().instrument()

    # ----- Metrics -----
    metric_exporter = OTLPMetricExporter(endpoint=otlp_endpoint, insecure=False)
    metric_reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=60000)
    metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=[metric_reader]))

    # Return objects for potential further use (optional)
    return tracer_provider, metrics.get_meter_provider()
