#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  cat <<EOF
Usage: ./run.sh [command] [args...]

Commands:
  up              Start dev server (docker compose up)
  down            Stop dev server (docker compose down)
  install         Install dependencies
  test            Run tests
  exec            Run command in container (e.g., exec pnpm add package)
  compose         Run docker compose command (e.g., compose logs -f)
  prod-build      Build production image (use --no-cache to force rebuild)
  prod-up         Start production deployment
  prod-down       Stop production deployment
  prod-logs       View production logs (use -f to follow)
  prod-update     Pull latest code, rebuild, and restart (git pull + prod-build + prod-up)

Examples:
  ./run.sh up
  ./run.sh down
  ./run.sh install
  ./run.sh test
  ./run.sh test -- --watch
  ./run.sh exec pnpm add lodash
  ./run.sh compose logs -f
  ./run.sh prod-build --no-cache
  ./run.sh prod-logs -f
  ./run.sh prod-update
EOF
}

case "${1:-}" in
  up)
    shift
    docker compose --env-file .env -f docker/docker-compose.yml up web "$@"
    ;;
  down)
    shift
    docker compose --env-file .env -f docker/docker-compose.yml down "$@"
    ;;
  compose)
    shift
    docker compose --env-file .env -f docker/docker-compose.yml "$@"
    ;;
  exec)
    shift
    docker compose --env-file .env -f docker/docker-compose.yml run --rm web "$@"
    ;;
  run)
    shift
    docker run --rm \
      -v "$(pwd)":/usr/src/app \
      -w /usr/src/app \
      -p "${PORT:-3000}:${PORT:-3000}" \
      sbs-web:dev "$@"
    ;;
  install)
    shift
    # Rebuild better-sqlite3 for Linux after install (host may have different platform binaries)
    docker compose --env-file .env -f docker/docker-compose.yml run --rm web sh -c "pnpm install $* && pnpm rebuild better-sqlite3"
    ;;
  start)
    # Alias for 'up' (backwards compatibility)
    shift
    docker compose --env-file .env -f docker/docker-compose.yml up web "$@"
    ;;
  test)
    shift
    docker compose --env-file .env -f docker/docker-compose.yml run --rm web pnpm test "$@"
    ;;
  prod-build)
    shift
    # Build production image with current .env values
    if [ -f docker/docker-compose.prod.override.yml ]; then
      echo "Building production image with override..."
      docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml build "$@"
    else
      docker compose --env-file .env -f docker/docker-compose.prod.yml build "$@"
    fi
    ;;
  prod-up)
    shift
    # Check for override file
    if [ -f docker/docker-compose.prod.override.yml ]; then
      echo "Using production override file..."
      docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml up -d "$@"
    else
      docker compose --env-file .env -f docker/docker-compose.prod.yml up -d "$@"
    fi
    ;;
  prod-down)
    shift
    # Check for override file
    if [ -f docker/docker-compose.prod.override.yml ]; then
      docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml down "$@"
    else
      docker compose --env-file .env -f docker/docker-compose.prod.yml down "$@"
    fi
    ;;
  prod-logs)
    shift
    # View production logs
    if [ -f docker/docker-compose.prod.override.yml ]; then
      docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml logs "$@"
    else
      docker compose --env-file .env -f docker/docker-compose.prod.yml logs "$@"
    fi
    ;;
  prod-update)
    # Pull latest code, rebuild, and restart production
    echo "Pulling latest code..."
    git pull
    echo ""
    echo "Rebuilding production image..."
    if [ -f docker/docker-compose.prod.override.yml ]; then
      docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml build --no-cache
    else
      docker compose --env-file .env -f docker/docker-compose.prod.yml build --no-cache
    fi
    echo ""
    echo "Restarting production deployment..."
    if [ -f docker/docker-compose.prod.override.yml ]; then
      docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml up -d
    else
      docker compose --env-file .env -f docker/docker-compose.prod.yml up -d
    fi
    echo ""
    echo "✓ Production update complete. Viewing logs (Ctrl+C to exit)..."
    if [ -f docker/docker-compose.prod.override.yml ]; then
      docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml logs -f
    else
      docker compose --env-file .env -f docker/docker-compose.prod.yml logs -f
    fi
    ;;
  *)
    usage; exit 1;;
esac