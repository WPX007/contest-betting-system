@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Test and Sync to GitHub

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

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if not defined CURRENT_BRANCH (
  echo ERROR: Could not determine the current Git branch.
  goto :failed
)

echo.
echo [1/3] Running tests...
call npm test
if errorlevel 1 (
  echo ERROR: Tests failed. Nothing was committed or pushed.
  goto :failed
)

echo.
echo [2/3] Running code checks...
call npm run lint
if errorlevel 1 (
  echo ERROR: Lint failed. Nothing was committed or pushed.
  goto :failed
)

echo.
echo [3/3] Building production application...
call npm run build
if errorlevel 1 (
  echo ERROR: Build failed. Nothing was committed or pushed.
  goto :failed
)

set "HAS_CHANGES="
for /f "delims=" %%S in ('git status --porcelain') do set "HAS_CHANGES=1"
if not defined HAS_CHANGES (
  echo.
  echo No local changes to synchronize.
  goto :success
)

echo.
echo Changes ready to synchronize:
git status --short
echo.

set "COMMIT_MESSAGE=%~1"
if not defined COMMIT_MESSAGE set /p "COMMIT_MESSAGE=Commit message (press Enter to use a timestamp): "
if not defined COMMIT_MESSAGE set "COMMIT_MESSAGE=sync: %date% %time:~0,8%"

git add -A
if errorlevel 1 goto :failed

git diff --cached --check -- . ":(exclude)src/generated/prisma/**"
if errorlevel 1 (
  echo ERROR: Git found whitespace errors. Nothing was committed.
  goto :failed
)

git var GIT_AUTHOR_IDENT >nul 2>nul
if errorlevel 1 (
  where gh >nul 2>nul
  if errorlevel 1 (
    echo ERROR: Git identity is missing and GitHub CLI was not found.
    echo Sign in with GitHub CLI or configure your own Git identity.
    goto :failed
  )
  for /f "delims=" %%I in ('gh api user --jq .login 2^>nul') do set "GITHUB_LOGIN=%%I"
  for /f "delims=" %%I in ('gh api user --jq .id 2^>nul') do set "GITHUB_ID=%%I"
  if not defined GITHUB_LOGIN (
    echo ERROR: Could not read the signed-in GitHub account.
    goto :failed
  )
  call set "GIT_AUTHOR_NAME=%%GITHUB_LOGIN%%"
  call set "GIT_AUTHOR_EMAIL=%%GITHUB_ID%%+%%GITHUB_LOGIN%%@users.noreply.github.com"
  call set "GIT_COMMITTER_NAME=%%GITHUB_LOGIN%%"
  call set "GIT_COMMITTER_EMAIL=%%GITHUB_ID%%+%%GITHUB_LOGIN%%@users.noreply.github.com"
)

git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
  echo ERROR: Commit failed. Nothing was pushed.
  goto :failed
)

echo.
echo Pulling the latest "%CURRENT_BRANCH%" changes...
git pull --rebase origin "%CURRENT_BRANCH%"
if errorlevel 1 (
  echo ERROR: Pull/rebase failed. Resolve the conflict, then run this file again.
  goto :failed
)

echo.
echo Pushing "%CURRENT_BRANCH%" to GitHub...
git push -u origin "%CURRENT_BRANCH%"
if errorlevel 1 (
  echo ERROR: Push failed. The local commit is safe and can be pushed later.
  goto :failed
)

:success
echo.
echo SUCCESS: Local code and GitHub are synchronized.
pause
exit /b 0

:failed
echo.
echo Synchronization stopped. Review the error above.
pause
exit /b 1
