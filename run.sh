#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  cat <<EOF
Usage: ./run.sh [compose|exec|run|install|start|test|prod-up|prod-down] [args...]

Examples:
  ./run.sh compose build
  ./run.sh compose up
  ./run.sh compose down
  ./run.sh exec pnpm test -- --watch
  ./run.sh run pnpm lint
  ./run.sh install
  ./run.sh start
  ./run.sh test -- --watch
  ./run.sh prod-up        # Start production deployment
  ./run.sh prod-down      # Stop production deployment
EOF
}

case "${1:-}" in
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
    docker compose --env-file .env -f docker/docker-compose.yml run --rm web sh -c "pnpm install $* && npm rebuild better-sqlite3"
    ;;
  start)
    shift
    # Start only the dev service (web) by default
    docker compose --env-file .env -f docker/docker-compose.yml up web "$@"
    ;;
  test)
    shift
    docker compose --env-file .env -f docker/docker-compose.yml run --rm web pnpm test "$@"
    ;;
  prod-up)
    shift
    # Check for override file
    if [ -f docker/docker-compose.prod.override.yml ]; then
      echo "Using production override file..."
      docker compose -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml up -d "$@"
    else
      docker compose -f docker/docker-compose.prod.yml up -d "$@"
    fi
    ;;
  prod-down)
    shift
    # Check for override file
    if [ -f docker/docker-compose.prod.override.yml ]; then
      docker compose -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml down "$@"
    else
      docker compose -f docker/docker-compose.prod.yml down "$@"
    fi
    ;;
  *)
    usage; exit 1;;
esac