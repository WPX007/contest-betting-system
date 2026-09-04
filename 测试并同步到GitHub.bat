@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Test and Sync to GitHub

cd /d "%~dp0"
call :load_local_identity

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
  call :configure_github_identity
  if errorlevel 1 (
    echo.
    echo SOLUTION:
    echo   1. Double-click: Configure Git Commit Identity BAT
    echo   2. Or run: gh auth login
    echo   3. Or run:
    echo      git config --global user.name "Your GitHub username"
    echo      git config --global user.email "Your GitHub email"
    echo   4. Then run this BAT file again.
    goto :failed
  )
)

git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
  echo ERROR: Commit failed. Nothing was pushed.
  echo Your changes are still safely staged and have not been lost.
  echo.
  echo SOLUTION:
  echo   1. Check the Git error shown immediately above.
  echo   2. If Git reports "Author identity unknown", double-click the
  echo      Configure Git Commit Identity BAT file.
  echo   3. If the commit message contains special characters, run this BAT
  echo      again and use a simple commit message.
  echo   4. After fixing the issue, run this BAT file again.
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
echo Current Git state:
git status --short --branch
echo No staged or unstaged source changes were deleted.
pause
exit /b 1

:load_local_identity
if not exist ".git-identity.local" exit /b 0
for /f "usebackq tokens=1,* delims==" %%A in (".git-identity.local") do set "%%A=%%B"
if defined GIT_AUTHOR_NAME set "GIT_COMMITTER_NAME=%GIT_AUTHOR_NAME%"
if defined GIT_AUTHOR_EMAIL set "GIT_COMMITTER_EMAIL=%GIT_AUTHOR_EMAIL%"
exit /b 0

:configure_github_identity
where gh >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git identity is missing and GitHub CLI was not found.
  exit /b 1
)
set "GITHUB_LOGIN="
set "GITHUB_ID="
for /f "delims=" %%I in ('gh api user --jq .login 2^>nul') do set "GITHUB_LOGIN=%%I"
for /f "delims=" %%I in ('gh api user --jq .id 2^>nul') do set "GITHUB_ID=%%I"
if not defined GITHUB_LOGIN (
  echo ERROR: Could not read the signed-in GitHub account.
  exit /b 1
)
if not defined GITHUB_ID (
  echo ERROR: Could not read the GitHub account ID.
  exit /b 1
)
set "GIT_AUTHOR_NAME=%GITHUB_LOGIN%"
set "GIT_AUTHOR_EMAIL=%GITHUB_ID%+%GITHUB_LOGIN%@users.noreply.github.com"
set "GIT_COMMITTER_NAME=%GITHUB_LOGIN%"
set "GIT_COMMITTER_EMAIL=%GITHUB_ID%+%GITHUB_LOGIN%@users.noreply.github.com"
git var GIT_AUTHOR_IDENT >nul 2>nul
if errorlevel 1 (
  echo ERROR: Could not create a temporary Git identity.
  exit /b 1
)
echo Using temporary Git identity: %GITHUB_LOGIN%
exit /b 0
