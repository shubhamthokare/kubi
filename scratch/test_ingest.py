import requests
import uuid

def main():
    base_url = "http://localhost:8000/api"
    
    # 1. Register a new user
    email = f"test-ingest-{uuid.uuid4().hex[:6]}@example.com"
    password = "Password123!"
    name = "Ingest Tester"
    
    print(f"Registering user with email: {email}")
    reg_res = requests.post(f"{base_url}/auth/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    
    print(f"Registration response: {reg_res.status_code}")
    print(reg_res.json())
    if reg_res.status_code != 200:
        return
        
    from pymongo import MongoClient
    client = MongoClient("mongodb://localhost:27018")
    db = client["kubi"]
    
    otp_doc = db.otps.find_one({"email": email})
    if not otp_doc:
        print("No OTP found in database!")
        return
    otp_code = otp_doc["code"]
    print(f"Found OTP in database: {otp_code}")
    
    # Verify Email (the endpoint that sets is_email_verified = True)
    verify_res = requests.post(f"{base_url}/auth/verify-email", json={
        "email": email,
        "code": otp_code
    })
    print(f"Email verification response: {verify_res.status_code}")
    print(verify_res.json())
    
    # Log in
    login_res = requests.post(f"{base_url}/auth/login", json={
        "email": email,
        "password": password
    })
    print(f"Login response: {login_res.status_code}")
    login_data = login_res.json()
    print(login_data)
    
    token = login_data.get("access_token")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Try calling ingest without cluster connection
    print("\nAttempting ingestion without cluster connection...")
    ingest_payload = {
        "pod_name": "test-pod-no-cluster",
        "cluster_id": "some-cluster-id",
        "namespace": "default",
        "type": "CrashLoopBackOff",
        "message": "Crash test",
        "raw_logs": "Log entry"
    }
    ingest_res = requests.post(f"{base_url}/v1/incidents/ingest", json=ingest_payload, headers=headers)
    print(f"Ingest response status: {ingest_res.status_code}")
    print(ingest_res.json())

if __name__ == "__main__":
    main()
