@echo off
setlocal EnableExtensions
title Contest Betting MVP

cd /d "%~dp0"
set "APP_PORT=3108"

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
)

if not exist "node_modules" (
  echo [1/4] Installing dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

echo [2/4] Generating database client...
call npm run db:generate
if errorlevel 1 goto :failed

echo [3/4] Applying database migrations...
call npx prisma migrate deploy
if errorlevel 1 goto :failed

echo [4/4] Loading demo data...
call npm run db:seed
if errorlevel 1 goto :failed

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do set "PORT_PID=%%P"
if defined PORT_PID (
  echo.
  echo Port %APP_PORT% is already in use by process %PORT_PID%.
  echo Opening the existing local page.
  start "" "http://localhost:%APP_PORT%"
  pause
  exit /b 0
)

echo.
echo Starting the app at http://localhost:%APP_PORT%
echo Keep this window open. Press Ctrl+C to stop the app.
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul & start "" http://localhost:%APP_PORT%"
call npm run dev -- --port %APP_PORT%
if errorlevel 1 goto :failed
goto :end

:failed
echo.
echo ERROR: Startup failed. Review the messages above.
pause
exit /b 1

:end
endlocal
