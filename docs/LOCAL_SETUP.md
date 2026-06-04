# 🏠 Local Development Setup Guide

This guide walks through setting up **Kubi AI** for local development across all three application tiers (Frontend, Backend, Agent).

---

## 📋 Prerequisites

Before you begin, ensure all required tools are installed on your system:

### Required Tools
- **Node.js 18+**: [Download](https://nodejs.org/) (for Next.js frontend)
- **Python 3.9+**: [Download](https://www.python.org/) (for FastAPI backend and agent)
- **Git**: [Download](https://git-scm.com/)
- **MongoDB**: [Download](https://www.mongodb.com/try/download/community) (or use Docker)
- **Docker Desktop**: [Download](https://www.docker.com/products/docker-desktop/) (recommended for database isolation)
- **Google Gemini API Key**: [Get key](https://ai.google.dev/) (required for AI features)

### Verify Installations
```bash
node --version
npm --version
python --version
git --version
```

---

## 🐳 Option A: Quick Start with Docker (Recommended)

For the fastest local setup, use Docker Compose to spin up all services with one command:

### Windows (PowerShell)
```powershell
./deploy.ps1 docker
```

### macOS / Linux (Bash)
```bash
chmod +x deploy.sh
./deploy.sh docker
```

**Services will be available at:**
- 🖥️ **Frontend Dashboard**: http://localhost:3000
- 📡 **Backend API**: http://localhost:8000
- 📊 **Elasticsearch**: http://localhost:9200
- 🎯 **Kibana**: http://localhost:5601

The Docker stack also uses the same public local URL defaults as the Kubernetes overlay:
- `FRONTEND_URL=http://kubi.kontactless.in`
- `BACKEND_URL=http://backend.kubi.kontactless.in`
- `AGENT_URL=http://agent.kubi.kontactless.in`
- `NEXT_PUBLIC_API_URL=http://backend.kubi.kontactless.in/api`

Internal Docker service traffic still stays on Docker service names, such as `http://be:8000` and `http://agent:8080`.

**View Logs:**
```bash
docker compose -f deploy/container/docker-compose.yml logs -f be    # Backend
docker compose -f deploy/container/docker-compose.yml logs -f agent  # Agent
docker compose -f deploy/container/docker-compose.yml logs -f frontend  # Frontend
```

**Stop Services:**
```bash
docker compose -f deploy/container/docker-compose.yml down
```

---

## Minikube Local Access

Use the local Kubernetes overlay when you want Kubi running inside Minikube:

```bash
minikube start --driver=docker
minikube addons enable ingress
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx --timeout=180s

# Windows
./deploy.ps1 minikube-local

# macOS / Linux
./deploy.sh minikube-local
```

`./deploy.ps1 minikube-local` and `./deploy.sh minikube-local` apply the local Ingress manifest, but they do not install the Minikube ingress controller. If `http://kubi.kontactless.in` does not open, verify the controller and ingress:

```bash
kubectl get pods -n ingress-nginx
kubectl get ingress -n kubi
minikube service kubi-frontend-service -n kubi
```

The local overlay gets `BACKEND_URL`, `AGENT_URL`, and `FRONTEND_URL` from `deploy/k8s/overlays/local/.env`. Kustomize generates `kubi-local-config` from that file and copies only those URL keys into `kubi-config`, so `configmap-patch.yaml` does not need manual URL edits.

---

## 🏗️ Option B: Manual Local Development Setup

For a more granular development experience, run each service independently.

### Step 1: Clone & Navigate
```bash
cd kubi
```

### Step 2: Start MongoDB (Docker)
```bash
docker run -d -p 27017:27017 --name kubi-mongodb mongo:latest
```

To verify MongoDB is running:
```bash
docker ps | grep mongodb
```

### Step 3: Backend Setup (FastAPI)

Navigate to the backend directory:
```bash
cd apps/backend
```

#### Create Environment File
Create a `.env` file (or copy from `.env.example`):
```env
GEMINI_API_KEY=dummy
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=kubeguardian
AGENT_URL=http://localhost:8080
ELASTICSEARCH_HOST=http://localhost:9200
LOG_LEVEL=INFO
```

**⚠️ Security**: Never commit `.env` to git. It's already listed in `.gitignore`.

#### Install Dependencies
```bash
pip install -r requirements.txt
```

#### Run Backend
```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Backend is ready at:** http://localhost:8000/docs (Swagger UI)

---

### Step 4: Agent Setup (Python Background Service)

Navigate to the agent directory:
```bash
cd ../../apps/agent
```

#### Create Environment File
```env
GEMINI_API_KEY=dummy
BACKEND_URL=http://localhost:8000
KUBERNETES_CONTEXT=minikube
LOG_LEVEL=INFO
```

#### Install Dependencies
```bash
pip install -r requirements.txt
```

#### Run Agent
```bash
python main.py
```

The agent will start monitoring and connecting to the backend service.

---

### Step 5: Frontend Setup (Next.js)

Navigate to the frontend directory:
```bash
cd ../../apps/frontend
```

#### Create Environment File
Create a `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ELASTICSEARCH_URL=http://localhost:9200
```

#### Install Dependencies
```bash
npm install
```

#### Run Development Server
```bash
npm run dev
```

**Frontend is ready at:** http://localhost:3000

---

### Step 6: Elasticsearch Setup (Optional, for Enhanced Search)

Run Elasticsearch in Docker for semantic search and advanced logging:
```bash
docker run -d -p 9200:9200 -p 5601:5601 \
  -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  -e ES_JAVA_OPTS="-Xms512m -Xmx512m" \
  --name kubi-elasticsearch \
  docker.elastic.co/elasticsearch/elasticsearch:8.13.4

# Kibana (for visualization)
docker run -d -p 5601:5601 \
  -e ELASTICSEARCH_HOSTS=http://elasticsearch:9200 \
  --name kubi-kibana \
  --link kubi-elasticsearch \
  docker.elastic.co/kibana/kibana:8.13.4
```

**Access Kibana at:** http://localhost:5601

---

## 🔧 Common Development Commands

### Backend
```bash
cd apps/backend

# Install dependencies
pip install -r requirements.txt

# Run with auto-reload
python -m uvicorn main:app --reload --port 8000

# Run tests
pytest tests/

# Format code
black .

# Lint code
pylint app/
```

### Frontend
```bash
cd apps/frontend

# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Format code
npm run format

# Lint code
npm run lint
```

### Agent
```bash
cd apps/agent

# Install dependencies
pip install -r requirements.txt

# Run agent
python main.py

# Run with logging
python main.py --log-level DEBUG
```

---

## 🧪 Testing

### Backend Tests
```bash
cd apps/backend
pytest tests/ -v
```

### Frontend Tests
```bash
cd apps/frontend
npm run test
```

### End-to-End Tests (Playwright)

End-to-end tests are written in TypeScript using **Playwright**. To set up and execute:

```bash
cd deploy/playwright

# Install Node dependencies
npm install

# Install Playwright browsers and system dependencies
npx playwright install --with-deps

# Run all tests in headless mode
npm test
```

To run in the interactive UI dashboard:
```bash
npm run test:ui
```

---

## 📊 Database Management

### MongoDB Shell Access
```bash
# Interactive MongoDB shell
docker exec -it kubi-mongodb mongosh

# View databases
show databases

# Select database
use kubeguardian

# View collections
show collections

# Query sample data
db.remediations.find().limit(1)
```

### Database Reset (Development Only)
```bash
# Remove MongoDB container
docker rm -f kubi-mongodb

# Restart fresh
docker run -d -p 27017:27017 --name kubi-mongodb mongo:latest
```

---

## 🐛 Troubleshooting

### Port Already in Use
If you see "Address already in use" errors:

```bash
# Find process using port 3000
lsof -i :3000          # macOS/Linux
netstat -ano | grep 3000  # Windows

# Kill the process
kill -9 <PID>          # macOS/Linux
taskkill /PID <PID> /F # Windows
```

### MongoDB Connection Refused
```bash
# Verify MongoDB is running
docker ps | grep mongodb

# Restart MongoDB
docker restart kubi-mongodb

# Check MongoDB logs
docker logs kubi-mongodb
```

### API Key Issues
- Ensure `GEMINI_API_KEY` is set in `.env` (not empty or placeholder)
- Test API key with: `curl -X POST https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=dummy`

### Node Modules/Dependencies Issues
```bash
# Clear and reinstall Node dependencies
cd apps/frontend
rm -rf node_modules package-lock.json
npm install

# Clear and reinstall Python dependencies
cd apps/backend
rm -rf venv/
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 📝 Environment Variables Reference

### Backend (`apps/backend/.env`)
| Variable | Description | Example |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key for AI | `dummy` |
| `MONGODB_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `DATABASE_NAME` | Database name | `kubeguardian` |
| `AGENT_URL` | Agent service URL | `http://localhost:8080` |
| `ELASTICSEARCH_HOST` | Elasticsearch endpoint | `http://localhost:9200` |
| `LOG_LEVEL` | Logging verbosity | `INFO`, `DEBUG`, `ERROR` |

### Agent (`apps/agent/.env`)
| Variable | Description | Example |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | `dummy` |
| `BACKEND_URL` | Backend service URL | `http://localhost:8000` |
| `KUBERNETES_CONTEXT` | K8s context | `minikube`, `docker-desktop` |
| `LOG_LEVEL` | Logging verbosity | `INFO`, `DEBUG` |

### Frontend (`apps/frontend/.env.local`)
| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `http://localhost:8000` |
| `NEXT_PUBLIC_ELASTICSEARCH_URL` | Elasticsearch URL | `http://localhost:9200` |

---

## 🛡️ GitGuardian Pre-push Security Hook

To protect our cloud environments and prevent accidental leaks of sensitive credentials (such as Google Gemini, MongoDB, or Arize API keys), the repository is equipped with a GitGuardian (`ggshield`) pre-push verification hook.

### ⚙️ Setup and Registration

The repository utilizes a centralized hooks path configured via `.githooks/`. To set up the pre-push hook locally on your system:

1. **Install and Register**:
   Run the helper installation script to download `ggshield` and install the hooks:
   ```bash
   chmod +x scripts/setup_gitguardian.sh
   ./scripts/setup_gitguardian.sh
   ```

2. **Authenticate with GitGuardian**:
   Before running a push, ensure your GitGuardian API key is available in your shell session. GitGuardian scans your commits automatically before allowing them to reach the remote:
   - **Windows (PowerShell)**:
     ```powershell
     $env:GITGUARDIAN_API_KEY="your_gitguardian_api_token"
     ```
   - **macOS / Linux (Bash)**:
     ```bash
     export GITGUARDIAN_API_KEY="your_gitguardian_api_token"
     ```

### ⏭️ Bypassing Slow Test Verification Suite

The pre-push hook also acts as a quality gate, running automated test suites inside cached Docker containers before completing the push. If your local Docker setup is resource-constrained or you wish to bypass this check during quick development iterations, set `SKIP_TESTS=1`:
- **Windows (PowerShell)**:
  ```powershell
  $env:SKIP_TESTS="1"
  ```
- **macOS / Linux (Bash)**:
  ```bash
  export SKIP_TESTS="1"
  ```

---

## 📚 Next Steps

After setting up locally:
1. **Test the Dashboard**: Navigate to http://localhost:3000 and explore the UI
2. **Run Sample Tests**: Execute backend tests with `pytest tests/`
3. **Review API Docs**: Visit http://localhost:8000/docs for OpenAPI documentation
4. **Check Logs**: Monitor service logs for errors and debug information
5. **Read the Deployment Guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup

---

*Last Updated: May 26, 2026*  
*Kubi AI Local Development Guide*
