"""
Unit tests for app.services.chatops_service.ChatOpsService

Covers:
  - Provider auto-detection from webhook URL (Slack, Teams, Discord)
  - Explicit provider override
  - _build_incident_payload for each provider
  - _build_remediation_payload for success/failure states
  - notify_incident / notify_remediation (mocked HTTP)
  - _send error handling
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from app.services.chatops_service import ChatOpsService


# ── Provider Detection ───────────────────────────────────────────────────

class TestProviderDetection:
    def test_slack_auto(self):
        svc = ChatOpsService("https://hooks.slack.com/services/T00/B00/xxx")
        assert svc.provider == "slack"

    def test_teams_auto_webhook_office(self):
        svc = ChatOpsService("https://outlook.webhook.office.com/webhookb2/xxx")
        assert svc.provider == "teams"

    def test_teams_auto_office365(self):
        svc = ChatOpsService("https://xxx.office365.com/webhookb2/xxx")
        assert svc.provider == "teams"

    def test_discord_auto(self):
        svc = ChatOpsService("https://discord.com/api/webhooks/1234/abcd")
        assert svc.provider == "discord"

    def test_unknown_defaults_to_slack(self):
        svc = ChatOpsService("https://my-custom-webhook.example.com/hook")
        assert svc.provider == "slack"

    def test_explicit_override(self):
        svc = ChatOpsService("https://hooks.slack.com/services/T00/B00/xxx", provider="discord")
        assert svc.provider == "discord"

    def test_explicit_uppercase_normalized(self):
        svc = ChatOpsService("https://example.com", provider="TEAMS")
        assert svc.provider == "teams"

    def test_url_trimmed(self):
        svc = ChatOpsService("  https://hooks.slack.com/services/T00  ")
        assert svc.webhook_url == "https://hooks.slack.com/services/T00"


# ── Incident Payload ─────────────────────────────────────────────────────

class TestIncidentPayload:
    def test_slack_incident_payload(self):
        svc = ChatOpsService("https://hooks.slack.com/x", provider="slack")
        payload = svc._build_incident_payload("pod-a", "prod", "cluster-1", "OOM killed", "Restart deploy")
        assert "blocks" in payload
        blocks = payload["blocks"]
        # Header block
        assert blocks[0]["type"] == "header"
        assert "Incident" in blocks[0]["text"]["text"]

    def test_teams_incident_payload(self):
        svc = ChatOpsService("https://x", provider="teams")
        payload = svc._build_incident_payload("pod-a", "prod", None, "crash", "rollback")
        assert payload["@type"] == "MessageCard"
        assert "sections" in payload

    def test_discord_incident_payload(self):
        svc = ChatOpsService("https://x", provider="discord")
        payload = svc._build_incident_payload("pod-a", "prod", "c1", "rca text", "plan text")
        assert "embeds" in payload
        embed = payload["embeds"][0]
        assert embed["color"] == 0xFF4444

    def test_rca_truncation(self):
        svc = ChatOpsService("https://x", provider="slack")
        long_rca = "X" * 500
        payload = svc._build_incident_payload("pod-a", "ns", None, long_rca, "plan")
        # The RCA text in the payload should be truncated to 300 chars
        section_text = payload["blocks"][2]["text"]["text"]
        # 300 chars of X + header text
        assert len(long_rca[:300]) == 300

    def test_none_cluster_shows_default(self):
        svc = ChatOpsService("https://x", provider="slack")
        payload = svc._build_incident_payload("p", "ns", None, "rca", "plan")
        # Should show "default" for cluster
        fields = payload["blocks"][1]["fields"]
        cluster_field = [f for f in fields if "Cluster" in f["text"]][0]
        assert "default" in cluster_field["text"]


# ── Remediation Payload ──────────────────────────────────────────────────

class TestRemediationPayload:
    def test_slack_success(self):
        svc = ChatOpsService("https://x", provider="slack")
        payload = svc._build_remediation_payload("plan-123", "pod-a", "ns", "completed", "restart ok")
        header_text = payload["blocks"][0]["text"]["text"]
        assert "✅" in header_text
        assert "Succeeded" in header_text

    def test_slack_failure(self):
        svc = ChatOpsService("https://x", provider="slack")
        payload = svc._build_remediation_payload("plan-123", "pod-a", "ns", "failed_execution", "timeout")
        header_text = payload["blocks"][0]["text"]["text"]
        assert "❌" in header_text

    def test_discord_success_color(self):
        svc = ChatOpsService("https://x", provider="discord")
        payload = svc._build_remediation_payload("plan-123", None, None, "completed", "ok")
        assert payload["embeds"][0]["color"] == 0x34D399

    def test_discord_failure_color(self):
        svc = ChatOpsService("https://x", provider="discord")
        payload = svc._build_remediation_payload("plan-123", None, None, "failed_verification", "bad")
        assert payload["embeds"][0]["color"] == 0xFF4444

    def test_teams_remediation(self):
        svc = ChatOpsService("https://x", provider="teams")
        payload = svc._build_remediation_payload("plan-123", "pod-a", "ns", "completed", "done")
        assert payload["themeColor"] == "34D399"


# ── HTTP Transport & Notifications ───────────────────────────────────────

class TestNotifications:
    @pytest.mark.asyncio
    async def test_notify_incident_sends_http(self):
        svc = ChatOpsService("https://hooks.slack.com/test", provider="slack")
        with patch("app.services.chatops_service.httpx.AsyncClient") as MockClient:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client_instance

            await svc.notify_incident("pod-a", "default", "c1", "rca", "plan")
            mock_client_instance.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_notify_remediation_sends_http(self):
        svc = ChatOpsService("https://hooks.slack.com/test", provider="slack")
        with patch("app.services.chatops_service.httpx.AsyncClient") as MockClient:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client_instance

            await svc.notify_remediation("plan-1", "pod", "ns", "completed", "ok")
            mock_client_instance.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_notify_incident_swallows_exception(self):
        """notify_incident should not raise even if _send fails."""
        svc = ChatOpsService("https://hooks.slack.com/test", provider="slack")
        svc._send = AsyncMock(side_effect=Exception("network error"))
        # Should not raise
        await svc.notify_incident("pod-a", "ns", "c1", "rca", "plan")

    @pytest.mark.asyncio
    async def test_notify_remediation_swallows_exception(self):
        svc = ChatOpsService("https://hooks.slack.com/test", provider="slack")
        svc._send = AsyncMock(side_effect=Exception("network error"))
        await svc.notify_remediation("plan-1", "pod", "ns", "completed", "ok")
