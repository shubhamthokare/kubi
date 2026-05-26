#!/bin/bash
# Merge all local branches into main and push to remote (GitLab)
# Excludes the main branch itself.

set -e

# Ensure we are at repo root (script placed in scripts/ folder)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Checkout main and pull latest
git checkout main
git pull origin main

# Get list of local branches excluding main
branches=$(git branch --format="%(refname:short)" | grep -v "^main$")

for branch in $branches; do
  echo "Merging branch $branch into main..."
  git merge --no-ff "$branch" -m "Merge branch '$branch' into main"
done

# Push the updated main to GitLab
git push origin main
