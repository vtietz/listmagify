@echo off
setlocal
cd /d %~dp0

REM Show help if no parameters
if "%1"=="" goto :show_help

REM Load PORT from .env if not set (defaults to 3000)
if not defined PORT (
  if exist ".env" (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
      if /I "%%A"=="PORT" set PORT=%%B
    )
  )
)
if not defined PORT set PORT=3000

REM Usage: run.bat compose build|up|down
REM        run.bat exec pnpm test -- --watch
REM        run.bat run pnpm lint

if "%1"=="compose" (
  docker.exe compose -f docker\docker-compose.yml %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="exec" (
  docker.exe compose -f docker\docker-compose.yml run --rm web %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="run" (
  docker.exe run --rm -v %cd%:/usr/src/app -w /usr/src/app -p %PORT%:%PORT% sbs-web:dev %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="up" (
  docker.exe compose -f docker\docker-compose.yml up %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="down" (
  docker.exe compose -f docker\docker-compose.yml down %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="install-host" (
  docker.exe run --rm --user 0 -v %cd%:/usr/src/app -w /usr/src/app sbs-web:dev pnpm install %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="cmd" (
  docker.exe run --rm -v %cd%:/usr/src/app -w /usr/src/app sbs-web:dev sh -lc "%*"
  goto :eof
)
if "%1"=="install" (
  docker.exe compose -f docker\docker-compose.yml run --rm web pnpm install %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="start" (
  docker.exe compose -f docker\docker-compose.yml up %2 %3 %4 %5 %6 %7 %8 %9
  goto :eof
)
if "%1"=="test" (
  docker.exe compose -f docker\docker-compose.yml run --rm web pnpm test %2 %3 %4 %5 %6 %7 %8 %9
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
echo   run.bat compose ^<cmd^>       - Run docker compose commands
echo   run.bat exec ^<cmd^>          - Execute command in container
echo   run.bat install               - Install dependencies
echo   run.bat start                 - Start dev server
echo   run.bat test [-- ^<opts^>]    - Run tests
echo   run.bat run ^<cmd^>           - Run command in new container
echo   run.bat install-host          - Install deps as host user
echo   run.bat init-env              - Create .env from example
echo   run.bat up/down               - Start/stop containers
goto :end

:end
endlocal