# Stub implementation for arize.otel module used in the agent code.
# Dynamically forwards to the real arize-otel package if it is installed,
# otherwise falls back to a clean mock TracerProvider.

import logging
import os
import sys
import importlib

logger = logging.getLogger(__name__)

# Try to find and load the real arize.otel package from system site-packages
real_otel = None
local_arize_dir = os.path.dirname(os.path.abspath(__file__))
local_parent_dir = os.path.dirname(local_arize_dir)

# Save original path and modules
original_sys_path = sys.path.copy()
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != os.path.abspath(local_parent_dir)]

saved_modules = {}
for k in list(sys.modules.keys()):
    if k == 'arize' or k.startswith('arize.'):
        saved_modules[k] = sys.modules.pop(k)

try:
    real_otel = importlib.import_module('arize.otel')
except ImportError:
    pass
finally:
    # Restore sys.path and sys.modules
    sys.path = original_sys_path
    for k, v in saved_modules.items():
        if k not in sys.modules:
            sys.modules[k] = v

if real_otel is not None:
    # Expose all attributes of real_otel
    globals().update({k: v for k, v in real_otel.__dict__.items() if not k.startswith('__')})
    register = real_otel.register
    try:
        Transport = real_otel.Transport
    except AttributeError:
        class Transport:
            HTTP = "http"
            GRPC = "grpc"
else:
    class Transport:
        HTTP = "http"
        GRPC = "grpc"

    try:
        from opentelemetry.sdk.trace import TracerProvider
        HAS_SDK = True
    except ImportError:
        HAS_SDK = False

    def register(*args, **kwargs):
        """Return a dummy tracer provider object.
        The real arize library returns a TracerProvider; for testing we return a simple object.
        """
        if HAS_SDK:
            try:
                provider = TracerProvider()
                if not hasattr(provider, "close"):
                    provider.close = lambda: None
                return provider
            except Exception as e:
                logger.warning(f"Failed to instantiate standard TracerProvider: {e}")
                
        class DummyTracerProvider:
            def get_tracer(self, *args, **kwargs):
                class DummyContextManager:
                    def __enter__(self):
                        return self
                    def __exit__(self, exc_type, exc_val, exc_tb):
                        return False

                class DummyTracer:
                    def start_as_current_span(self, *args, **kwargs):
                        return DummyContextManager()
                    def start_span(self, *args, **kwargs):
                        return DummyContextManager()
                return DummyTracer()

            def add_span_processor(self, *args, **kwargs):
                pass

            def shutdown(self):
                pass

            def close(self):
                pass
                
        return DummyTracerProvider()
