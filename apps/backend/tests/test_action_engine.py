"""
Unit tests for app.services.action_engine.ActionEngine

Covers:
  - execute_action for restart_deployment, rollback_deployment, restart_pod (standalone & managed),
    trigger_gitlab_pipeline, and unknown action types
  - execute_plan sequential execution and stop-on-failure semantics
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from app.services.action_engine import ActionEngine
from app.services.gemini_service import RemediationAction


# ── Fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture
def engine():
    """Return an ActionEngine with a fully mocked KubernetesService."""
    ae = ActionEngine.__new__(ActionEngine)
    ae.k8s_service = MagicMock()
    return ae


def _action(action_type: str, target: str = "my-deploy", ns: str = "default", reason: str = "test"):
    return RemediationAction(action_type=action_type, target_name=target, namespace=ns, reason=reason)


# ── execute_action tests ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_restart_deployment(engine):
    engine.k8s_service.restart_deployment.return_value = (True, "restarted")
    ok, msg = await engine.execute_action(_action("restart_deployment"))
    assert ok is True
    assert msg == "restarted"
    engine.k8s_service.restart_deployment.assert_called_once_with("my-deploy", "default")


@pytest.mark.asyncio
async def test_rollback_deployment(engine):
    engine.k8s_service.rollback_deployment.return_value = (True, "rolled back")
    ok, msg = await engine.execute_action(_action("rollback_deployment"))
    assert ok is True
    engine.k8s_service.rollback_deployment.assert_called_once_with("my-deploy", "default")


@pytest.mark.asyncio
async def test_restart_pod_standalone_bare(engine):
    """A pod named 'failing-pod' should be treated as standalone and use delete_pod."""
    engine.k8s_service.delete_pod.return_value = (True, "deleted")
    ok, msg = await engine.execute_action(_action("restart_pod", target="failing-pod"))
    assert ok is True
    engine.k8s_service.delete_pod.assert_called_once_with("failing-pod", "default")


@pytest.mark.asyncio
async def test_restart_pod_managed(engine):
    """A pod with a replicaset-style suffix should be mapped to restart_deployment."""
    engine.k8s_service.restart_deployment.return_value = (True, "restarted via deploy")
    ok, msg = await engine.execute_action(_action("restart_pod", target="api-server-7f9b4d-xk2j9"))
    assert ok is True
    engine.k8s_service.restart_deployment.assert_called_once()


@pytest.mark.asyncio
async def test_restart_pod_no_digit_suffix(engine):
    """A pod whose last segment has no digits is treated as standalone (bare pod)."""
    engine.k8s_service.delete_pod.return_value = (True, "deleted bare")
    ok, msg = await engine.execute_action(_action("restart_pod", target="worker-cron"))
    assert ok is True
    engine.k8s_service.delete_pod.assert_called_once_with("worker-cron", "default")


@pytest.mark.asyncio
async def test_trigger_gitlab_pipeline(engine):
    with patch("app.services.gitlab_service.GitLabService") as MockGL:
        instance = MockGL.return_value
        instance.trigger_pipeline = AsyncMock(return_value=(True, "pipeline triggered"))
        ok, msg = await engine.execute_action(_action("trigger_gitlab_pipeline", target="my-project"))
        assert ok is True
        assert msg == "pipeline triggered"


@pytest.mark.asyncio
async def test_unknown_action_type(engine):
    ok, msg = await engine.execute_action(_action("delete_namespace"))
    assert ok is False
    assert "Unknown action type" in msg


@pytest.mark.asyncio
async def test_execute_action_exception(engine):
    """When the underlying k8s call raises, we get (False, 'Execution failed: ...')."""
    engine.k8s_service.restart_deployment.side_effect = RuntimeError("connection lost")
    ok, msg = await engine.execute_action(_action("restart_deployment"))
    assert ok is False
    assert "Execution failed" in msg


# ── execute_plan tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_plan_all_success(engine):
    engine.k8s_service.rollback_deployment.return_value = (True, "ok")
    engine.k8s_service.restart_deployment.return_value = (True, "ok")
    actions = [
        _action("rollback_deployment"),
        _action("restart_deployment"),
    ]
    results = await engine.execute_plan(actions)
    assert len(results) == 2
    assert all(r["success"] for r in results)


@pytest.mark.asyncio
async def test_execute_plan_stops_on_failure(engine):
    """If the first action fails, subsequent actions should NOT be executed."""
    engine.k8s_service.rollback_deployment.return_value = (False, "failed")
    engine.k8s_service.restart_deployment.return_value = (True, "ok")
    actions = [
        _action("rollback_deployment"),
        _action("restart_deployment"),
    ]
    results = await engine.execute_plan(actions)
    assert len(results) == 1
    assert results[0]["success"] is False
    # restart_deployment should never be called
    engine.k8s_service.restart_deployment.assert_not_called()


@pytest.mark.asyncio
async def test_execute_plan_empty(engine):
    results = await engine.execute_plan([])
    assert results == []
