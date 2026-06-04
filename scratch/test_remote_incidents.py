import asyncio
import httpx
import json

async def main():
    login_url = "http://localhost:8000/api/auth/login"
    payload = {
        "email": "shubham@gmail.com",
        "password": "12345679@mE"
    }
    
    print(f"Logging in to {login_url}...")
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(login_url, json=payload, timeout=10.0)
            if resp.status_code != 200:
                print(f"Login failed: {resp.status_code} - {resp.text}")
                return
            
            data = resp.json()
            token = data.get("access_token")
            print("Login successful! Token retrieved.")
            
            incidents_url = "http://localhost:8000/api/incidents"
            headers = {
                "Authorization": f"Bearer {token}"
            }
            
            resp = await client.get(incidents_url, headers=headers, timeout=10.0)
            print(f"\n/api/incidents response code: {resp.status_code}")
            if resp.status_code == 200:
                incidents_data = resp.json()
                incidents = incidents_data.get("incidents", [])
                print(f"TOTAL INCIDENTS RETURNED BY API: {len(incidents)}")
                for idx, inc in enumerate(incidents):
                    print(f"- Incident #{idx+1}: {inc.get('id')} - Status: {inc.get('status')} - Pod: {inc.get('pod_name') or inc.get('pod', {}).get('name')}")
            else:
                print(f"Error fetching incidents: {resp.status_code} - {resp.text}")
                
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
