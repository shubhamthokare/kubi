# Minimal opentelemetry trace stub

class Span:
    def __init__(self, name: str = "span"):
        self.name = name
    def end(self):
        pass
    def set_attribute(self, key, value):
        pass

class Tracer:
    def start_as_current_span(self, name: str = "operation"):
        # context manager returning a Span
        class _SpanContextManager:
            def __enter__(self_inner):
                return Span(name)
            def __exit__(self_inner, exc_type, exc, tb):
                pass
        return _SpanContextManager()

def get_tracer(name: str = "default"):
    return Tracer()
