import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Dynamic module mocking to prevent ModuleNotFoundError when run in environments without all dependencies installed
mock_arize = MagicMock()
mock_arize.otel.Transport.HTTP = 'HTTP'
mock_arize.otel.Transport.GRPC = 'GRPC'
sys.modules['arize'] = mock_arize
sys.modules['arize.otel'] = mock_arize.otel

mock_otel = MagicMock()
sys.modules['opentelemetry'] = mock_otel
sys.modules['opentelemetry.trace'] = mock_otel.trace
sys.modules['opentelemetry.instrumentation.fastapi'] = MagicMock()
sys.modules['opentelemetry.instrumentation.requests'] = MagicMock()
sys.modules['opentelemetry.instrumentation.httpx'] = MagicMock()
sys.modules['opentelemetry.sdk.trace'] = MagicMock()
sys.modules['openinference.instrumentation.google_genai'] = MagicMock()

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.arize_tracing import (
    _sanitize_headers,
    _sanitize_dict,
    initialize_arize_tracing
)

class TestArizeTracing(unittest.TestCase):
    def setUp(self):
        import app.core.arize_tracing
        app.core.arize_tracing.HAS_OTEL = True
        app.core.arize_tracing.HAS_ARIZE = True
        app.core.arize_tracing.HAS_GEMINI_INSTRUMENTOR = True
        app.core.arize_tracing.HAS_FASTAPI_INSTRUMENTOR = True
        app.core.arize_tracing.HAS_HTTP_INSTRUMENTORS = True

    def test_sanitize_headers(self):
        # 1. Test None or empty headers
        self.assertIsNone(_sanitize_headers(None))
        self.assertIsNone(_sanitize_headers({}))
        
        # 2. Test headers with sensitive info
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer sensitive_token",
            "x-api-key": "secret_key",
            "cookie": "session=123"
        }
        
        sanitized = _sanitize_headers(headers)
        self.assertEqual(sanitized["Content-Type"], "application/json")
        self.assertEqual(sanitized["Authorization"], "[REDACTED]")
        self.assertEqual(sanitized["x-api-key"], "[REDACTED]")
        self.assertEqual(sanitized["cookie"], "[REDACTED]")

    def test_sanitize_dict(self):
        # 1. Test None or empty dict
        self.assertIsNone(_sanitize_dict(None))
        self.assertIsNone(_sanitize_dict({}))
        
        # 2. Test nested dict with sensitive fields
        data = {
            "name": "Kubi Test",
            "password": "my_super_password",
            "nested": {
                "token": "sensitive_token",
                "non_sensitive": 42
            },
            "list_val": [
                {"secret": "embedded_secret"},
                "plain_string"
            ]
        }
        
        sanitized = _sanitize_dict(data)
        self.assertEqual(sanitized["name"], "Kubi Test")
        self.assertEqual(sanitized["password"], "[REDACTED]")
        self.assertEqual(sanitized["nested"]["token"], "[REDACTED]")
        self.assertEqual(sanitized["nested"]["non_sensitive"], 42)
        self.assertEqual(sanitized["list_val"][0]["secret"], "[REDACTED]")
        self.assertEqual(sanitized["list_val"][1], "plain_string")

    @patch('app.core.arize_tracing.register')
    @patch('app.core.arize_tracing.GoogleGenAIInstrumentor')
    @patch('app.core.arize_tracing.FastAPIInstrumentor')
    @patch('app.core.arize_tracing.RequestsInstrumentor')
    @patch('app.core.arize_tracing.HTTPXClientInstrumentor')
    @patch('app.core.arize_tracing.trace')
    def test_initialize_arize_tracing_unconfigured(
        self, mock_trace, mock_httpx, mock_requests, mock_fastapi, mock_gemini, mock_register
    ):
        # Clear env variables
        with patch.dict(os.environ, {}, clear=True):
            result = initialize_arize_tracing()
            self.assertIsNone(result)
            mock_register.assert_not_called()

    @patch('app.core.arize_tracing.register')
    @patch('app.core.arize_tracing.GoogleGenAIInstrumentor')
    @patch('app.core.arize_tracing.FastAPIInstrumentor')
    @patch('app.core.arize_tracing.RequestsInstrumentor')
    @patch('app.core.arize_tracing.HTTPXClientInstrumentor')
    @patch('app.core.arize_tracing.trace')
    def test_initialize_arize_tracing_local_disabled(
        self, mock_trace, mock_httpx, mock_requests, mock_fastapi, mock_gemini, mock_register
    ):
        with patch.dict(os.environ, {"ENVIRONMENT": "local", "ARIZE_ENABLED": "false"}, clear=True):
            result = initialize_arize_tracing()
            self.assertIsNone(result)
            mock_register.assert_not_called()

    @patch('app.core.arize_tracing.register')
    @patch('app.core.arize_tracing.GoogleGenAIInstrumentor')
    @patch('app.core.arize_tracing.FastAPIInstrumentor')
    @patch('app.core.arize_tracing.RequestsInstrumentor')
    @patch('app.core.arize_tracing.HTTPXClientInstrumentor')
    @patch('app.core.arize_tracing.trace')
    def test_initialize_arize_tracing_production_required_missing_config(
        self, mock_trace, mock_httpx, mock_requests, mock_fastapi, mock_gemini, mock_register
    ):
        env_config = {
            "ENVIRONMENT": "production",
            "ARIZE_REQUIRE_DASHBOARD": "true",
        }
        with patch.dict(os.environ, env_config, clear=True):
            with self.assertRaises(RuntimeError):
                initialize_arize_tracing()

    @patch('app.core.arize_tracing.register')
    @patch('app.core.arize_tracing.GoogleGenAIInstrumentor')
    @patch('app.core.arize_tracing.FastAPIInstrumentor')
    @patch('app.core.arize_tracing.RequestsInstrumentor')
    @patch('app.core.arize_tracing.HTTPXClientInstrumentor')
    @patch('app.core.arize_tracing.trace')
    def test_initialize_arize_tracing_cloud_mode(
        self, mock_trace, mock_httpx, mock_requests, mock_fastapi, mock_gemini, mock_register
    ):
        mock_provider = MagicMock()
        mock_register.return_value = mock_provider
        
        env_config = {
            "ENVIRONMENT": "production",
            "ARIZE_SPACE_ID": "test-space",
            "ARIZE_API_KEY": "test-key",
            "ARIZE_PROJECT_NAME": "test-project"
        }
        
        with patch.dict(os.environ, env_config, clear=True):
            result = initialize_arize_tracing()
            self.assertEqual(result, mock_provider)
            mock_register.assert_called_once_with(
                space_id="test-space",
                api_key="test-key",
                project_name="test-project"
            )
            mock_gemini().instrument.assert_called_once_with(tracer_provider=mock_provider)
            mock_fastapi().instrument.assert_called_once()
            mock_requests().instrument.assert_called_once()
            mock_httpx().instrument.assert_called_once()
            mock_trace.set_tracer_provider.assert_called_once_with(mock_provider)

    @patch('app.core.arize_tracing.register')
    @patch('app.core.arize_tracing.GoogleGenAIInstrumentor')
    @patch('app.core.arize_tracing.FastAPIInstrumentor')
    @patch('app.core.arize_tracing.RequestsInstrumentor')
    @patch('app.core.arize_tracing.HTTPXClientInstrumentor')
    @patch('app.core.arize_tracing.trace')
    def test_initialize_arize_tracing_local_mode(
        self, mock_trace, mock_httpx, mock_requests, mock_fastapi, mock_gemini, mock_register
    ):
        mock_provider = MagicMock()
        mock_register.return_value = mock_provider
        
        env_config = {
            "ENVIRONMENT": "development",
            "PHOENIX_COLLECTOR_ENDPOINT": "http://localhost:6006/v1/traces",
            "ARIZE_PROJECT_NAME": "test-project-local"
        }
        
        with patch.dict(os.environ, env_config, clear=True):
            result = initialize_arize_tracing()
            self.assertEqual(result, mock_provider)
            
            # Since Endpoint has 6006, it should use HTTP transport
            mock_register.assert_called_once_with(
                project_name="test-project-local",
                endpoint="http://localhost:6006/v1/traces",
                transport="HTTP"
            )

if __name__ == '__main__':
    unittest.main()
