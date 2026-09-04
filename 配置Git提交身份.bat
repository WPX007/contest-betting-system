@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Configure Git Commit Identity

cd /d "%~dp0"

echo.
echo This identity is stored only on this computer.
echo It will not be uploaded to GitHub.
echo.
set /p "GIT_NAME=Git username: "
if not defined GIT_NAME (
  echo ERROR: Username cannot be empty.
  goto :failed
)

set /p "GIT_EMAIL=Git email: "
if not defined GIT_EMAIL (
  echo ERROR: Email cannot be empty.
  goto :failed
)

> ".git-identity.local" echo GIT_AUTHOR_NAME=%GIT_NAME%
>> ".git-identity.local" echo GIT_AUTHOR_EMAIL=%GIT_EMAIL%

set "GIT_AUTHOR_NAME=%GIT_NAME%"
set "GIT_AUTHOR_EMAIL=%GIT_EMAIL%"
set "GIT_COMMITTER_NAME=%GIT_NAME%"
set "GIT_COMMITTER_EMAIL=%GIT_EMAIL%"
git var GIT_AUTHOR_IDENT
if errorlevel 1 (
  echo ERROR: Git rejected this identity.
  goto :failed
)

echo.
echo SUCCESS: Git identity was saved for this project.
echo Future automated commits will use:
echo   %GIT_NAME% ^<%GIT_EMAIL%^>
pause
exit /b 0

:failed
echo.
echo Identity was not changed. Please run this file again.
pause
exit /b 1
