@echo off
REM Kubi AI - Monorepo Push to GitLab Script for Windows
REM Pushes the entire Kubi AI monorepo as a single repository to GitLab

setlocal enabledelayedexpansion

echo ==================================================
echo Kubi AI - GitLab Monorepo Push
echo ==================================================
echo.

REM Navigate to root directory
cd /d c:\Users\shubh\Downloads\repo\kubi

REM Initialize Git repository if not present
if not exist .git (
    echo Initializing Git repository...
    git init --initial-branch=main --object-format=sha1
    git remote add origin https://gitlab.com/kubi-agent/kubi.git
)

echo Checking status...
git status --short

echo.
echo Adding all changes...
git add .

echo Committing changes...
git commit -m "feat: consolidated monorepo codebase and instrumentation setup" || true

echo Pulling remote changes to reconcile histories...
git pull origin main --allow-unrelated-histories -s recursive -X ours --no-edit || true

echo Pushing to origin/main...
git push -u origin main

if errorlevel 1 (
    echo ERROR: GitLab push failed!
    pause
    exit /b 1
)

echo.
echo ==================================================
echo SUCCESS! All changes pushed to GitLab Monorepo
echo ==================================================
echo.
echo Repository Link:
echo   Monorepo: https://gitlab.com/kubi-agent/kubi
echo.
pause
