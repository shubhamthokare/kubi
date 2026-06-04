import requests
from pymongo import MongoClient

def main():
    email = "alice@example.com"
    password = "SuperSecret123"
    name = "Alice SRE"
    
    # 1. Register user via API
    url = "http://localhost:8000/api/auth/register"
    payload = {
        "email": email,
        "password": password,
        "name": name
    }
    
    try:
        res = requests.post(url, json=payload)
        print("Registration response:", res.status_code, res.json())
    except Exception as e:
        print("Failed to call API register:", e)
        
    # 2. Verify user in MongoDB
    mongo_url = "mongodb://localhost:27018"
    client = MongoClient(mongo_url)
    db = client["kubi"]
    
    update_res = db["users"].update_one(
        {"email": email},
        {"$set": {"is_email_verified": True}}
    )
    print(f"Updated {update_res.modified_count} users to verified state.")
    client.close()

if __name__ == "__main__":
    main()
