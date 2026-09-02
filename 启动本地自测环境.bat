@echo off
setlocal EnableExtensions
title Contest Betting - LOCAL TEST ENVIRONMENT

cd /d "%~dp0"
set "APP_PORT=3109"
set "TEST_DB=local-test.db"
set "DATABASE_URL=file:./%TEST_DB%"
set "NEXT_DIST_DIR=.next-test"
set "NEXT_PUBLIC_APP_ENV=local-test"
set "SESSION_COOKIE_SECURE=false"

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found.
  goto :failed
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do set "PORT_PID=%%P"
if defined PORT_PID (
  echo The local test server is already running on port %APP_PORT%.
  start "" "http://127.0.0.1:%APP_PORT%"
  pause
  exit /b 0
)

if not exist "dev.db" (
  echo ERROR: Official local database dev.db was not found.
  goto :failed
)

if /i "%~1"=="--reset" goto :reset_database
if not exist "%TEST_DB%" goto :reset_database

echo.
choice /c KR /n /m "Keep previous test data [K], or reset it from dev.db [R]? "
if errorlevel 2 goto :reset_database
goto :database_ready

:reset_database
echo.
echo Creating a safe snapshot of dev.db for local testing...
node prepare-local-test-db.mjs "dev.db" "%TEST_DB%"
if errorlevel 1 goto :failed

:database_ready
if not exist "node_modules" (
  echo.
  echo [1/3] Installing dependencies...
  call npm install
  if errorlevel 1 goto :failed
) else (
  echo.
  echo [1/3] Dependencies are ready.
)

echo [2/3] Generating database client...
call npm run db:generate
if errorlevel 1 goto :failed

echo [3/3] Applying migrations to the TEST database only...
call npx prisma migrate deploy
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo LOCAL TEST ENVIRONMENT: http://127.0.0.1:%APP_PORT%
echo Database: %TEST_DB%
echo Official dev.db will not be modified.
echo Keep this window open. Press Ctrl+C to stop testing.
echo ============================================================
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start "" http://127.0.0.1:%APP_PORT%"
call npm run dev -- --hostname 127.0.0.1 --port %APP_PORT%
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo ERROR: Local test environment failed to start.
pause
exit /b 1
