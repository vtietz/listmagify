# Production Deployment Guide

This guide explains how to deploy Spotlisted in production with server-specific configurations.

## Overview

The repository includes clean, version-controlled Docker Compose files. Server-specific settings (custom networks, SSL, reverse proxy) are handled through override files that are **not tracked in git**.

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/spotify-playlist-editor.git
cd spotify-playlist-editor
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Spotify API credentials and production settings
```

### 3. Create Server-Specific Override (Optional)

If you need custom networks, SSL certificates, or reverse proxy integration:

```bash
cp docker/docker-compose.prod.override.example.yml docker/docker-compose.prod.override.yml
```

Edit `docker/docker-compose.prod.override.yml` with your settings:

```yaml
services:
  web:
    networks:
      - nginx-proxy  # Your custom network
    environment:
      - VIRTUAL_HOST=spotlisted.yourdomain.com
      - LETSENCRYPT_HOST=spotlisted.yourdomain.com
      - LETSENCRYPT_EMAIL=admin@yourdomain.com
      - NEXTAUTH_URL=https://spotlisted.yourdomain.com

networks:
  nginx-proxy:
    external: true
```

### 4. Build and Deploy

**With override file** (automatic detection):
```bash
./run.sh prod-up
# or on Windows: run.bat prod-up
```

**Without scripts** (manual):
```bash
# Build
docker compose -f docker/docker-compose.prod.yml build

# Start (auto-detects override file if present)
docker compose -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.prod.override.yml up -d
```

## Updating from Git

When you pull updates from the repository:

1. **Your override file is safe** - it's git-ignored and won't be overwritten
2. **The base config may update** - review changes in `docker-compose.prod.yml`
3. **Rebuild and redeploy**:
   ```bash
   git pull
   ./run.sh prod-down  # Stops with override if present
   ./run.sh prod-up    # Rebuilds and starts with override
   ```

## nginx-proxy Integration Example

If using [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy) with Let's Encrypt:

```yaml
# docker/docker-compose.prod.override.yml
services:
  web:
    networks:
      - nginx-proxy
    environment:
      - VIRTUAL_HOST=spotlisted.example.com
      - VIRTUAL_PORT=3000
      - LETSENCRYPT_HOST=spotlisted.example.com
      - LETSENCRYPT_EMAIL=admin@example.com
      - NEXTAUTH_URL=https://spotlisted.example.com

networks:
  nginx-proxy:
    external: true
    name: nginx-proxy
```

## Traefik Integration Example

If using [Traefik](https://traefik.io/) as reverse proxy:

```yaml
# docker/docker-compose.prod.override.yml
services:
  web:
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.spotlisted.rule=Host(`spotlisted.example.com`)"
      - "traefik.http.routers.spotlisted.entrypoints=websecure"
      - "traefik.http.routers.spotlisted.tls=true"
      - "traefik.http.routers.spotlisted.tls.certresolver=letsencrypt"
      - "traefik.http.services.spotlisted.loadbalancer.server.port=3000"

networks:
  traefik-public:
    external: true
```

## File Structure

```
project/
├── docker/
│   ├── docker-compose.yml                    # Development (in git)
│   ├── docker-compose.prod.yml               # Production base (in git)
│   ├── docker-compose.prod.override.example.yml  # Template (in git)
│   └── docker-compose.prod.override.yml      # Your config (git-ignored)
├── .env.example                              # Template (in git)
├── .env                                       # Your secrets (git-ignored)
└── run.sh / run.bat                          # Helper scripts
```

## Benefits of This Approach

✅ **Clean Repository**: No server-specific configs in version control  
✅ **Easy Updates**: Git pull won't overwrite your server settings  
✅ **Team-Friendly**: Each server can have its own override file  
✅ **Secure**: Secrets and server details stay on the server  
✅ **Standard**: Uses Docker Compose's built-in override mechanism

## Troubleshooting

### Override file not being used

Check the file path:
```bash
ls -la docker/docker-compose.prod.override.yml
```

Use explicit file list:
```bash
docker compose -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.prod.override.yml config
```

### Network errors

Ensure external network exists:
```bash
docker network ls
docker network create nginx-proxy  # if missing
```

### Environment variables not loading

1. Check `.env` file exists and has correct values
2. Verify `env_file` path in docker-compose files
3. Use `docker compose config` to debug merged configuration

## See Also

- [Docker Compose Override Documentation](https://docs.docker.com/compose/extends/)
- [nginx-proxy Setup Guide](https://github.com/nginx-proxy/nginx-proxy)
- [Traefik Quick Start](https://doc.traefik.io/traefik/getting-started/quick-start/)
