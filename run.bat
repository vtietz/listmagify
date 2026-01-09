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
  rem Install as root inside the container to avoid Windows bind-mount EACCES on rename/mkdir
  rem Rebuild better-sqlite3 for Linux after install (host may have Windows binaries)
  docker compose -f docker\docker-compose.yml run --rm --user root web sh -c "pnpm install %2 %3 %4 %5 %6 %7 %8 %9 && pnpm rebuild better-sqlite3"
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
if "%1"=="prod-build" (
  rem Build production image
  if exist "docker\docker-compose.prod.override.yml" (
    echo Building production image with override...
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml build %2 %3 %4 %5 %6 %7 %8 %9
  ) else (
    docker compose -f docker\docker-compose.prod.yml build %2 %3 %4 %5 %6 %7 %8 %9
  )
  goto :eof
)
if "%1"=="prod-up" (
  rem Check for override file
  if exist "docker\docker-compose.prod.override.yml" (
    echo Using production override file...
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml up -d %2 %3 %4 %5 %6 %7 %8 %9
  ) else (
    docker compose -f docker\docker-compose.prod.yml up -d %2 %3 %4 %5 %6 %7 %8 %9
  )
  goto :eof
)
if "%1"=="prod-down" (
  rem Check for override file
  if exist "docker\docker-compose.prod.override.yml" (
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml down %2 %3 %4 %5 %6 %7 %8 %9
  ) else (
    docker compose -f docker\docker-compose.prod.yml down %2 %3 %4 %5 %6 %7 %8 %9
  )
  goto :eof
)
if "%1"=="prod-update" (
  echo Pulling latest code...
  git pull
  echo.
  echo Rebuilding production image...
  if exist "docker\docker-compose.prod.override.yml" (
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml build --no-cache
  ) else (
    docker compose -f docker\docker-compose.prod.yml build --no-cache
  )
  echo.
  echo Restarting production deployment...
  if exist "docker\docker-compose.prod.override.yml" (
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml up -d
  ) else (
    docker compose -f docker\docker-compose.prod.yml up -d
  )
  echo.
  echo Production update complete. Use 'run.bat compose logs -f' to view logs.
  goto :eof
)
if "%1"=="prod-clean" (
  echo Cleaning up Docker artifacts for this app...
  echo.
  
  rem Stop and remove production containers
  echo ^>^> Stopping and removing production containers...
  if exist "docker\docker-compose.prod.override.yml" (
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml down 2>nul
  ) else (
    docker compose -f docker\docker-compose.prod.yml down 2>nul
  )
  docker compose -f docker\docker-compose.yml down 2>nul
  
  rem Remove images
  echo ^>^> Removing Docker images ^(sbs-web:prod, sbs-web:dev^)...
  docker rmi sbs-web:prod 2>nul || echo   ^(no sbs-web:prod image found^)
  docker rmi sbs-web:dev 2>nul || echo   ^(no sbs-web:dev image found^)
  
  rem Remove build cache
  echo ^>^> Pruning build cache...
  docker builder prune -f 2>nul
  
  rem Handle volumes if --volumes flag is present
  if /I "%2"=="--volumes" (
    echo ^>^> Removing volumes...
    if exist "docker\docker-compose.prod.override.yml" (
      docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml down -v 2>nul
    ) else (
      docker compose -f docker\docker-compose.prod.yml down -v 2>nul
    )
    docker compose -f docker\docker-compose.yml down -v 2>nul
  )
  
  echo.
  echo Cleanup complete!
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
  ) else if /I "%2"=="e2e" (
    rem Run E2E tests in proper Docker environment with mock server
    docker compose -f docker\docker-compose.yml --profile test up -d web-test spotify-mock
    docker compose -f docker\docker-compose.yml --profile test run --rm playwright-runner
    goto :eof
  ) else if /I "%2"=="e2e:ui" (
    echo ERROR: E2E UI mode must run on host. Install Playwright locally: pnpm add -D @playwright/test
    goto :eof
  ) else if /I "%2"=="stack:up" (
    docker compose -f docker\docker-compose.yml --profile test up -d web-test spotify-mock %3 %4 %5 %6 %7 %8 %9
  ) else if /I "%2"=="stack:down" (
    docker compose -f docker\docker-compose.yml --profile test down %3 %4 %5 %6 %7 %8 %9
  ) else if /I "%2"=="stack:logs" (
    docker compose -f docker\docker-compose.yml --profile test logs -f %3 %4 %5 %6 %7 %8 %9
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
echo   run.bat up/down         - Start/stop dev services
 echo   run.bat install         - Install dependencies in the container
 echo   run.bat build           - Create a production build
 echo   run.bat start-prod      - Start the production server (dev compose)
 echo   run.bat prod-build      - Build production image (use --no-cache to force rebuild)
 echo   run.bat prod-up         - Start production deployment (prod compose)
 echo   run.bat prod-down       - Stop production deploymentecho   run.bat prod-update     - Pull latest code, rebuild, and restart production echo   run.bat prod-clean      - Clean up Docker images, containers, and build cache (use --volumes to also remove volumes)echo   run.bat dev ^<cmd^>      - Execute a command in a temporary dev container (e.g., run pnpm lint)
echo   run.bat prod ^<cmd^>     - Execute a command in a temporary prod container
echo   run.bat test [args]     - Run tests (default: unit, args: --watch, ui, e2e, e2e:ui, e2e:ci)
echo   run.bat test stack:up   - Start E2E test stack (web-test + spotify-mock)
echo   run.bat test stack:down - Stop E2E test stack
echo   run.bat test stack:logs - View E2E test stack logs
echo.
echo Utility Commands:
echo   run.bat compose ^<cmd^>  - Run a raw docker compose command
echo   run.bat init-env        - Create .env from .env.example
echo.
goto :end

:end
endlocal