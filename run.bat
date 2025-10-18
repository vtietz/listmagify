@echo off
setlocal
cd /d %~dp0

REM Show help if no parameters
if "%1"=="" goto :show_help

REM Load .env file
if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    set "%%A=%%B"
  )
)

REM Set default PORT if not defined
if not defined PORT set PORT=3000

REM --- Primary Commands ---

if "%1"=="dev" (
  docker compose -f docker\docker-compose.yml run --rm web %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="prod" (
  docker compose -f docker\docker-compose.yml run --rm prod %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="up" (
  docker compose -f docker\docker-compose.yml up web %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="down" (
  docker compose -f docker\docker-compose.yml down %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="install" (
  docker compose -f docker\docker-compose.yml run --rm web pnpm install %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="build" (
  docker compose -f docker\docker-compose.yml build --build-arg NEXTAUTH_URL=%NEXTAUTH_URL% --build-arg NEXTAUTH_SECRET=%NEXTAUTH_SECRET% --build-arg SPOTIFY_CLIENT_ID=%SPOTIFY_CLIENT_ID% --build-arg SPOTIFY_CLIENT_SECRET=%SPOTIFY_CLIENT_SECRET% prod %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="start-prod" (
  docker compose -f docker\docker-compose.yml up prod %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="test" (
  rem Unit tests by default (non-watch). Use: test ui | test -w | test --watch
  if /I "%2"=="ui" (
    docker compose -f docker\docker-compose.yml run --rm web pnpm test:ui %3 %4 %5 %6 %7 %8 %9
  ) else if /I "%2"=="-w" (
    docker compose -f docker\docker-compose.yml run --rm web pnpm test:unit:watch %3 %4 %5 %6 %7 %8 %9
  ) else if /I "%2"=="--watch" (
    docker compose -f docker\docker-compose.yml run --rm web pnpm test:unit:watch %3 %4 %5 %6 %7 %8 %9
  ) else (
    docker compose -f docker\docker-compose.yml run --rm web pnpm test:unit %2 %3 %4 %5 %6 %7 %8 %9
  )
  goto :eof
)

REM --- Utility Commands ---

if "%1"=="compose" (
  docker compose -f docker\docker-compose.yml %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="init-env" (
  if not exist ".env" (
    copy /Y ".env.example" ".env" >nul
    echo Created .env from .env.example. Fill in real secrets (NEXTAUTH_SECRET, SPOTIFY_*).
  ) else (
    echo .env already exists. Edit it to set your secrets.
  )
  goto :eof
)

:show_help
echo Usage:
echo.
echo   run.bat up/down         - Start/stop all services
echo   run.bat install         - Install dependencies in the container
echo   run.bat build           - Create a production build
echo   run.bat start-prod      - Start the production server
echo   run.bat dev ^<cmd^>      - Execute a command in a temporary dev container (e.g., run pnpm lint)
echo   run.bat prod ^<cmd^>     - Execute a command in a temporary prod container
echo   run.bat test [args]     - Run tests (default: unit, args: --watch, ui)
echo.
echo Utility Commands:
echo   run.bat compose ^<cmd^>  - Run a raw docker compose command
echo   run.bat init-env        - Create .env from .env.example
echo.
goto :end

:end
endlocal