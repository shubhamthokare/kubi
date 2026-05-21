#!/bin/bash

# Kubi AI - Monorepo Push, Merge to Main & Clean Up Script
# Pushes changes, merges into main, pushes main, and deletes other branches.

set -e

echo "=================================================="
echo "🚀 Kubi AI - GitLab Monorepo Sync & Merge Script"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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
STARTING_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -z "$STARTING_BRANCH" ]; then
    STARTING_BRANCH="main"
fi

echo -e "Starting Branch: ${YELLOW}${STARTING_BRANCH}${NC}"
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

if [ "$STARTING_BRANCH" = "main" ]; then
    echo -e "${BLUE}🔄 Pulling remote changes for 'main'...${NC}"
    git pull origin main --rebase || true
    echo ""
    echo -e "${BLUE}📤 Pushing directly to origin/main...${NC}"
    git push origin main
    echo ""
else
    # 1. Pull and push to the starting branch first to save progress
    echo -e "${BLUE}🔄 Pulling remote changes for '${STARTING_BRANCH}'...${NC}"
    git pull origin "${STARTING_BRANCH}" --allow-unrelated-histories -s recursive -X ours --no-edit || true
    echo ""
    echo -e "${BLUE}📤 Pushing to origin/${STARTING_BRANCH}...${NC}"
    git push -u origin "${STARTING_BRANCH}"
    echo ""

    # 2. Checkout main and pull the latest changes
    echo -e "${BLUE}🔄 Switching to 'main'...${NC}"
    git checkout main
    echo ""
    echo -e "${BLUE}🔄 Pulling latest changes on 'main'...${NC}"
    git pull origin main --rebase || true
    echo ""

    # 3. Merge starting branch into main
    echo -e "${BLUE}🔀 Merging '${STARTING_BRANCH}' into 'main'...${NC}"
    git merge "${STARTING_BRANCH}" --no-edit
    echo ""

    # 4. Push main to GitLab
    echo -e "${BLUE}📤 Pushing 'main' to origin/main...${NC}"
    git push origin main
    echo ""

    # 5. Clean up the other branch locally and remotely
    echo -e "${BLUE}🧹 Cleaning up feature branch '${STARTING_BRANCH}'...${NC}"
    
    echo -e "Deleting local branch '${STARTING_BRANCH}'..."
    git branch -D "${STARTING_BRANCH}"
    
    echo -e "Deleting remote branch 'origin/${STARTING_BRANCH}' on GitLab..."
    git push origin --delete "${STARTING_BRANCH}" || echo -e "${RED}⚠️ Could not delete remote branch (might not exist on remote or already deleted)${NC}"
    echo ""
fi

echo "=================================================="
echo -e "${GREEN}🎉 Successfully merged to main, pushed to GitLab, and cleaned up other branches!${NC}"
echo "=================================================="
echo ""
echo "Repository Link:"
echo "  Monorepo: https://gitlab.com/kubi-agent/kubi"
echo ""
