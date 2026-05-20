# 📋 Kubi AI: Important Commands Reference

This document provides a comprehensive reference of all important build, deploy, test, and utility commands for the Kubi AI project.

---

## 🚀 Deployment & Infrastructure Commands

### Docker Deployment

**Quick Start (All-in-One)**
```bash
# Windows (PowerShell)
./deploy-docker.ps1

# macOS / Linux
chmod +x deploy-docker.sh
./deploy-docker.sh
```

**Manual Docker Compose Commands**
```bash
# Build and start all services
docker compose -f deploy/container/docker-compose.yml up --build -d

# View running containers
docker compose -f deploy/container/docker-compose.yml ps

# View logs for specific service
docker compose -f deploy/container/docker-compose.yml logs -f be        # Backend
docker compose -f deploy/container/docker-compose.yml logs -f frontend  # Frontend
docker compose -f deploy/container/docker-compose.yml logs -f agent     # Agent

# Stop all services
docker compose -f deploy/container/docker-compose.yml down

# Stop and remove volumes (clean slate)
docker compose -f deploy/container/docker-compose.yml down -v

# Rebuild specific service
docker compose -f deploy/container/docker-compose.yml up --build be
```

### Minikube / Kubernetes Deployment

**Quick Start (Automated)**
```bash
# Windows (PowerShell)
./deploy-minikube.ps1

# macOS / Linux
chmod +x deploy-minikube.sh
./deploy-minikube.sh
```

**Manual Kubernetes Commands**
```bash
# Start Minikube
minikube start --driver=docker

# Stop Minikube
minikube stop

# Delete Minikube cluster
minikube delete

# Access Minikube dashboard
minikube dashboard

# Create namespace
kubectl create namespace kubi

# Deploy using Kustomize
kubectl apply -k deploy/k8s/

# View deployments
kubectl get deployments -n kubi
kubectl get pods -n kubi
kubectl get services -n kubi

# View pod logs
kubectl logs -f -n kubi deployment/kubi-backend
kubectl logs -f -n kubi deployment/kubi-agent
kubectl logs -f -n kubi deployment/kubi-frontend

# Port forwarding to access services locally
kubectl port-forward -n kubi svc/kubi-backend-service 8000:8000
kubectl port-forward -n kubi svc/kubi-frontend-service 3000:3000

# Open Minikube service in browser
minikube service kubi-frontend-service -n kubi

# Scale deployment
kubectl scale deployment kubi-backend -n kubi --replicas=3

# Delete deployment
kubectl delete -k deploy/k8s/

# Describe pod for troubleshooting
kubectl describe pod -n kubi <pod-name>

# Get pod YAML
kubectl get pod -n kubi <pod-name> -o yaml

# Restart pod
kubectl rollout restart deployment/kubi-backend -n kubi
```

### Helm Deployment (Production)

```bash
# Add Kubi Helm repository (if published)
helm repo add kubi https://charts.kubi.ai
helm repo update

# Install Kubi with default values
helm install kubi kubi/kubi-platform -n kubi --create-namespace

# Install with custom values
helm install kubi kubi/kubi-platform -f deploy/helm/values-production.yaml -n kubi

# Upgrade existing Helm release
helm upgrade kubi kubi/kubi-platform --values deploy/helm/values-production.yaml

# Check Helm release status
helm status kubi -n kubi

# View Helm release history
helm history kubi -n kubi

# Rollback to previous version
helm rollback kubi -n kubi

# Uninstall Helm release
helm uninstall kubi -n kubi

# Lint Helm chart
helm lint deploy/helm/

# Test Helm chart
helm template kubi deploy/helm/ | kubectl apply -f - --dry-run=client

# Get Helm values
helm get values kubi -n kubi
```

---

## 🔨 Backend (FastAPI) Commands

### Setup & Installation
```bash
cd apps/backend

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install development dependencies (if separate file)
pip install -r requirements-dev.txt

# Freeze current dependencies
pip freeze > requirements.txt
```

### Running Backend
```bash
# Development server with auto-reload
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# With custom log level
LOGLEVEL=DEBUG python -m uvicorn main:app --reload --port 8000

# Run background tasks only
python tasks.py
```

### Testing & Quality
```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_remediation.py -v

# Run with coverage
pytest --cov=app tests/

# Generate coverage report
pytest --cov=app --cov-report=html tests/

# Format code (Black)
black .

# Lint code (Pylint)
pylint app/

# Type checking
mypy app/

# Security scanning
bandit -r app/

# All quality checks
black . && pylint app/ && mypy app/ && pytest tests/
```

### Build & Docker
```bash
# Build Docker image
docker build -t kubi-backend:latest .

# Build with tag
docker build -t kubi-backend:v1.0.0 .

# Run Docker container
docker run -d -p 8000:8000 \
  -e MONGODB_URL=mongodb://mongodb:27017 \
  -e GEMINI_API_KEY=your_key \
  --name kubi-backend \
  kubi-backend:latest

# View container logs
docker logs -f kubi-backend

# Stop container
docker stop kubi-backend
```

---

## 🎨 Frontend (Next.js) Commands

### Setup & Installation
```bash
cd apps/frontend

# Install dependencies with npm
npm install

# Install with yarn
yarn install

# Install with pnpm
pnpm install
```

### Development
```bash
# Start development server
npm run dev

# Development with specific port
npm run dev -- -p 3001

# Open in browser
# Usually auto-opens at http://localhost:3000
```

### Building & Production
```bash
# Build for production
npm run build

# Start production server
npm start

# Export static site (if applicable)
npm run export
```

### Code Quality
```bash
# Lint code (ESLint)
npm run lint

# Format code (Prettier)
npm run format

# Check formatting without fixing
npm run format:check

# Run TypeScript type check
npm run type-check

# Combined checks
npm run lint && npm run format && npm run type-check
```

### Testing
```bash
# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- path/to/test.test.ts
```

### Build & Docker
```bash
# Build Docker image
docker build -t kubi-frontend:latest .

# Build multi-stage for optimization
docker build --target production -t kubi-frontend:latest .

# Run Docker container
docker run -d -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:8000 \
  --name kubi-frontend \
  kubi-frontend:latest

# View logs
docker logs -f kubi-frontend
```

---

## 🤖 Agent (Python Service) Commands

### Setup & Installation
```bash
cd apps/agent

# Create virtual environment
python -m venv venv

# Activate virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Running Agent
```bash
# Run agent
python main.py

# Run with DEBUG logging
python main.py --log-level DEBUG

# Run with specific Kubernetes context
python main.py --kubeconfig ~/.kube/config --context minikube

# Run as background service
nohup python main.py > agent.log 2>&1 &
```

### Testing & Development
```bash
# Run tests
pytest tests/ -v

# Run with coverage
pytest --cov=agent tests/

# Lint code
pylint .

# Format code
black .
```

### Docker
```bash
# Build image
docker build -t kubi-agent:latest .

# Run container
docker run -d \
  -e BACKEND_URL=http://localhost:8000 \
  -e GEMINI_API_KEY=your_key \
  -v ~/.kube:/root/.kube \
  --name kubi-agent \
  kubi-agent:latest
```

---

## 🗄️ Database Commands

### MongoDB
```bash
# Interactive MongoDB shell
docker exec -it kubi-mongodb mongosh

# View databases
show databases

# Select database
use kubeguardian

# View collections
show collections

# Query data
db.remediations.find().limit(10)

# Insert sample document
db.remediations.insertOne({ title: "Test", status: "pending" })

# Update document
db.remediations.updateOne({ _id: ObjectId("...") }, { $set: { status: "resolved" } })

# Delete document
db.remediations.deleteOne({ _id: ObjectId("...") })

# Drop collection
db.remediations.drop()

# Drop database
db.dropDatabase()

# Create backup
mongodump --out ./backup

# Restore backup
mongorestore ./backup
```

### Elasticsearch
```bash
# Health check
curl http://localhost:9200/_cluster/health

# List indices
curl http://localhost:9200/_cat/indices

# Create index
curl -X PUT http://localhost:9200/kubi-logs

# Search
curl http://localhost:9200/kubi-logs/_search?q=error

# Delete index
curl -X DELETE http://localhost:9200/kubi-logs

# Access Kibana
# Navigate to http://localhost:5601
```

---

## 🔄 Git & CI/CD Commands

### Git Operations
```bash
# Clone repository
git clone <repository-url>

# Create feature branch
git checkout -b feature/my-feature

# Stage changes
git add .

# Commit changes
git commit -m "feat: add new feature"

# Push to remote
git push origin feature/my-feature

# Create pull request
# Use GitHub/GitLab web interface

# Merge pull request
git checkout main
git pull origin main
git merge feature/my-feature

# Tag release
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### GitLab CI/CD (if configured)
```bash
# Trigger pipeline manually
git push origin main

# View pipeline status
# Navigate to GitLab project > CI/CD > Pipelines

# View deployment status
# Navigate to GitLab project > Deployments

# Rollback deployment
# Use GitLab web interface
```

---

## 🐛 Debugging & Troubleshooting

### Docker Debugging
```bash
# View all containers (including stopped)
docker ps -a

# View container resource usage
docker stats

# Inspect container details
docker inspect kubi-backend

# Access container shell
docker exec -it kubi-backend /bin/bash

# View container network
docker network inspect kubi-network

# Clean up unused containers/images
docker system prune -a
```

### Kubernetes Debugging
```bash
# Get cluster info
kubectl cluster-info

# Get nodes
kubectl get nodes

# Get node details
kubectl describe node <node-name>

# Check pod events
kubectl describe pod -n kubi <pod-name>

# Get pod YAML
kubectl get pod -n kubi <pod-name> -o yaml

# Port forward for testing
kubectl port-forward -n kubi pod/<pod-name> 8000:8000

# Execute command in pod
kubectl exec -it -n kubi <pod-name> -- /bin/bash

# Check resource usage
kubectl top nodes
kubectl top pods -n kubi
```

### Logs & Monitoring
```bash
# Docker logs
docker logs -f --tail=100 kubi-backend

# Kubernetes logs
kubectl logs -f -n kubi deployment/kubi-backend --tail=100

# Combined logs from multiple pods
kubectl logs -f -n kubi -l app=backend

# Save logs to file
kubectl logs -n kubi deployment/kubi-backend > debug.log

# View Kibana logs
# Navigate to http://localhost:5601
```

---

## 📊 Monitoring Commands

```bash
# Check API health
curl http://localhost:8000/health

# Check MongoDB connection
curl http://localhost:8000/api/health/db

# Check Elasticsearch
curl http://localhost:9200/_cluster/health

# View application metrics
curl http://localhost:8000/metrics
```

---

## 🧹 Cleanup Commands

```bash
# Remove all Docker containers
docker container prune -f

# Remove all Docker images
docker image prune -a -f

# Remove all Docker volumes
docker volume prune -f

# Remove all Docker networks
docker network prune -f

# Complete Docker cleanup
docker system prune -a -f --volumes

# Clear Node cache
npm cache clean --force

# Clear pip cache
pip cache purge

# Remove Python cache
find . -type d -name __pycache__ -exec rm -r {} +
find . -type f -name "*.pyc" -delete
```

---

## 🚀 Continuous Integration Examples

### GitHub Actions / GitLab CI
See [GitHub Actions workflows](.github/workflows/) or [GitLab CI](.gitlab-ci.yml) for automated testing, linting, and deployment.

```yaml
# Example: Run tests on push
- name: Run Backend Tests
  run: |
    cd apps/backend
    pip install -r requirements.txt
    pytest tests/

- name: Build Docker Image
  run: docker build -t kubi-backend:latest apps/backend/
```

---

## 💡 Pro Tips

1. **Alias Long Commands**: Create shell aliases for frequently used commands
   ```bash
   alias kubi-dev='docker compose -f deploy/container/docker-compose.yml up -d'
   alias kubi-logs='docker compose -f deploy/container/docker-compose.yml logs -f'
   ```

2. **Use .env Files**: Store sensitive values in `.env` files (never commit to git)

3. **Monitor in Real-Time**: Use `docker stats` or `kubectl top` for live resource monitoring

4. **Backup Before Major Changes**: Always backup MongoDB before schema migrations

5. **Keep Dependencies Updated**: Regularly run `pip install --upgrade` and `npm update`

---

*Last Updated: May 20, 2026*  
*Kubi AI Commands Reference*
