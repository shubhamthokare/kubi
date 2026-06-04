import os
import sys

# Set up local paths and env
os.environ["MONGODB_URL"] = "mongodb://127.0.0.1:27018"
os.environ["DATABASE_NAME"] = "kubi"
os.environ["ENVIRONMENT"] = "development"
sys.path.insert(0, r"c:\Users\shubh\Downloads\repo\kubi\apps\backend")

from fastapi.testclient import TestClient
from fastapi import WebSocketDisconnect
from main import app
from app.core.auth import create_access_token

def main():
    import logging
    logging.basicConfig(level=logging.INFO)
    token = create_access_token(
        username="dev-sre",
        role="admin",
        org="kubi-org",
        scopes=["sre:read", "sre:write", "admin"]
    )
    
    client = TestClient(app)
    # We will connect to the mongodb pod in kubi namespace
    pod = "mongodb-64877795f5-8rhht"
    namespace = "kubi"
    
    print(f"Connecting to WebSocket /api/ws/logs for pod {pod}...")
    try:
        with client.websocket_connect(f"/api/ws/logs?pod={pod}&namespace={namespace}&token={token}&tail=5") as websocket:
            for i in range(5):
                try:
                    data = websocket.receive_text()
                    print(f"[{i+1}] Received log: {data.strip()}")
                except Exception as e:
                    print(f"Receive text error: {e}")
                    break
    except WebSocketDisconnect as wsd:
        print(f"WebSocket disconnected with code {wsd.code}, reason: {wsd.reason}")
    except Exception as e:
        import traceback
        print("Connection failed:")
        traceback.print_exc()

if __name__ == "__main__":
    main()
