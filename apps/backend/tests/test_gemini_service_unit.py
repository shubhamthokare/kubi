"""
Unit tests for app.services.gemini_service.GeminiService

Covers:
  - _simulated_rca: ImagePullBackOff, CrashLoopBackOff, generic/unknown
  - _simulated_remediation_plan: image pull failure vs generic crash
  - _simulated_postmortem: output structure
  - _get_model: prefix stripping logic
  - generate_remediation_plan / analyze_incident / generate_postmortem fallback paths
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.gemini_service import GeminiService, RemediationPlan


# ── Fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture
def svc():
    with patch.object(GeminiService, "__init__", lambda self: None):
        s = GeminiService.__new__(GeminiService)
        return s


# ── _simulated_rca ────────────────────────────────────────────────────────

class TestSimulatedRCA:
    def test_image_pull_backoff(self, svc):
        result = svc._simulated_rca("my-pod", "ImagePullBackOff", 'pulling image "registry.io/img:v1"')
        assert "Image Pull Failure" in result
        assert "registry.io/img:v1" in result
        assert "FALLBACK SRE ENGINE" in result

    def test_image_pull_no_quote(self, svc):
        """When log doesn't have the pulling image quote pattern, default image name is used."""
        result = svc._simulated_rca("my-pod", "ErrImagePull", "general error pulling")
        assert "Image Pull Failure" in result

    def test_crashloopbackoff(self, svc):
        result = svc._simulated_rca("my-pod", "CrashLoopBackOff", "OOMKilled exit code 137")
        assert "Application Crash" in result
        assert "CrashLoopBackOff" in result

    def test_error_status(self, svc):
        result = svc._simulated_rca("my-pod", "Error", "segfault")
        assert "Application Crash" in result

    def test_unknown_status(self, svc):
        result = svc._simulated_rca("my-pod", "Pending", "node unschedulable")
        assert "Unstable Pod Lifecycle" in result
        assert "Pending" in result

    def test_empty_inputs(self, svc):
        result = svc._simulated_rca("my-pod", "", "")
        assert "Unstable Pod Lifecycle" in result


# ── _simulated_remediation_plan ───────────────────────────────────────────

class TestSimulatedRemediationPlan:
    def test_image_pull_failure_standalone_pod(self, svc):
        plan = svc._simulated_remediation_plan("failing-pod", "image pull failure", "logs")
        assert isinstance(plan, RemediationPlan)
        assert plan.actions[0].action_type == "restart_pod"
        assert plan.actions[0].target_name == "failing-pod"

    def test_image_pull_failure_deployment(self, svc):
        plan = svc._simulated_remediation_plan("api-server-7f9b4c98-xk2j9", "image pull failure", "logs")
        assert isinstance(plan, RemediationPlan)
        assert plan.actions[0].action_type == "rollback_deployment"
        # Should extract deployment name by stripping last 2 hyphen segments
        assert "api-server" in plan.actions[0].target_name

    def test_image_pull_bare_pod_context_blocks_rollback(self, svc):
        plan = svc._simulated_remediation_plan(
            "broke-pod",
            "image pull failure",
            "logs",
            resource_context={
                "namespace": "default",
                "has_owner": False,
                "is_bare_pod": True,
                "controller_kind": None,
                "rollback_target": None,
            },
        )
        assert plan.actions[0].action_type == "restart_pod"
        assert plan.actions[0].target_name == "broke-pod"
        assert "rollback is unavailable" in plan.actions[0].reason.lower()
        assert plan.resource_context["is_bare_pod"] is True

    def test_image_pull_deployment_context_targets_controller(self, svc):
        plan = svc._simulated_remediation_plan(
            "api-server-7f9b4c98-xk2j9",
            "image pull failure",
            "logs",
            resource_context={
                "namespace": "prod",
                "has_owner": True,
                "is_bare_pod": False,
                "controller_kind": "Deployment",
                "controller_name": "api-server",
                "rollback_target": "api-server",
            },
        )
        assert plan.actions[0].action_type == "rollback_deployment"
        assert plan.actions[0].target_name == "api-server"
        assert plan.actions[0].namespace == "prod"
        assert plan.resource_context["rollback_target"] == "api-server"

    def test_format_resource_context_includes_action_constraints(self, svc):
        text = svc._format_resource_context({
            "namespace": "default",
            "resource_kind": "Pod",
            "resource_name": "broke-pod",
            "scenario": "CrashLoopBackOff",
            "has_owner": False,
            "is_bare_pod": True,
            "valid_actions": ["inspect_logs", "restart_pod"],
            "invalid_actions": ["rollback_deployment"],
            "redemption_guidance": "Use pod-level recovery.",
        })
        assert "Valid actions" in text
        assert "Blocked actions" in text
        assert "rollback_deployment" in text
        assert "Only recommend actions listed in Valid actions" in text

    def test_generic_crash_standalone_pod(self, svc):
        plan = svc._simulated_remediation_plan("failing-pod", "application crash", "logs")
        assert plan.actions[0].action_type == "restart_pod"

    def test_generic_crash_deployment(self, svc):
        plan = svc._simulated_remediation_plan("web-app-abc12345-def67", "generic error", "logs")
        assert plan.actions[0].action_type == "restart_deployment"

    def test_namespace_extraction_from_logs(self, svc):
        plan = svc._simulated_remediation_plan("my-pod", "imagepullbackoff", "namespace: kube-system some logs")
        assert plan.actions[0].namespace == "kube-system"

    def test_default_namespace(self, svc):
        plan = svc._simulated_remediation_plan("my-pod", "crash", "no ns info")
        assert plan.actions[0].namespace == "default"

    def test_plan_has_summary(self, svc):
        plan = svc._simulated_remediation_plan("my-pod", "image pull issue", "logs")
        assert len(plan.summary) > 0


# ── _simulated_postmortem ─────────────────────────────────────────────────

class TestSimulatedPostmortem:
    def test_basic_structure(self, svc):
        data = {
            "pod": {"name": "test-pod", "namespace": "prod"},
            "rca": "OOM killed",
            "plan_summary": "Restart deployment",
            "first_detected": "2026-01-01T00:00:00Z",
            "resolved_at": "2026-01-01T00:05:00Z",
        }
        result = svc._simulated_postmortem(data)
        assert "## What happened" in result
        assert "## Why it happened" in result
        assert "## How it was resolved" in result
        assert "## How to prevent it in the future" in result
        assert "test-pod" in result
        assert "SIMULATED" in result

    def test_missing_fields(self, svc):
        data = {"pod": {"name": "x", "namespace": "y"}, "rca": "unknown"}
        result = svc._simulated_postmortem(data)
        assert "N/A" in result


# ── _get_model ────────────────────────────────────────────────────────────

class TestGetModel:
    @pytest.mark.asyncio
    async def test_strips_models_prefix(self, svc):
        with patch("app.db.database.get_db") as mock_db:
            db = MagicMock()
            db.settings.find_one = AsyncMock(return_value={"gemini_model": "models/gemini-2.0-flash"})
            mock_db.return_value = db
            model = await svc._get_model()
            assert model == "gemini-2.0-flash"

    @pytest.mark.asyncio
    async def test_strips_double_prefix(self, svc):
        with patch("app.db.database.get_db") as mock_db:
            db = MagicMock()
            db.settings.find_one = AsyncMock(return_value={"gemini_model": "models/models/gemini-2.5-pro"})
            mock_db.return_value = db
            model = await svc._get_model()
            assert model == "gemini-2.5-pro"

    @pytest.mark.asyncio
    async def test_default_model_when_no_db(self, svc):
        with patch("app.db.database.get_db") as mock_db:
            mock_db.side_effect = Exception("no db")
            model = await svc._get_model()
            assert model == "gemini-2.5-pro"

    @pytest.mark.asyncio
    async def test_default_model_when_empty(self, svc):
        with patch("app.db.database.get_db") as mock_db:
            db = MagicMock()
            db.settings.find_one = AsyncMock(return_value={"gemini_model": ""})
            mock_db.return_value = db
            model = await svc._get_model()
            assert model == "gemini-2.5-pro"


# ── Fallback-driven integration tests ────────────────────────────────────

class TestFallbackPaths:
    @pytest.mark.asyncio
    async def test_analyze_incident_fallback(self, svc):
        """When _generate_with_fallback raises, analyze_incident returns simulated RCA with 'rule-based' generated_by."""
        svc._generate_with_fallback = AsyncMock(side_effect=RuntimeError("all offline"))
        result, generated_by = await svc.analyze_incident("pod-x", "CrashLoopBackOff", "exit code 1")
        assert "FALLBACK SRE ENGINE" in result
        assert generated_by == "rule-based"

    @pytest.mark.asyncio
    async def test_generate_remediation_plan_fallback(self, svc):
        """When all AI pathways fail, returns a simulated remediation plan with 'rule-based' generated_by."""
        svc._generate_with_fallback = AsyncMock(side_effect=RuntimeError("offline"))
        svc.get_historical_context = AsyncMock(return_value="No context")
        plan, generated_by = await svc.generate_remediation_plan(
            "pod-x",
            "crash",
            "logs",
            resource_context={"namespace": "default", "is_bare_pod": True, "has_owner": False},
        )
        assert isinstance(plan, RemediationPlan)
        assert len(plan.actions) > 0
        assert plan.actions[0].action_type == "restart_pod"
        assert generated_by == "rule-based"

    @pytest.mark.asyncio
    async def test_generate_postmortem_fallback(self, svc):
        """When all AI pathways fail, returns simulated postmortem."""
        svc._generate_with_fallback = AsyncMock(side_effect=RuntimeError("offline"))
        data = {
            "pod": {"name": "p", "namespace": "ns"},
            "first_detected": "2026-01-01",
            "rca": "test rca",
        }
        result = await svc.generate_postmortem(data)
        assert "SIMULATED" in result
        assert "## What happened" in result
