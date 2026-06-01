"""
Kubi AI — WebSocket Log Streaming

Copyright (c) 2026 Kubi AI Authors
Licensed under the MIT License

Provides a WebSocket endpoint that streams live container logs directly
from Kubernetes to the frontend dashboard. Uses the Kubernetes Python SDK
to watch namespaced pod logs and streams them to the WS client safely.
"""

import asyncio
import logging
from typing import Optional

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
    container: Optional[str] = Query(None, description="Container name (optional)"),
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
    except Exception as e:
        print("WEB_SOCKET AUTHENTICATION FAILED:", e)
        await websocket.close(code=4001, reason=f"Unauthorized: {e}")
        return

    await websocket.accept()
    logger.info(f"WebSocket log stream opened: {namespace}/{pod} (container={container})")

    # ── 2. Initialize Kubernetes SDK ─────────────────────────────────────
    from kubernetes import client, config
    try:
        config.load_incluster_config()
    except Exception:
        try:
            config.load_kube_config()
        except Exception as e:
            print("WEB_SOCKET KUBERNETES CONFIG LOAD FAILED:", e)
            logger.error(f"Failed to load Kubernetes config: {e}")
            await websocket.send_json({"type": "error", "message": f"Failed to load Kubernetes config: {e}"})
            await websocket.close()
            return

    v1 = client.CoreV1Api()
    loop = asyncio.get_running_loop()
    resp = None

    # ── 3. Streaming Worker in Background Thread ─────────────────────────
    def blocking_log_stream():
        nonlocal resp
        kwargs = {
            "name": pod,
            "namespace": namespace,
            "follow": True,
            "tail_lines": tail,
            "_preload_content": False,
        }
        if container:
            kwargs["container"] = container

        try:
            resp = v1.read_namespaced_pod_log(**kwargs)
            
            while True:
                line = resp.readline()
                if not line:
                    break
                    
                event = line.decode("utf-8", errors="replace")
                # Send log line to client via the main event loop
                asyncio.run_coroutine_threadsafe(
                    websocket.send_text(event),
                    loop
                )
        except Exception as e:
            # Watch stopped or failed
            print("BLOCKING STREAM EXCEPTION:", e)
            logger.error(f"Blocking stream finished/aborted: {e}")

    # Start the blocking stream in a background thread
    stream_task = loop.run_in_executor(None, blocking_log_stream)

    try:
        # Keep connection open and await the stream task or client disconnect
        await stream_task
        # Signal clean EOF
        await websocket.send_json({"type": "eof", "message": "Log stream ended."})

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected by client: {namespace}/{pod}")
    except Exception as e:
        logger.warning(f"WebSocket log stream error for {namespace}/{pod}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # ── 4. Graceful Cleanup ──────────────────────────────────────────
        if resp:
            try:
                resp.close()
                resp.release_conn()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info(f"WebSocket log stream closed: {namespace}/{pod}")
