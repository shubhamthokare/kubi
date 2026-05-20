#!/bin/bash

# Kubi AI Docker Deployment Script (Bash)

# Color codes
INFO='\033[0;36m'   # Cyan
SUCCESS='\033[0;32m' # Green
WARNING='\033[0;33m' # Yellow
ERROR='\033[0;31m'   # Red
NC='\033[0m'        # No Color

echo -e "${INFO}Starting Kubi AI Deployment on Docker...${NC}"

# 1. Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${ERROR}Docker is not running. Please start the Docker daemon first.${NC}"
    exit 1
fi

# 2. Check and load environment variables from .env
ENV_FILE="./apps/backend/.env"
if [ -f "$ENV_FILE" ]; then
    echo -e "${INFO}Loading environment configurations from $ENV_FILE...${NC}"
    # Read variables from .env (ignoring comments)
    export $(grep -v '^#' "$ENV_FILE" | grep -v '=\${' | xargs)
fi

# If GEMINI_API_KEY is not defined or is placeholder, warn the user
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "\${GEMINI_API_KEY}" ]; then
    echo -e "${WARNING}Warning: GEMINI_API_KEY is not set or is a placeholder.${NC}"
    echo -e "${WARNING}The backend AI remediation feature will not function without a valid key.${NC}"
fi

# 3. Spin up services using Docker Compose
echo -e "${INFO}Running Docker Compose build and deployment...${NC}"
docker compose -f deploy/container/docker-compose.yml up --build -d

if [ $? -eq 0 ]; then
    echo -e "${SUCCESS}Deployment Complete! All services started in the background.${NC}"
    echo -e "--------------------------------------------------"
    echo -e "${SUCCESS}Access the Dashboard at:${NC}"
    echo -e "  http://localhost:3000"
    echo -e ""
    echo -e "${INFO}Monitor the status of your services:${NC}"
    echo -e "  docker compose -f deploy/container/docker-compose.yml ps"
    echo -e ""
    echo -e "${INFO}To view live logs:${NC}"
    echo -e "  Backend: docker compose -f deploy/container/docker-compose.yml logs -f be"
    echo -e "  Agent:   docker compose -f deploy/container/docker-compose.yml logs -f agent"
    echo -e ""
    echo -e "${WARNING}To shut down the deployment:${NC}"
    echo -e "  docker compose -f deploy/container/docker-compose.yml down"
    echo -e "--------------------------------------------------"
else
    echo -e "${ERROR}Docker Compose failed to start services. Please check the logs above.${NC}"
    exit 1
fi
