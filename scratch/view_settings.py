from pymongo import MongoClient

def main():
    mongo_url = "mongodb://127.0.0.1:27018"
    client = MongoClient(mongo_url)
    db = client["kubi"]
    
    settings = db["settings"].find_one()
    if settings:
        print("SETTINGS FOUND:")
        print(f"Active Cluster ID: {settings.get('active_cluster_id')}")
        print(f"Namespaces: {settings.get('namespaces')}")
        print(f"Gemini Model: {settings.get('gemini_model')}")
        clusters = settings.get("clusters", [])
        print(f"Total Clusters: {len(clusters)}")
        for i, c in enumerate(clusters):
            print(f"\nCluster {i+1}:")
            print(f"  ID: {c.get('id')}")
            print(f"  Name: {c.get('name')}")
            print(f"  Auth Type: {c.get('auth_type')}")
            print(f"  Agent URL: {c.get('agent_url')}")
            print(f"  API Endpoint: {c.get('api_endpoint')}")
            print(f"  Has ca_cert: {bool(c.get('ca_cert'))}")
            print(f"  Has client_cert: {bool(c.get('client_cert'))}")
            print(f"  Has client_key: {bool(c.get('client_key'))}")
    else:
        print("NO SETTINGS FOUND IN DB")
    client.close()

if __name__ == "__main__":
    main()
