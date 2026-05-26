#!/bin/bash
# Merge feature branch into main and push to GitLab
# This script assumes you are in the repository root and that the feature branch
# you want to merge is 'feature/gitguardian-prepush'. Adjust the branch name as needed.

set -e

# Navigate to repository root (script located in scripts/ folder)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ensure we are on the latest main
git checkout main

git pull origin main

# Merge the feature branch
git merge --no-ff feature/gitguardian-prepush

# Push the updated main to GitLab
git push origin main
