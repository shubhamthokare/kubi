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

# Detect current active branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    CURRENT_BRANCH="main"
fi

echo -e "Active Branch: ${YELLOW}${CURRENT_BRANCH}${NC}"
echo ""

echo -e "${BLUE}📋 Checking status...${NC}"
git status --short
echo ""

echo -e "${BLUE}➕ Adding all changes...${NC}"
git add .

# Set default or custom commit message
COMMIT_MSG="${1:-"refactor: resolve SonarQube quality smells, add log sanitization, migrate to timezone-aware datetimes, and fix pytest and node engine version in GitLab CI"}"

echo -e "${BLUE}💾 Committing changes: \"${COMMIT_MSG}\"...${NC}"
git commit -m "${COMMIT_MSG}" || true
echo ""

echo -e "${BLUE}🔄 Pulling remote changes for branch '${CURRENT_BRANCH}'...${NC}"
git pull origin "${CURRENT_BRANCH}" --allow-unrelated-histories -s recursive -X ours --no-edit || true
echo ""

echo -e "${BLUE}📤 Pushing to origin/${CURRENT_BRANCH}...${NC}"
git push -u origin "${CURRENT_BRANCH}"
echo ""

echo "=================================================="
echo -e "${GREEN}🎉 All changes successfully pushed to GitLab (${CURRENT_BRANCH})!${NC}"
echo "=================================================="
echo ""
echo "Repository Link:"
echo "  Monorepo: https://gitlab.com/kubi-agent/kubi"
echo ""
echo "Next steps:"
echo "  1. Monitor GitLab pipeline progress"
# Display merge request link if not on main branch
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "  2. Create or view the Merge Request for ${YELLOW}${CURRENT_BRANCH}${NC}:"
    echo "     https://gitlab.com/kubi-agent/kubi/-/merge_requests"
else
    echo "  2. Access the single-repo dashboard in GitLab UI"
fi
echo ""
