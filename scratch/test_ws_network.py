import asyncio
import websockets
import jwt
from datetime import datetime, timezone, timedelta

def generate_token():
    payload = {
        "sub": "dev-sre",
        "username": "dev-sre",
        "role": "admin",
        "org": "kubi-org",
        "scopes": ["sre:read", "sre:write", "admin"],
        "workspace_id": "6a189c3608073d1a9f46974e",
        "exp": datetime.now(timezone.utc) + timedelta(hours=2)
    }
    return jwt.encode(payload, "dummy", algorithm="HS256")

async def main():
    token = generate_token()
    pod = "mongodb-64877795f5-8rhht"
    namespace = "kubi"
    
    url = f"ws://127.0.0.1:8000/api/ws/logs?pod={pod}&namespace={namespace}&token={token}&tail=5"
    print(f"Connecting to real WebSocket over network: {url}")
    
    try:
        async with websockets.connect(url) as ws:
            print("Successfully connected over network! Waiting for log lines...")
            for i in range(5):
                msg = await ws.recv()
                print(f"[{i+1}] {msg.strip()}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
