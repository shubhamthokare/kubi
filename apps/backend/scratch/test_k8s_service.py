import asyncio
from app.services.kubernetes_service import KubernetesService

async def test():
    k8s = KubernetesService()
    pods = k8s.get_failed_pods(None)
    print(f"Total failed pods: {len(pods)}")
    for p in pods:
        print(f"- {p['namespace']}/{p['name']} ({p['reason']})")

if __name__ == "__main__":
    asyncio.run(test())
