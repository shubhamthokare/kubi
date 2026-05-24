"""
Kubi AI — WebSocket Log Streaming

Copyright (c) 2026 Kubi AI Authors
Licensed under the MIT License

Provides a WebSocket endpoint that streams live container logs directly
from Kubernetes to the frontend dashboard. Uses asyncio subprocess to
run `kubectl logs --follow` and pipes output to the WS client.
"""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core.auth import decode_jwt_token
from app.core.config import settings

logger = logging.getLogger(__name__)

ws_router = APIRouter()


@ws_router.websocket("/ws/logs")
async def stream_pod_logs(
    websocket: WebSocket,
    pod: str = Query(..., description="Pod name"),
    namespace: str = Query("default", description="Kubernetes namespace"),
    token: str = Query(..., description="JWT Bearer token"),
    container: str = Query(None, description="Container name (optional)"),
    tail: int = Query(100, description="Number of previous log lines to show on connect"),
):
    """
    WebSocket endpoint that streams live Kubernetes pod logs.

    Connect via:
        ws://<host>/api/ws/logs?pod=<name>&namespace=<ns>&token=<jwt>

    The client receives newline-delimited log lines as text frames.
    The server sends a special JSON control frame when the stream ends:
        {"type": "eof", "message": "Stream ended."}
    """
    # ── 1. Authenticate ──────────────────────────────────────────────────
    try:
        decode_jwt_token(token, settings.JWT_SECRET_KEY)
    except ValueError as e:
        await websocket.close(code=4001, reason=f"Unauthorized: {e}")
        return

    await websocket.accept()
    logger.info(f"WebSocket log stream opened: {namespace}/{pod} (container={container})")

    # ── 2. Build kubectl command ─────────────────────────────────────────
    cmd = [
        "kubectl", "logs",
        "--follow",
        f"--tail={tail}",
        "--namespace", namespace,
        pod,
    ]
    if container:
        cmd += ["--container", container]

    # ── 3. Stream logs ───────────────────────────────────────────────────
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        async def _send_stderr():
            """Forward stderr (e.g. pod-not-found errors) to the client."""
            if process.stderr:
                async for line in process.stderr:
                    text = line.decode("utf-8", errors="replace").rstrip()
                    if text:
                        await websocket.send_text(f"[stderr] {text}\n")

        asyncio.create_task(_send_stderr())

        # Stream stdout line by line
        if process.stdout:
            async for line in process.stdout:
                text = line.decode("utf-8", errors="replace")
                await websocket.send_text(text)

        # Signal clean EOF
        await websocket.send_json({"type": "eof", "message": "Log stream ended."})

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {namespace}/{pod}")
    except Exception as e:
        logger.warning(f"WebSocket log stream error for {namespace}/{pod}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if process and process.returncode is None:
            try:
                process.kill()
                await process.wait()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info(f"WebSocket log stream closed: {namespace}/{pod}")
