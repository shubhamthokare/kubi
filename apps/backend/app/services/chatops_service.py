"""
Kubi AI — ChatOps Notification Service

Copyright (c) 2026 Kubi AI Authors
Licensed under the MIT License

Sends incident and remediation alerts to Slack, Microsoft Teams, or Discord
via their respective incoming webhook APIs. No external libraries required —
uses httpx (already in requirements) for async HTTP POSTs.
"""

import logging
import asyncio
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class ChatOpsService:
    """
    Sends formatted alerts to Slack / Teams / Discord webhooks.
    Provider is detected from the webhook URL or an explicit provider hint.
    """

    def __init__(self, webhook_url: str, provider: str = "auto"):
        self.webhook_url = webhook_url.strip()
        # Auto-detect provider from URL if not explicitly set
        if provider == "auto":
            if "hooks.slack.com" in self.webhook_url:
                self.provider = "slack"
            elif "webhook.office.com" in self.webhook_url or "office365.com" in self.webhook_url:
                self.provider = "teams"
            elif "discord.com/api/webhooks" in self.webhook_url:
                self.provider = "discord"
            else:
                self.provider = "slack"  # Default to Slack format (most compatible)
        else:
            self.provider = provider.lower()

    # ──────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────

    async def notify_incident(
        self,
        pod_name: str,
        namespace: str,
        cluster_id: Optional[str],
        rca: Optional[str],
        plan_summary: Optional[str],
    ) -> None:
        """Send a new-incident alert."""
        try:
            payload = self._build_incident_payload(
                pod_name, namespace, cluster_id, rca, plan_summary
            )
            await self._send(payload)
            logger.info(f"ChatOps incident alert sent for pod {pod_name}")
        except Exception as e:
            logger.warning(f"ChatOps incident notification failed: {e}")

    async def notify_remediation(
        self,
        plan_id: str,
        pod_name: Optional[str],
        namespace: Optional[str],
        status: str,          # "completed" | "failed_execution" | "failed_verification"
        actions_summary: Optional[str] = None,
    ) -> None:
        """Send a remediation-completed alert."""
        try:
            payload = self._build_remediation_payload(
                plan_id, pod_name, namespace, status, actions_summary
            )
            await self._send(payload)
            logger.info(f"ChatOps remediation alert sent for plan {plan_id} ({status})")
        except Exception as e:
            logger.warning(f"ChatOps remediation notification failed: {e}")

    # ──────────────────────────────────────────────────────────────────────
    # Payload Builders
    # ──────────────────────────────────────────────────────────────────────

    def _build_incident_payload(
        self,
        pod_name: str,
        namespace: str,
        cluster_id: Optional[str],
        rca: Optional[str],
        plan_summary: Optional[str],
    ) -> dict:
        rca_text = (rca or "Analysis in progress…")[:300]
        plan_text = (plan_summary or "Remediation plan generating…")[:200]
        cluster_text = cluster_id or "default"

        if self.provider == "slack":
            return {
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": "🚨 New Incident Detected",
                            "emoji": True,
                        },
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Pod:*\n`{pod_name}`"},
                            {"type": "mrkdwn", "text": f"*Namespace:*\n`{namespace}`"},
                            {"type": "mrkdwn", "text": f"*Cluster:*\n`{cluster_text}`"},
                            {"type": "mrkdwn", "text": f"*Status:*\n🔴 Active"},
                        ],
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Root Cause Analysis:*\n{rca_text}",
                        },
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Remediation Plan:*\n{plan_text}",
                        },
                    },
                    {"type": "divider"},
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "mrkdwn",
                                "text": "🤖 Kubi AI Autonomous SRE Platform",
                            }
                        ],
                    },
                ]
            }

        if self.provider == "teams":
            return {
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "themeColor": "FF0000",
                "summary": f"🚨 Incident: {pod_name}",
                "sections": [
                    {
                        "activityTitle": f"🚨 New Incident: `{pod_name}`",
                        "activitySubtitle": f"Namespace: `{namespace}` | Cluster: `{cluster_text}`",
                        "facts": [
                            {"name": "Status", "value": "🔴 Active"},
                            {"name": "Root Cause", "value": rca_text},
                            {"name": "Remediation Plan", "value": plan_text},
                        ],
                    }
                ],
            }

        # Discord
        return {
            "embeds": [
                {
                    "title": "🚨 New Incident Detected",
                    "color": 0xFF4444,
                    "fields": [
                        {"name": "Pod", "value": f"`{pod_name}`", "inline": True},
                        {"name": "Namespace", "value": f"`{namespace}`", "inline": True},
                        {"name": "Cluster", "value": f"`{cluster_text}`", "inline": True},
                        {"name": "Root Cause Analysis", "value": rca_text, "inline": False},
                        {"name": "Remediation Plan", "value": plan_text, "inline": False},
                    ],
                    "footer": {"text": "🤖 Kubi AI Autonomous SRE"},
                }
            ]
        }

    def _build_remediation_payload(
        self,
        plan_id: str,
        pod_name: Optional[str],
        namespace: Optional[str],
        status: str,
        actions_summary: Optional[str],
    ) -> dict:
        is_success = status == "completed"
        emoji = "✅" if is_success else "❌"
        color_hex = 0x34D399 if is_success else 0xFF4444
        color_teams = "34D399" if is_success else "FF4444"
        status_label = "Remediation Succeeded" if is_success else f"Remediation {status.replace('_', ' ').title()}"
        pod_text = pod_name or "unknown"
        ns_text = namespace or "unknown"
        summary = (actions_summary or "No details available.")[:300]

        if self.provider == "slack":
            return {
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": f"{emoji} {status_label}",
                            "emoji": True,
                        },
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Pod:*\n`{pod_text}`"},
                            {"type": "mrkdwn", "text": f"*Namespace:*\n`{ns_text}`"},
                            {"type": "mrkdwn", "text": f"*Plan ID:*\n`{plan_id[:8]}…`"},
                            {"type": "mrkdwn", "text": f"*Outcome:*\n{'🟢 Healthy' if is_success else '🔴 Failed'}"},
                        ],
                    },
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": f"*Actions:*\n{summary}"},
                    },
                    {"type": "divider"},
                    {
                        "type": "context",
                        "elements": [{"type": "mrkdwn", "text": "🤖 Kubi AI Autonomous SRE Platform"}],
                    },
                ]
            }

        if self.provider == "teams":
            return {
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "themeColor": color_teams,
                "summary": f"{emoji} {status_label}",
                "sections": [
                    {
                        "activityTitle": f"{emoji} {status_label}",
                        "activitySubtitle": f"Pod: `{pod_text}` | Namespace: `{ns_text}`",
                        "facts": [
                            {"name": "Plan ID", "value": plan_id[:8] + "…"},
                            {"name": "Outcome", "value": "Healthy" if is_success else "Failed"},
                            {"name": "Actions", "value": summary},
                        ],
                    }
                ],
            }

        # Discord
        return {
            "embeds": [
                {
                    "title": f"{emoji} {status_label}",
                    "color": color_hex,
                    "fields": [
                        {"name": "Pod", "value": f"`{pod_text}`", "inline": True},
                        {"name": "Namespace", "value": f"`{ns_text}`", "inline": True},
                        {"name": "Plan ID", "value": f"`{plan_id[:8]}…`", "inline": True},
                        {"name": "Actions", "value": summary, "inline": False},
                    ],
                    "footer": {"text": "🤖 Kubi AI Autonomous SRE"},
                }
            ]
        }

    # ──────────────────────────────────────────────────────────────────────
    # HTTP Transport
    # ──────────────────────────────────────────────────────────────────────

    async def _send(self, payload: dict) -> None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(self.webhook_url, json=payload)
            if response.status_code not in (200, 204):
                logger.warning(
                    f"ChatOps webhook returned {response.status_code}: {response.text[:200]}"
                )


async def get_chatops_service() -> Optional[ChatOpsService]:
    """
    Reads chatops config from MongoDB system_config.
    Returns a configured ChatOpsService if enabled, else None.
    """
    try:
        from app.db.database import get_db
        db = get_db()
        cfg = await db.settings.find_one({"id": "system_config"})
        if not cfg:
            return None
        if not cfg.get("chatops_enabled", False):
            return None
        url = cfg.get("chatops_webhook_url", "").strip()
        if not url:
            return None
        provider = cfg.get("chatops_provider", "auto")
        return ChatOpsService(webhook_url=url, provider=provider)
    except Exception as e:
        logger.warning(f"Could not load ChatOps config: {e}")
        return None
