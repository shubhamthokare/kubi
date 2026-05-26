import pytest
pytestmark = pytest.mark.skip(reason="requires local backend service")

# 1. Ingest a fresh incident
r1 = requests.post(BASE + '/incidents/ingest', json={
    'pod_name': 'es-test-pod-xyz',
    'namespace': 'default',
    'cluster_id': 'kubi-internal-agent',
    'status': 'active',
    'phase': 'CrashLoopBackOff',
    'title': 'Incident: es-test-pod-xyz CrashLoopBackOff detected',
    'severity': 'critical'
}, timeout=10)
print('Ingest:', r1.status_code, r1.json())

time.sleep(2)

# 2. Search full-text
r2 = requests.get(BASE + '/search?q=CrashLoopBackOff&size=5', timeout=10)
d = r2.json()
print('Search status:', r2.status_code, '| total:', d.get('total'), '| results:', len(d.get('results', [])))
if d.get('results'):
    print('  Top result:', d['results'][0].get('title'))

# 3. ES Health
r3 = requests.get(BASE + '/es/health', timeout=10)
h = r3.json()
print('ES status:', h.get('status'))
for name, info in h.get('indices', {}).items():
    print('  index=' + name + ' docs=' + str(info.get('doc_count', 0)))
