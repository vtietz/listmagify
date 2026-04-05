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
if "%1"=="exec" (
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
if "%1"=="preview" (
  rem Backward-compatible alias
  call "%~f0" preview-up %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="preview-up" (
  rem Build production image using the same compose setup as production
  if exist "docker\docker-compose.prod.override.yml" (
    echo Building production image for local preview with override...
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml build %2 %3 %4 %5 %6 %7 %8 %9
  ) else (
    echo Building production image for local preview...
    docker compose -f docker\docker-compose.prod.yml build %2 %3 %4 %5 %6 %7 %8 %9
  )

  rem Run the built production image on a local port for preview
  if defined IMAGE (
    set "PREVIEW_IMAGE=%IMAGE%"
  ) else (
    set "PREVIEW_IMAGE=ghcr.io/vtietz/listmagify:latest"
  )
  docker rm -f spotify-preview >nul 2>nul
  echo Starting local preview on http://127.0.0.1:%PORT%
  docker run -d --rm --name spotify-preview --env-file .env -e NODE_ENV=production -p %PORT%:3000 -v "%cd%\data:/usr/src/app/data" %PREVIEW_IMAGE%
  echo Preview started in background. Use 'run.bat preview-down' to stop.
  goto :eof
)
if "%1"=="preview-down" (
  docker rm -f spotify-preview >nul 2>nul
  if %errorlevel%==0 (
    echo Stopped local preview container 'spotify-preview'.
  ) else (
    echo No running preview container found.
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
if "%1"=="prod-logs" (
  rem View production logs
  if exist "docker\docker-compose.prod.override.yml" (
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml logs %2 %3 %4 %5 %6 %7 %8 %9
  ) else (
    docker compose -f docker\docker-compose.prod.yml logs %2 %3 %4 %5 %6 %7 %8 %9
  )
  goto :eof
)
if "%1"=="prod-pull" (
  rem Pull pre-built production image from registry
  if exist "docker\docker-compose.prod.override.yml" (
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml pull %2 %3 %4 %5 %6 %7 %8 %9
  ) else (
    docker compose -f docker\docker-compose.prod.yml pull %2 %3 %4 %5 %6 %7 %8 %9
  )
  goto :eof
)
if "%1"=="prod-push" (
  rem Push production image to registry
  if exist "docker\docker-compose.prod.override.yml" (
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml push %2 %3 %4 %5 %6 %7 %8 %9
  ) else (
    docker compose -f docker\docker-compose.prod.yml push %2 %3 %4 %5 %6 %7 %8 %9
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
  echo Pulling latest production image...
  if exist "docker\docker-compose.prod.override.yml" (
    docker compose -f docker\docker-compose.prod.yml -f docker\docker-compose.prod.override.yml pull
  ) else (
    docker compose -f docker\docker-compose.prod.yml pull
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
if "%1"=="quality" (
  set "QUALITY_MODE=changed"
  if /I "%2"=="--all" (
    set "QUALITY_MODE=all"
  ) else if not "%2"=="" (
    echo Unknown argument(s) for quality: %2 %3 %4 %5 %6 %7 %8 %9
    echo Usage: run.bat quality [--all]
    goto :eof
  )
  docker compose -f docker\docker-compose.yml run --rm -e QUALITY_MODE=%QUALITY_MODE% web sh -lc "set +e; MODE=\${QUALITY_MODE:-changed}; if command -v git ^>/dev/null 2^>^&1 ^&^& git rev-parse --is-inside-work-tree ^>/dev/null 2^>^&1; then if [ \"\$MODE\" = 'all' ]; then TARGET_FILES=\$(git ls-files '*.ts' '*.tsx' '*.js' '*.jsx'); else TARGET_FILES=\$({ git diff --name-only --diff-filter=ACMR; git diff --name-only --cached --diff-filter=ACMR; git ls-files --others --exclude-standard; } ^| sed '/^$/d' ^| grep -E '\\.(ts^|tsx^|js^|jsx)\$' ^| sort -u ^| while IFS= read -r file; do [ -f \"\$file\" ] ^&^& printf '%s\\n' \"\$file\"; done); fi; else echo '[quality] git not found in container, using find fallback'; TARGET_FILES=\$(find app components hooks lib tests types scripts features shared widgets -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) 2^>/dev/null); fi; TARGET_COUNT=\$(printf '%s\\n' \"\$TARGET_FILES\" ^| sed '/^$/d' ^| wc -l); if [ \"\$MODE\" = 'changed' ] ^&^& [ \"\$TARGET_COUNT\" -eq 0 ]; then echo '[quality] Mode: changed files (default)'; echo '[quality] No changed source files detected.'; exit 0; fi; if [ \"\$MODE\" = 'all' ]; then echo '[quality] Mode: all files (--all)'; pnpm typecheck; TYPECHECK_EXIT=\$?; else echo '[quality] Mode: changed files (default)'; echo '[quality] Skipping full typecheck in changed-files mode. Run ./run.sh quality --all before finishing.'; TYPECHECK_EXIT=0; fi; if [ \"\$TARGET_COUNT\" -gt 0 ]; then printf '%s\\n' \"\$TARGET_FILES\" ^| sed '/^$/d' ^| xargs -r pnpm exec eslint; LINT_EXIT=\$?; else LINT_EXIT=0; fi; echo ''; echo '[quality] Code metrics'; FILES=\$TARGET_COUNT; if [ \"\$FILES\" -gt 0 ]; then LOC=\$(printf '%s\\n' \"\$TARGET_FILES\" ^| sed '/^$/d' ^| xargs -r wc -l ^| tail -n1 ^| awk '{print \$1}'); else LOC=0; fi; echo \"[quality] Source files: \$FILES\"; echo \"[quality] Total LOC (ts/js): \$LOC\"; echo ''; echo '[quality] Complexity check (cyclomatic complexity ^> 12)'; if [ \"\$TARGET_COUNT\" -gt 0 ]; then printf '%s\\n' \"\$TARGET_FILES\" ^| sed '/^$/d' ^| xargs -r pnpm exec eslint --rule 'complexity: [warn, 12]' --format stylish ^|^| true; fi; echo ''; echo \"[quality] typecheck exit code: \$TYPECHECK_EXIT\"; echo \"[quality] lint exit code: \$LINT_EXIT\"; if [ \$TYPECHECK_EXIT -ne 0 ] ^|^| [ \$LINT_EXIT -ne 0 ]; then exit 1; fi"
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
echo   run.bat up                - Start dev server (docker compose up)
echo   run.bat down              - Stop dev server (docker compose down)
echo   run.bat install           - Install dependencies
echo   run.bat test [args]       - Run tests
echo   run.bat quality [--all]   - Run quality (changed files default, --all full gate)
echo   run.bat exec ^<cmd^>       - Run command in web container
echo   run.bat compose ^<cmd^>    - Run docker compose command
echo   run.bat init-env          - Create .env from .env.example
echo   run.bat preview [args]    - Alias for preview-up
echo   run.bat preview-up [args] - Build production image and start local preview
echo   run.bat preview-down      - Stop local preview container
echo   run.bat prod-build [args] - Build production image
echo   run.bat prod-up [args]    - Start production deployment
echo   run.bat prod-down [args]  - Stop production deployment
echo   run.bat prod-logs [args]  - View production logs
echo   run.bat prod-pull [args]  - Pull pre-built production image
echo   run.bat prod-push [args]  - Push production image to registry
echo   run.bat prod-update       - Pull latest code/image and restart production
echo   run.bat prod-clean        - Clean Docker artifacts (use --volumes too)
echo.
echo Backward-compatible aliases:
echo   run.bat dev ^<cmd^>       - Same as exec
echo   run.bat prod ^<cmd^>      - Run command in prod container
echo   run.bat build             - Legacy prod image build command
echo   run.bat start-prod        - Legacy prod service start command
echo.
goto :end

:end
endlocal