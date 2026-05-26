# Stub implementation for arize.otel module used in the agent code.
# Provides a simple register function and a Transport enum.

class Transport:
    HTTP = "http"
    GRPC = "grpc"

def register(*args, **kwargs):
    """Return a dummy tracer provider object.
    The real arize library returns a TracerProvider; for testing we return a simple object.
    """
    class DummyTracerProvider:
        def close(self):
            pass
    return DummyTracerProvider()
