@echo off
REM Visual debugging test runner for Windows
REM This script runs Playwright tests with a visible browser and screenshots

echo.
echo ========================================
echo Playlist Selector Visual Testing
echo ========================================
echo.

REM Check if E2E stack is running
echo Checking if E2E test stack is running...
docker ps | findstr "web-test" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo E2E test stack not running. Starting it now...
    echo Run: run.bat test stack:up
    echo.
    cd /d %~dp0\..
    call run.bat test stack:up
    echo.
    echo Waiting for services to be ready...
    timeout /t 10 /nobreak >nul
)

echo.
echo E2E stack is ready!
echo.
echo Choose testing mode:
echo.
echo 1. Screenshot mode - step-by-step images (RECOMMENDED)
echo 2. Run all E2E tests - full test suite
echo 3. Exit
echo.
echo Note: Headed/UI modes require Playwright on host (not yet configured)
echo.
set /p choice="Enter choice (1-3): "

cd /d %~dp0\..

if "%choice%"=="1" (
    echo.
    echo Running VISUAL tests with screenshots...
    echo.
    docker compose -f docker\docker-compose.yml --profile test run --rm playwright-runner pnpm exec playwright test playlistSelector.visual --project=chromium
) else if "%choice%"=="2" (
    echo.
    echo Running ALL E2E tests...
    echo.
    docker compose -f docker\docker-compose.yml --profile test run --rm playwright-runner
) else if "%choice%"=="3" (
    echo.
    echo Exiting...
    exit /b 0
) else (
    echo Invalid choice. Running visual tests by default...
    docker compose -f docker\docker-compose.yml --profile test run --rm playwright-runner pnpm exec playwright test playlistSelector.visual --project=chromium
)

echo.
echo ========================================
echo Test complete!
echo ========================================
echo.
echo Screenshots saved to: test-results\visual-*.png
echo HTML report: playwright-report\index.html
echo.
echo To view the HTML report, run: pnpm exec playwright show-report
echo.
pause
