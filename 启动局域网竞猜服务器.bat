@echo off
setlocal EnableExtensions
title Contest Betting LAN Server

cd /d "%~dp0"
set "APP_PORT=3108"
set "FIREWALL_RULE=Contest Betting MVP 3108"

net session >nul 2>nul
if errorlevel 1 (
  echo Requesting administrator permission for the private-network firewall rule...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '--elevated' -Verb RunAs"
  exit /b
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found. Install Node.js 20 or newer.
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
  echo [1/6] Installing dependencies...
  call npm install
  if errorlevel 1 goto :failed
) else (
  echo [1/6] Dependencies are ready.
)

echo [2/6] Generating database client...
call npm run db:generate
if errorlevel 1 goto :failed

echo [3/6] Applying database migrations...
call npx prisma migrate deploy
if errorlevel 1 goto :failed

echo [4/6] Ensuring default data exists...
call npm run db:seed
if errorlevel 1 goto :failed

echo [5/6] Building the production server...
call npm run build
if errorlevel 1 goto :failed

echo [6/6] Allowing TCP port %APP_PORT% for the local subnet...
netsh advfirewall firewall show rule name="%FIREWALL_RULE%" >nul 2>nul
if errorlevel 1 (
  netsh advfirewall firewall add rule name="%FIREWALL_RULE%" dir=in action=allow protocol=TCP localport=%APP_PORT% profile=any remoteip=LocalSubnet >nul
  if errorlevel 1 goto :failed
) else (
  netsh advfirewall firewall set rule name="%FIREWALL_RULE%" new enable=yes profile=any remoteip=LocalSubnet protocol=TCP localport=%APP_PORT% >nul
  if errorlevel 1 goto :failed
)

set "LAN_IP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$c = Get-NetIPConfiguration ^| Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null } ^| Select-Object -First 1; if ($c) { $c.IPv4Address.IPAddress }"`) do set "LAN_IP=%%I"
if not defined LAN_IP set "LAN_IP=YOUR_LOCAL_IP"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do set "PORT_PID=%%P"
if defined PORT_PID (
  echo.
  echo Port %APP_PORT% is already used by process %PORT_PID%.
  echo Stop that process, then run this server script again.
  echo Current possible address: http://%LAN_IP%:%APP_PORT%
  pause
  exit /b 1
)

echo.
echo ============================================================
echo Local address:      http://127.0.0.1:%APP_PORT%
echo LAN server address: http://%LAN_IP%:%APP_PORT%
echo Other users must be on the same private network.
echo Keep this window open. Press Ctrl+C to stop the server.
echo ============================================================
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start "" http://127.0.0.1:%APP_PORT%"
call npm run start -- --hostname 0.0.0.0 --port %APP_PORT%
if errorlevel 1 goto :failed
goto :end

:failed
echo.
echo ERROR: LAN server startup failed. Review the messages above.
pause
exit /b 1

:end
endlocal
