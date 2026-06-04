import json

from app.core import email


def test_send_otp_email_uses_fallback_in_development(monkeypatch):
    calls = []

    monkeypatch.setattr(email.settings, "ENVIRONMENT", " development ")
    monkeypatch.setattr(email.settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(email.resend, "api_key", "re_invalid")
    monkeypatch.setattr(email.resend.Emails, "send", lambda payload: calls.append(payload))

    assert email.send_otp_email("user@example.com", "123456") is True
    assert calls == []


def test_send_otp_email_uses_resend_outside_local_modes(monkeypatch):
    calls = []

    monkeypatch.setattr(email.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(email.settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(email.settings, "EMAIL_FROM", "no-reply@example.com")
    monkeypatch.setattr(email.resend, "api_key", "re_valid")
    monkeypatch.setattr(email.resend.Emails, "send", lambda payload: calls.append(payload) or {"id": "sent_1"})

    assert email.send_otp_email("user@example.com", "123456") is True
    assert calls


def test_send_otp_email_uses_resend_smtp(monkeypatch):
    sent_messages = []
    login_calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            self.host = host
            self.port = port
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def login(self, username, password):
            login_calls.append((username, password))

        def send_message(self, message):
            sent_messages.append(message)

    monkeypatch.setattr(email.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(email.settings, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(email.settings, "EMAIL_FROM", "no-reply@example.com")
    monkeypatch.setattr(email.settings, "SMTP_HOST", "smtp.resend.com")
    monkeypatch.setattr(email.settings, "SMTP_PORT", 465)
    monkeypatch.setattr(email.settings, "SMTP_USERNAME", "resend")
    monkeypatch.setattr(email.settings, "SMTP_PASSWORD", "re_api_key")
    monkeypatch.setattr(email.settings, "SMTP_USE_SSL", "true")
    monkeypatch.setattr(email.settings, "SMTP_USE_TLS", "false")
    monkeypatch.setattr(email.settings, "EMAIL_SENDER_POOL", "")
    monkeypatch.setattr(email, "_reserve_sender", lambda sender: True)
    monkeypatch.setattr(email.smtplib, "SMTP_SSL", FakeSMTP)

    assert email.send_otp_email("user@example.com", "123456") is True
    assert login_calls == [("resend", "re_api_key")]
    assert sent_messages[0]["From"] == "no-reply@example.com"
    assert sent_messages[0]["To"] == "user@example.com"


def test_send_otp_email_returns_false_when_smtp_fails(monkeypatch):
    class FailingSMTP:
        def __init__(self, host, port, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def login(self, username, password):
            pass

        def send_message(self, message):
            raise RuntimeError("sender rejected")

    monkeypatch.setattr(email.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(email.settings, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(email.settings, "EMAIL_FROM", "no-reply@example.com")
    monkeypatch.setattr(email.settings, "SMTP_HOST", "smtp.resend.com")
    monkeypatch.setattr(email.settings, "SMTP_PORT", 465)
    monkeypatch.setattr(email.settings, "SMTP_USERNAME", "resend")
    monkeypatch.setattr(email.settings, "SMTP_PASSWORD", "re_api_key")
    monkeypatch.setattr(email.settings, "SMTP_USE_SSL", "true")
    monkeypatch.setattr(email.settings, "SMTP_USE_TLS", "false")
    monkeypatch.setattr(email.settings, "EMAIL_SENDER_POOL", "")
    monkeypatch.setattr(email, "_reserve_sender", lambda sender: True)
    monkeypatch.setattr(email.smtplib, "SMTP_SSL", FailingSMTP)

    assert email.send_otp_email("user@example.com", "123456") is False


def test_send_otp_email_rotates_after_sender_threshold(monkeypatch):
    sent_messages = []
    connections = []
    reserved = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            self.host = host
            self.port = port
            self.timeout = timeout
            connections.append((host, port))

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def login(self, username, password):
            pass

        def send_message(self, message):
            sent_messages.append(message)

    sender_pool = [
        {
            "name": "resend-a",
            "from": "otp-a@example.com",
            "smtp_host": "smtp.resend.com",
            "smtp_username": "resend",
            "smtp_password": "re_a",
            "switch_after": 2900,
        },
        {
            "name": "sendgrid-b",
            "from": "otp-b@example.com",
            "smtp_host": "smtp.sendgrid.net",
            "smtp_username": "apikey",
            "smtp_password": "sg_b",
            "switch_after": 2900,
        },
    ]

    def reserve(sender):
        reserved.append(sender["name"])
        return sender["name"] == "sendgrid-b"

    monkeypatch.setattr(email.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(email.settings, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(email.settings, "EMAIL_SENDER_POOL", json.dumps(sender_pool))
    monkeypatch.setattr(email.settings, "SMTP_HOST", "smtp.resend.com")
    monkeypatch.setattr(email.settings, "SMTP_PORT", 465)
    monkeypatch.setattr(email.settings, "SMTP_USERNAME", "resend")
    monkeypatch.setattr(email.settings, "SMTP_PASSWORD", "")
    monkeypatch.setattr(email.settings, "SMTP_USE_SSL", "true")
    monkeypatch.setattr(email.settings, "SMTP_USE_TLS", "false")
    monkeypatch.setattr(email, "_reserve_sender", reserve)
    monkeypatch.setattr(email.smtplib, "SMTP_SSL", FakeSMTP)

    assert email.send_otp_email("user@example.com", "123456") is True
    assert reserved == ["resend-a", "sendgrid-b"]
    assert connections == [("smtp.sendgrid.net", 465)]
    assert sent_messages[0]["From"] == "otp-b@example.com"
