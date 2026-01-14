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
  init-env        Create .env from .env.example
  prod-build      Build production image (use --no-cache to force rebuild)
  prod-up         Start production deployment
  prod-down       Stop production deployment
  prod-logs       View production logs (use -f to follow)
  prod-update     Pull latest code, rebuild, and restart (git pull + prod-build + prod-up)
  prod-clean      Clean up Docker images, containers, and build cache (use --volumes to also remove volumes)

Examples:
  ./run.sh up
  ./run.sh down
  ./run.sh install
  ./run.sh test
  ./run.sh test -- --watch
  ./run.sh exec pnpm add lodash
  ./run.sh compose logs -f
  ./run.sh init-env
  ./run.sh prod-build --no-cache
  ./run.sh prod-logs -f
  ./run.sh prod-update
  ./run.sh prod-clean
  ./run.sh prod-clean --volumes
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
  init-env)
    if [ ! -f .env ]; then
      cp .env.example .env
      echo "Created .env from .env.example. Fill in real secrets (NEXTAUTH_SECRET, SPOTIFY_*)."
    else
      echo ".env already exists. Edit it to set your secrets."
    fi
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
  prod-clean)
    shift
    echo "🧹 Cleaning up Docker artifacts for this app..."
    echo ""
    
    # Stop and remove production containers
    echo "→ Stopping and removing production containers..."
    if [ -f docker/docker-compose.prod.override.yml ]; then
      docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml down 2>/dev/null || true
    else
      docker compose --env-file .env -f docker/docker-compose.prod.yml down 2>/dev/null || true
    fi
    docker compose --env-file .env -f docker/docker-compose.yml down 2>/dev/null || true
    
    # Remove images
    echo "→ Removing Docker images (sbs-web:prod, sbs-web:dev)..."
    docker rmi sbs-web:prod 2>/dev/null || echo "  (no sbs-web:prod image found)"
    docker rmi sbs-web:dev 2>/dev/null || echo "  (no sbs-web:dev image found)"
    
    # Remove build cache
    echo "→ Pruning build cache..."
    docker builder prune -f --filter "label=com.docker.compose.project=$(basename $(pwd))" 2>/dev/null || docker builder prune -f
    
    # Handle volumes if --volumes flag is present
    if [ "${1:-}" = "--volumes" ]; then
      echo "→ Removing volumes..."
      if [ -f docker/docker-compose.prod.override.yml ]; then
        docker compose --env-file .env -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml down -v 2>/dev/null || true
      else
        docker compose --env-file .env -f docker/docker-compose.prod.yml down -v 2>/dev/null || true
      fi
      docker compose --env-file .env -f docker/docker-compose.yml down -v 2>/dev/null || true
    fi
    
    echo ""
    echo "✓ Cleanup complete!"
    ;;
  *)
    usage; exit 1;;
esac