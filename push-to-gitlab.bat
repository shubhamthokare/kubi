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

REM Detect the current active branch
set CURRENT_BRANCH=
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set CURRENT_BRANCH=%%i
if "!CURRENT_BRANCH!"=="" (
    for /f "tokens=*" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set CURRENT_BRANCH=%%i
)
if "!CURRENT_BRANCH!"=="" (
    set CURRENT_BRANCH=main
)

echo Active Branch: !CURRENT_BRANCH!
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
git commit -m "!COMMIT_MSG!" || true

echo.
echo Pulling remote changes for branch '!CURRENT_BRANCH!'...
git pull origin !CURRENT_BRANCH! --allow-unrelated-histories -s recursive -X ours --no-edit || true

echo.
echo Pushing to origin/!CURRENT_BRANCH!...
git push -u origin !CURRENT_BRANCH!

if errorlevel 1 (
    echo ERROR: GitLab push failed!
    pause
    exit /b 1
)

echo.
echo ==================================================
echo SUCCESS! All changes pushed to GitLab (!CURRENT_BRANCH!)
echo ==================================================
echo.
echo Repository Link:
echo   Monorepo: https://gitlab.com/kubi-agent/kubi
echo.
pause
