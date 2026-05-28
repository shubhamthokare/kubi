# 🔧 Kubi Backend Service

FastAPI-based backend service for Kubi AI, providing autonomous Kubernetes recovery operations, AI-driven root cause analysis (RCA), and incident management APIs.

---

## 📋 Overview

The Kubi Backend is the core orchestration engine that:
- Manages incident detection and analysis workflows
- Integrates with Google Gemini for AI-powered RCA
- Communicates with Kubernetes agents for remediation
- Provides REST API for the frontend dashboard
- Handles remediation approvals and executions
- Generates SRE postmortems and incident reports

---

## 🔧 Tech Stack

- **Framework**: FastAPI 0.100+
- **Database**: MongoDB 5.0+
- **Search**: Elasticsearch 8.0+ (optional)
- **AI Engine**: Google Gemini API
- **Server**: Uvicorn
- **Language**: Python 3.9+

---

## 📦 Installation

### Prerequisites
- Python 3.9+
- MongoDB running locally or via Docker
- Virtual environment tool (venv or conda)

### Setup Steps

```bash
# 1. Create virtual environment
python -m venv venv

# 2. Activate virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env file
cp .env.example .env

# 5. Configure .env with your values
# Edit .env and set GEMINI_API_KEY and other required variables
```

---

## 🚀 Running the Backend

### Development Mode (with auto-reload)
```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production Mode
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Access Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI Spec**: http://localhost:8000/openapi.json

---

## 📁 Project Structure

```
apps/backend/
├── main.py                 # FastAPI application entry point
├── app/
│   ├── api/               # API routes and endpoints
│   │   └── routes.py      # Main route definitions
│   ├── core/              # Core configuration and utilities
│   │   ├── config.py      # Settings and environment variables
│   │   └── arize_tracing.py  # Observability setup
│   ├── db/                # Database layer
│   │   └── database.py    # MongoDB connection & models
│   ├── workflows/         # Business logic workflows
│   │   ├── incident_detection.py
│   │   ├── rca_analysis.py
│   │   └── remediation.py
│   └── schemas/           # Pydantic models for request/response
├── tests/                 # Unit and integration tests
├── requirements.txt       # Python dependencies
├── .env.example          # Environment variables template
└── LICENSE               # MIT License

```

---

## 🔌 Environment Variables

Create a `.env` file with the following variables:

```env
# Application
ENVIRONMENT=development
PROJECT_NAME=kubi-AI

# Database
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=kubi

# AI & API Keys
GEMINI_API_KEY=your-actual-key-here

# Integrations
GITLAB_API_URL=https://gitlab.com/api/v4
GITLAB_PRIVATE_TOKEN=your-gitlab-token

# Service URLs
AGENT_URL=http://localhost:8080
CORS_ORIGINS=http://localhost:3000,http://localhost:8000,http://kubi.kontactless.in,http://backend.kubi.kontactless.in,http://agent.kubi.kontactless.in

# Search & Analytics
ELASTICSEARCH_HOST=http://localhost:9200
ELASTICSEARCH_INDEX=kubi-incidents

# Observability (Arize)
ARIZE_SPACE_ID=your-space-id
ARIZE_API_KEY=your-api-key
```

⚠️ **Security**: Never commit `.env` to git. Use `.env.example` for documentation.

---

## 🧪 Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest --cov=app tests/

# Run specific test file
pytest tests/test_remediation.py -v

# Generate HTML coverage report
pytest --cov=app --cov-report=html tests/
```

---

## 🧹 Code Quality

```bash
# Format code (Black)
black .

# Lint code (Pylint)
pylint app/

# Type checking (MyPy)
mypy app/

# Security scanning (Bandit)
bandit -r app/

# All checks combined
black . && pylint app/ && mypy app/ && pytest tests/
```

---

## 🐳 Docker

### Build Image
```bash
docker build -t kubi-backend:latest .
```

### Run Container
```bash
docker run -d \
  -p 8000:8000 \
  -e MONGODB_URL=mongodb://mongodb:27017 \
  -e GEMINI_API_KEY=your-key \
  --name kubi-backend \
  kubi-backend:latest
```

### View Logs
```bash
docker logs -f kubi-backend
```

---

## 📚 API Endpoints

### Health
- `GET /health` - Service health check
- `GET /health/db` - Database connectivity check

### Incidents
- `GET /api/incidents` - List all incidents
- `GET /api/incidents/{id}` - Get incident details
- `POST /api/incidents` - Create new incident
- `PATCH /api/incidents/{id}` - Update incident status

### Remediations
- `GET /api/remediations` - List remediation plans
- `POST /api/remediations/approve` - Approve remediation
- `POST /api/remediations/execute` - Execute remediation

### Analysis
- `POST /api/analysis/rca` - Trigger RCA analysis
- `GET /api/analysis/results/{id}` - Get RCA results

### Documentation
- `GET /docs` - Interactive API documentation (Swagger)
- `GET /redoc` - ReDoc documentation

---

## 🔗 Integration with Other Services

### Frontend
- Backend API served at: `http://localhost:8000`
- CORS configured for: `http://localhost:3000`

### Agent
- Agent connects to backend at: `http://localhost:8000` (local dev)
- In-cluster: `http://kubi-backend-service:8000`

### Database
- MongoDB: `mongodb://localhost:27017`
- Collections: `incidents`, `remediations`, `logs`, `postmortems`

---

## 🐛 Troubleshooting

### MongoDB Connection Error
```bash
# Verify MongoDB is running
docker ps | grep mongodb

# Restart MongoDB
docker restart kubi-mongodb
```

### GEMINI_API_KEY Invalid
- Check `.env` file has valid key
- Verify at: https://ai.google.dev/

### Port Already in Use
```bash
# Find and kill process on port 8000
lsof -i :8000 | grep LISTEN
kill -9 <PID>
```

### Dependency Issues
```bash
# Reinstall dependencies fresh
rm -rf venv/
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 📖 For More Information

- **Local Setup Guide**: See [LOCAL_SETUP.md](../../docs/LOCAL_SETUP.md)
- **Deployment Guide**: See [DEPLOYMENT.md](../../docs/DEPLOYMENT.md)
- **Commands Reference**: See [COMMANDS.md](../../docs/COMMANDS.md)
- **Main README**: See [README.md](../../README.md)

---

## 📄 License

This project is licensed under the **MIT License** - see [LICENSE](./LICENSE) for details.

---

*Last Updated: May 20, 2026*
*Kubi Backend Documentation*
