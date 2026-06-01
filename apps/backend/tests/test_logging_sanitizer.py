"""
Unit tests for app.core.logging_sanitizer

Covers:
  - Newline and carriage return stripping
  - None input handling
  - Non-string input coercion (int, float, list, dict, Exception)
  - Empty string passthrough
  - Mixed content sanitization
"""
import pytest
from app.core.logging_sanitizer import sanitize_log


class TestSanitizeLog:
    def test_strips_newlines(self):
        assert sanitize_log("hello\nworld") == "hello_world"

    def test_strips_carriage_returns(self):
        assert sanitize_log("hello\rworld") == "hello_world"

    def test_strips_crlf(self):
        assert sanitize_log("line1\r\nline2") == "line1__line2"

    def test_none_returns_empty(self):
        assert sanitize_log(None) == ""

    def test_integer_coercion(self):
        assert sanitize_log(42) == "42"

    def test_float_coercion(self):
        assert sanitize_log(3.14) == "3.14"

    def test_list_coercion(self):
        result = sanitize_log([1, 2, 3])
        assert result == "[1, 2, 3]"

    def test_dict_coercion(self):
        result = sanitize_log({"key": "value"})
        assert "key" in result and "value" in result

    def test_exception_coercion(self):
        result = sanitize_log(RuntimeError("bad\nthing"))
        assert "_" in result  # newline in message should be stripped
        assert "bad" in result

    def test_empty_string(self):
        assert sanitize_log("") == ""

    def test_no_special_chars(self):
        assert sanitize_log("clean text") == "clean text"

    def test_multiple_newlines(self):
        assert sanitize_log("a\n\nb\n") == "a__b_"

    def test_mixed_content(self):
        result = sanitize_log("Status: OK\r\nDetails: line2\nEnd")
        assert "\n" not in result
        assert "\r" not in result
        assert "Status: OK" in result
