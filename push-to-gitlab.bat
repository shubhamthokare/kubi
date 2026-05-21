@echo off
REM Kubi AI - Monorepo Push, Merge to Main & Clean Up Script for Windows
REM Pushes changes, merges into main, pushes main, and deletes other branches.

setlocal enabledelayedexpansion

echo ==================================================
echo Kubi AI - GitLab Monorepo Sync, Merge & Clean Up
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

REM Detect the current active branch
set STARTING_BRANCH=
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set STARTING_BRANCH=%%i
if "!STARTING_BRANCH!"=="" (
    for /f "tokens=*" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set STARTING_BRANCH=%%i
)
if "!STARTING_BRANCH!"=="" (
    set STARTING_BRANCH=main
)

echo Starting Branch: !STARTING_BRANCH!
echo.

echo Checking status...
git status --short

echo.
echo Adding all changes...
git add .

REM Check for custom commit message as argument
set COMMIT_MSG=%~1
if "!COMMIT_MSG!"=="" (
    set COMMIT_MSG=refactor: resolve SonarQube quality smells, add log sanitization, migrate to timezone-aware datetimes, and fix pytest and node engine version in GitLab CI
)

echo Committing changes with message: "!COMMIT_MSG!"
git commit -m "!COMMIT_MSG!" || echo No changes to commit (working tree clean)

echo.
if "!STARTING_BRANCH!"=="main" (
    echo Pulling remote changes for 'main'...
    git pull origin main --rebase
    echo.
    echo Pushing directly to origin/main...
    git push origin main
) else (
    REM 1. Pull and push to starting branch
    echo Pulling remote changes for '!STARTING_BRANCH!'...
    git pull origin !STARTING_BRANCH! --allow-unrelated-histories -s recursive -X ours --no-edit || true
    echo.
    echo Pushing to origin/!STARTING_BRANCH!...
    git push -u origin !STARTING_BRANCH!
    echo.

    REM 2. Switch to main and pull latest
    echo Switching to 'main'...
    git checkout main
    echo.
    echo Pulling latest changes on 'main'...
    git pull origin main --rebase || true
    echo.

    REM 3. Merge starting branch
    echo Merging '!STARTING_BRANCH!' into 'main'...
    git merge !STARTING_BRANCH! --no-edit
    echo.

    REM 4. Push main to remote
    echo Pushing 'main' to origin/main...
    git push origin main
    echo.

    REM 5. Clean up local and remote branch
    echo Cleaning up feature branch '!STARTING_BRANCH!'...
    echo Deleting local branch '!STARTING_BRANCH!'...
    git branch -D !STARTING_BRANCH!
    
    echo Deleting remote branch 'origin/!STARTING_BRANCH!' on GitLab...
    git push origin --delete !STARTING_BRANCH! || echo Warning: Could not delete remote branch.
)

if errorlevel 1 (
    echo.
    echo ERROR: GitLab sync/merge process failed!
    pause
    exit /b 1
)

echo.
echo ==================================================
echo SUCCESS! Merged to main, pushed to GitLab, and cleaned up.
echo ==================================================
echo.
echo Repository Link:
echo   Monorepo: https://gitlab.com/kubi-agent/kubi
echo.
pause
