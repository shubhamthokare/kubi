def get_pod_controller_context(pod, apps_v1, logger=None) -> dict:
    owners = pod.metadata.owner_references or []
    context = {
        "has_owner": bool(owners),
        "is_bare_pod": not bool(owners),
        "owner_kind": None,
        "owner_name": None,
        "controller_kind": None,
        "controller_name": None,
        "rollback_target": None,
    }

    if not owners:
        return context

    owner = next((ref for ref in owners if getattr(ref, "controller", False)), owners[0])
    context["owner_kind"] = owner.kind
    context["owner_name"] = owner.name

    if owner.kind == "Deployment":
        return _with_controller(context, "Deployment", owner.name, owner.name)

    if owner.kind == "ReplicaSet":
        try:
            replica_set = apps_v1.read_namespaced_replica_set(
                name=owner.name,
                namespace=pod.metadata.namespace,
            )
            for rs_owner in replica_set.metadata.owner_references or []:
                if rs_owner.kind == "Deployment":
                    return _with_controller(context, "Deployment", rs_owner.name, rs_owner.name)
        except Exception as e:
            if logger:
                logger.warning(f"Could not resolve ReplicaSet owner for pod {pod.metadata.name}: {e}")

        return _with_controller(context, "ReplicaSet", owner.name)

    return _with_controller(context, owner.kind, owner.name)


def build_pod_resource_context(pod, apps_v1, v1=None, logger=None) -> dict:
    """Build normalized remediation constraints for a pod-shaped incident."""
    context = get_pod_controller_context(pod, apps_v1, logger)
    status_reason, status_message = _get_pod_status_reason(pod)
    event_reasons, event_messages = _get_pod_event_context(pod, v1, logger)
    scenario = _classify_scenario(
        phase=getattr(pod.status, "phase", None),
        status_reason=status_reason,
        event_reasons=event_reasons,
        status_message=status_message,
    )
    valid_actions, invalid_actions = _derive_actions(context, scenario)

    context.update({
        "resource_kind": "Pod",
        "resource_name": pod.metadata.name,
        "namespace": pod.metadata.namespace,
        "phase": getattr(pod.status, "phase", None),
        "status_reason": status_reason,
        "status_message": status_message,
        "event_reasons": event_reasons,
        "event_messages": event_messages[:3],
        "scenario": scenario,
        "valid_actions": valid_actions,
        "invalid_actions": invalid_actions,
        "blocked_actions": invalid_actions,
        "recommended_action_family": _recommended_action_family(context, scenario),
        "redemption_guidance": _redemption_guidance(context, scenario, valid_actions, invalid_actions),
    })
    return context


def resolve_rollback_deployment(namespace: str, target: str, v1, apps_v1) -> tuple[str | None, str | None]:
    try:
        apps_v1.read_namespaced_deployment(name=target, namespace=namespace)
        return target, None
    except Exception as e:
        if getattr(e, "status", None) != 404:
            raise

    try:
        pod = v1.read_namespaced_pod(name=target, namespace=namespace)
    except Exception:
        return None, f"Deployment {target} was not found in namespace {namespace}."

    context = get_pod_controller_context(pod, apps_v1)
    if context["controller_kind"] == "Deployment" and context["rollback_target"]:
        return context["rollback_target"], None

    return None, (
        f"Cannot rollback pod {target}: it is not managed by a Deployment. "
        "Use restart_pod to recreate a bare pod, or apply a corrected manifest/image."
    )


def build_kubernetes_error_context(
    status: int | None,
    message: str,
    resource_kind: str | None = None,
    resource_name: str | None = None,
    namespace: str = "default",
) -> dict:
    """Normalize Kubernetes API errors into remediation context for Gemini/Arize/UI."""
    err = (message or "").lower()
    scenario = "kubernetes_api_error"
    valid_actions = ["inspect_events", "refresh_resource_context"]
    invalid_actions = ["retry_same_action"]

    if status == 403 or "forbidden" in err:
        scenario = "RBACForbidden"
        valid_actions = ["inspect_rbac", "update_rbac_manifest", "retry_after_permission_fix"]
        guidance = (
            "Kubernetes rejected the action with RBAC 403. Do not retry the same action until "
            "the service account Role/RoleBinding grants the required verb for the resource."
        )
    elif status == 404 or "not found" in err:
        scenario = "NotFound"
        valid_actions = ["refresh_resource_context", "recreate_from_manifest"]
        guidance = (
            "The target resource no longer exists or the incident is stale. Refresh live state "
            "before choosing a destructive or rollout action."
        )
    else:
        guidance = "Kubernetes API returned an execution error. Inspect the live resource and events before retrying."

    return {
        "resource_kind": resource_kind,
        "resource_name": resource_name,
        "namespace": namespace,
        "scenario": scenario,
        "status_reason": scenario,
        "status_message": message,
        "valid_actions": valid_actions,
        "invalid_actions": invalid_actions,
        "blocked_actions": invalid_actions,
        "redemption_guidance": guidance,
    }


def _with_controller(context: dict, kind: str, name: str, rollback_target: str | None = None) -> dict:
    context.update({
        "controller_kind": kind,
        "controller_name": name,
        "rollback_target": rollback_target,
    })
    return context


def _get_pod_status_reason(pod) -> tuple[str | None, str | None]:
    reason = getattr(pod.status, "reason", None)
    message = getattr(pod.status, "message", None)
    statuses = (getattr(pod.status, "init_container_statuses", None) or []) + (
        getattr(pod.status, "container_statuses", None) or []
    )
    for status in statuses:
        state = getattr(status, "state", None)
        waiting = getattr(state, "waiting", None) if state else None
        terminated = getattr(state, "terminated", None) if state else None
        if waiting:
            return waiting.reason, waiting.message
        if terminated:
            term_reason = terminated.reason or ("OOMKilled" if getattr(terminated, "exit_code", None) == 137 else "Error")
            term_message = terminated.message or f"Container terminated with exit code {getattr(terminated, 'exit_code', 'unknown')}"
            return term_reason, term_message
    return reason, message


def _get_pod_event_context(pod, v1, logger=None) -> tuple[list[str], list[str]]:
    if not v1:
        return [], []
    try:
        events = v1.list_namespaced_event(
            namespace=pod.metadata.namespace,
            field_selector=f"involvedObject.name={pod.metadata.name}",
            limit=20,
        )
        reasons = []
        messages = []
        for event in getattr(events, "items", []) or []:
            if getattr(event, "reason", None):
                reasons.append(event.reason)
            if getattr(event, "message", None):
                messages.append(event.message)
        return list(dict.fromkeys(reasons)), messages
    except Exception as e:
        if logger:
            logger.warning(f"Could not read events for pod {pod.metadata.name}: {e}")
        return [], []


def _classify_scenario(phase: str | None, status_reason: str | None, event_reasons: list[str], status_message: str | None) -> str:
    text = " ".join([phase or "", status_reason or "", status_message or "", *event_reasons]).lower()
    if "imagepullbackoff" in text or "errimagepull" in text:
        return "ImagePullBackOff"
    if "crashloopbackoff" in text:
        return "CrashLoopBackOff"
    if "oomkilled" in text or "outofmemory" in text:
        return "OOMKilled"
    if "unhealthy" in text or "readiness" in text or "liveness" in text or "probe" in text:
        return "ProbeFailure"
    if "failedscheduling" in text or phase == "Pending":
        return "Pending"
    if "forbidden" in text or " 403" in text:
        return "RBACForbidden"
    if "notfound" in text or "not found" in text or " 404" in text:
        return "NotFound"
    return status_reason or phase or "Unknown"


def _derive_actions(context: dict, scenario: str) -> tuple[list[str], list[str]]:
    controller_kind = context.get("controller_kind")
    is_bare_pod = context.get("is_bare_pod")
    valid = ["inspect_logs", "inspect_events"]
    invalid = []

    if is_bare_pod:
        valid.extend(["restart_pod", "apply_manifest"])
        invalid.extend(["rollback_deployment", "restart_deployment"])
    elif controller_kind == "Deployment":
        valid.extend(["restart_deployment", "rollback_deployment", "apply_manifest"])
    elif controller_kind == "StatefulSet":
        valid.extend(["restart_statefulset", "apply_manifest", "scale_statefulset"])
        invalid.append("rollback_deployment")
    elif controller_kind == "DaemonSet":
        valid.extend(["restart_daemonset", "apply_manifest"])
        invalid.append("rollback_deployment")
    elif controller_kind in ["Job", "CronJob"]:
        valid.extend(["rerun_job", "apply_manifest"])
        invalid.extend(["rollback_deployment", "restart_deployment"])
    else:
        valid.extend(["restart_pod", "apply_manifest"])
        invalid.append("rollback_deployment")

    if scenario == "Pending":
        valid.extend(["inspect_scheduling", "adjust_resources", "inspect_pvc"])
    elif scenario == "ImagePullBackOff":
        valid.extend(["fix_image_reference", "fix_image_pull_secret"])
    elif scenario == "CrashLoopBackOff":
        valid.extend(["inspect_previous_logs", "fix_env_or_command"])
    elif scenario == "OOMKilled":
        valid.extend(["adjust_memory_limits"])
    elif scenario == "ProbeFailure":
        valid.extend(["fix_probe_config"])
    elif scenario == "RBACForbidden":
        valid.extend(["inspect_rbac", "update_rbac_manifest"])
        invalid.append("retry_same_action")
    elif scenario == "NotFound":
        valid.extend(["refresh_resource_context", "recreate_from_manifest"])
        invalid.append("retry_same_action")

    return list(dict.fromkeys(valid)), list(dict.fromkeys(invalid))


def _recommended_action_family(context: dict, scenario: str) -> str:
    controller_kind = context.get("controller_kind")
    if scenario == "Pending":
        return "scheduling_capacity_or_storage"
    if scenario == "ImagePullBackOff":
        return "image_or_registry_configuration"
    if scenario == "RBACForbidden":
        return "rbac_permission_fix"
    if scenario == "NotFound":
        return "refresh_or_recreate"
    if context.get("is_bare_pod"):
        return "pod_manifest_or_recreate"
    if controller_kind:
        return f"{controller_kind.lower()}_controller_remediation"
    return "pod_level_remediation"


def _redemption_guidance(context: dict, scenario: str, valid_actions: list[str], invalid_actions: list[str]) -> str:
    if context.get("is_bare_pod"):
        return (
            "This is a bare Pod with no Deployment owner. Do not use Deployment rollback. "
            "Use pod logs/events, manifest correction, or delete/recreate the pod."
        )
    if context.get("controller_kind") == "Deployment":
        return (
            f"Target Deployment actions at {context.get('rollback_target') or context.get('controller_name')}; "
            "do not target the ReplicaSet or Pod name for deployment rollback."
        )
    if scenario == "RBACForbidden":
        return "Fix RBAC permissions before retrying the blocked Kubernetes action."
    if scenario == "NotFound":
        return "Refresh live cluster state; the resource may have been deleted or renamed."
    return f"Allowed actions: {', '.join(valid_actions)}. Blocked actions: {', '.join(invalid_actions) or 'none'}."
