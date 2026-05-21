#!/bin/bash

# Kubi AI - Monorepo Push to GitLab Script
# Pushes the entire Kubi AI monorepo as a single repository to GitLab

set -e

echo "=================================================="
echo "🚀 Kubi AI - GitLab Monorepo Push Script"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to the root workspace directory
cd /c/Users/shubh/Downloads/repo/kubi

# Initialize Git repository if not present
if [ ! -d ".git" ]; then
    echo -e "${BLUE}⚙️ Initializing Git repository...${NC}"
    git init --initial-branch=main --object-format=sha1
    git remote add origin https://gitlab.com/kubi-agent/kubi.git
fi

echo -e "${BLUE}📋 Checking status...${NC}"
git status --short
echo ""

echo -e "${BLUE}➕ Adding all changes...${NC}"
git add .

echo -e "${BLUE}💾 Committing changes...${NC}"
git commit -m "refactor: resolve SonarQube quality smells, add log sanitization, migrate to timezone-aware datetimes, and fix pytest and node engine version in GitLab CI" || true
echo ""

echo -e "${BLUE}🔄 Pulling remote changes to reconcile histories...${NC}"
git pull origin main --allow-unrelated-histories -s recursive -X ours --no-edit || true
echo ""

echo -e "${BLUE}📤 Pushing to origin/main...${NC}"
git push -u origin main
echo ""

echo "=================================================="
echo -e "${GREEN}🎉 All changes successfully pushed to GitLab Monorepo!${NC}"
echo "=================================================="
echo ""
echo "Repository Link:"
echo "  Monorepo: https://gitlab.com/kubi-agent/kubi"
echo ""
echo "Next steps:"
echo "  1. Monitor GitLab pipeline progress"
echo "  2. Access the single-repo dashboard in GitLab UI"
echo ""
