from pymongo import MongoClient

def main():
    mongo_url = "mongodb://localhost:27018"
    client = MongoClient(mongo_url)
    db = client["kubi"]
    
    # Delete all users
    user_res = db["users"].delete_many({})
    print(f"Deleted {user_res.deleted_count} users from the database.")
    
    # Delete all otps
    otp_res = db["otps"].delete_many({})
    print(f"Deleted {otp_res.deleted_count} otps from the database.")
    
    client.close()

if __name__ == "__main__":
    main()
