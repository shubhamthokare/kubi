from pymongo import MongoClient

def main():
    mongo_url = "mongodb://127.0.0.1:27018"
    client = MongoClient(mongo_url)
    db = client["kubi"]
    
    settings_list = list(db["settings"].find())
    print(f"TOTAL SETTINGS DOCUMENTS FOUND: {len(settings_list)}")
    for i, settings in enumerate(settings_list):
        print(f"\nDocument {i+1}:")
        print(f"  ID: {settings.get('id')}")
        print(f"  Active Cluster ID: {settings.get('active_cluster_id')}")
        print(f"  Namespaces: {settings.get('namespaces')}")
        clusters = settings.get("clusters", [])
        print(f"  Total Clusters: {len(clusters)}")
        for j, c in enumerate(clusters):
            print(f"    Cluster {j+1}: Name='{c.get('name')}', ID='{c.get('id')}', AuthType='{c.get('auth_type')}', AgentURL='{c.get('agent_url')}', APIEndpoint='{c.get('api_endpoint')}'")
    client.close()

if __name__ == "__main__":
    main()
