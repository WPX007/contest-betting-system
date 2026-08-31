@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Pull Updates from GitHub

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git was not found.
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found.
  goto :failed
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo ERROR: This folder is not a Git repository.
  goto :failed
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git remote "origin" is not configured.
  goto :failed
)

set "HAS_CHANGES="
for /f "delims=" %%S in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES (
  echo.
  echo ERROR: Local changes were found. Pull was stopped to protect your work.
  echo Run "Test and Sync to GitHub" first, or commit/stash the changes manually.
  echo.
  git status --short
  goto :failed
)

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if not defined CURRENT_BRANCH (
  echo ERROR: Could not determine the current Git branch.
  goto :failed
)

echo.
echo [1/7] Fetching GitHub updates...
git fetch origin
if errorlevel 1 goto :failed

echo.
echo [2/7] Updating branch "%CURRENT_BRANCH%"...
git pull --ff-only origin "%CURRENT_BRANCH%"
if errorlevel 1 (
  echo ERROR: The branches have diverged. Nothing was overwritten.
  goto :failed
)

echo.
echo [3/7] Installing exact dependencies...
call npm ci
if errorlevel 1 goto :failed

echo.
echo [4/7] Generating database client...
call npm run db:generate
if errorlevel 1 goto :failed

echo.
echo [5/7] Running tests and code checks...
call npm test
if errorlevel 1 goto :failed
call npm run lint
if errorlevel 1 goto :failed

echo.
echo [6/7] Building production application...
call npm run build
if errorlevel 1 goto :failed

echo.
echo [7/7] Applying database migrations...
call npx prisma migrate deploy
if errorlevel 1 goto :failed

echo.
echo SUCCESS: Local project now matches GitHub branch "%CURRENT_BRANCH%".
echo Restart the local or LAN server to use the new version.
pause
exit /b 0

:failed
echo.
echo Update stopped. Existing local data was not replaced.
pause
exit /b 1
