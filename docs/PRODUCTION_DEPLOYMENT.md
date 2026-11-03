# Production Deployment Guide

This guide explains how to deploy Listmagify in production with server-specific configurations.

## Overview

The repository includes clean, version-controlled Docker Compose files. Server-specific settings (custom networks, SSL, reverse proxy) are handled through override files that are **not tracked in git**.

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/listmagify.git
cd listmagify
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Spotify API credentials and production settings
```

Optional sync-worker tuning (rate-limit control):

```env
SYNC_SCHEDULER_ENABLED=true
SYNC_TICK_MS=60000
SYNC_MAX_CONCURRENT=3
SYNC_MAX_CONCURRENT_SPOTIFY=1
SYNC_MAX_CONCURRENT_TIDAL=2
SYNC_INTERVAL_OPTIONS=15m,30m,1h,6h,12h,24h
```

`SYNC_MAX_CONCURRENT` is the global scheduler cap; provider-specific caps further limit pairs that touch a given provider.

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
      - VIRTUAL_HOST=listmagify.yourdomain.com
      - LETSENCRYPT_HOST=listmagify.yourdomain.com
      - LETSENCRYPT_EMAIL=admin@yourdomain.com
      - NEXTAUTH_URL=https://listmagify.yourdomain.com

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
docker compose --env-file .env -f docker/docker-compose.prod.yml build

# Start (auto-detects override file if present)
docker compose --env-file .env -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.prod.override.yml up -d
```

Run manual commands from the repository root with `--env-file .env`, including
`docker compose --env-file .env -f docker/docker-compose.prod.yml ps`.
The service-level `env_file` supplies container runtime variables, but does not
supply Compose interpolation values such as the `CONTACT_*` build arguments.
The `./run.sh prod-*` commands already pass `--env-file .env`.

## Approved CI Deployment

The Docker publication workflow deploys only after successful **CI** triggered by
a push to `main` in this repository. Manual workflow runs and releases publish
images only. Builds check out the exact CI source SHA (or `github.sha` for manual
runs/releases), publish a full `sha-<commit>` tag and revision label, and pass the
registry digest to deployment. Production uses the immutable digest, not `latest`.

### GitHub Protection and Approval

Before enabling deployments, create the **production** GitHub environment and
configure required reviewers, deployment branch restrictions, and prevention of
self-review where available. **Creating an environment does not enforce approval.**
Verify that deployments actually wait for review; do not assume the environment
name provides protection. Required reviewers, self-review prevention, and other
protection features depend on repository visibility and GitHub plan. If your plan
does not support the required approval gate, do not provision deployment secrets
until an equivalent enforceable gate is in place. A sole owner cannot approve
their own deployment when self-review prevention is enabled; arrange an independent
reviewer rather than silently weakening that control.

Configure a `main` ruleset requiring pull requests, successful CI, and appropriate
review, restricting updates/bypass to the intended owner or trusted maintainers,
and preventing force pushes and deletion. Check plan support and owner/admin bypass
settings explicitly. Protect changes to workflows as privileged code changes.

### Environment Settings

Set these only in the **production** environment, not as repository-wide secrets.
No automatic deployment should be enabled until all settings, approval controls,
host prerequisites, and backups below are provisioned and verified.

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `PROD_SSH_PRIVATE_KEY` | Dedicated deployment private key, usable noninteractively |
| Secret | `PROD_SSH_KNOWN_HOSTS` | Independently verified OpenSSH host-key entry for the destination |
| Variable | `PROD_SSH_HOST` | DNS name or IPv4 address, without scheme (IPv6 is not supported by this script) |
| Variable | `PROD_SSH_PORT` | Explicit SSH port, from 1 to 65535 |
| Variable | `PROD_SSH_USER` | Dedicated lowercase Unix account name |
| Variable | `PROD_SSH_PATH` | Absolute dedicated checkout path; only letters, digits, underscores, hyphens, and separating slashes; no trailing slash |
| Variable | `PROD_HEALTH_URL` | Public `https://hostname[:port]/api/config` URL; no credentials, query, or fragment |

Verify the host key fingerprint using a trusted server console or another
independent administrative channel. For a nondefault SSH port, the known-hosts
entry must use `[hostname]:port`; for port 22, use the normal hostname entry.
Provision the entry ahead of time. The workflow never discovers keys with runtime
`ssh-keyscan` and requires strict host checking, batch mode, and its dedicated key.

### Host Prerequisites

- Install Bash, Git, OpenSSH, `flock`, Docker Engine, and Docker Compose v2.
- Create a dedicated, existing, full Git checkout with `origin` pointing to this
  repository. Keep tracked files clean, including staged changes. Do not edit
  tracked Compose files on the server; use the ignored production override.
- Provision `.env`, the optional `docker/docker-compose.prod.override.yml`, persistent
  data, and reverse-proxy networking separately. Never put secrets in workflow logs.
  Overrides must retain both service names and the `IMAGE` selection for both.
- Limit the deployment SSH account and key to the required host and purpose;
  disable forwarding/PTY capabilities where practical. Docker access is effectively
  root access, even without `sudo`; treat this account and GitHub environment
  reviewers as privileged operators. Do not grant unrelated host access.
- If Git or GHCR is private, provision least-privilege read credentials on the
  server for noninteractive `git fetch` and Docker pulls. The runner's GitHub token
  is used only for the main-branch freshness check, never forwarded to the server.
- Back up persistent data/database and verify restoration before rollout. Review
  migrations and compatibility before approving: both services can run migrations.

### Deployment and Recovery Behavior

Deployments serialize through a fixed GitHub concurrency group without canceling
an active deployment, and a nonblocking checkout-local `flock` rejects overlapping
remote deployments. Jobs have a 20-minute timeout. A queued or approved old build
fails if it is no longer current `main`: the runner checks GitHub's API and the
server independently fetches and verifies `origin/main` before detached checkout.
These are point-in-time checks; they do not prevent a later push during rollout.

The remote script exports `IMAGE=ghcr.io/vtietz/listmagify@sha256:...`, then runs
Compose from the checkout root with `--env-file .env`, the production base file,
and the optional production override. It pulls and runs only `spotify-web` and
`sync-worker` using `up -d --no-build`, without stopping the stack first.
It checks both running containers against the intended image ID and digest
reference, retries an internal web `/api/config` request for a bounded interval,
then checks public HTTPS from the runner with bounded curl retries. It does not
print container environments or rendered Compose configuration.

This is not a zero-downtime guarantee or an end-to-end scheduler test. A failed
check can leave a partially updated stack. There is **no automatic rollback**:
migrations may make an older image unsafe. Investigate without exposing secrets,
then choose a reviewed forward fix or a coordinated image/database restore.
Do not prune images, reset tracked files, or stop the stack as part of this flow.

## Updating from Git (Manual Alternative)

When you pull updates from the repository:

1. **Your override file is safe** - it's git-ignored and won't be overwritten
2. **The base config may update** - review changes in `docker-compose.prod.yml`
3. **Rebuild and redeploy**:
   ```bash
   git pull
   ./run.sh prod-up    # Rebuilds and starts with override
   ```

Do not run manual updates concurrently with approved CI deployments. Prefer the
approved immutable-image flow above for the dedicated deployment checkout.

## nginx-proxy Integration Example

If using [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy) with Let's Encrypt:

```yaml
# docker/docker-compose.prod.override.yml
services:
  web:
    networks:
      - nginx-proxy
    environment:
      - VIRTUAL_HOST=listmagify.example.com
      - VIRTUAL_PORT=3000
      - LETSENCRYPT_HOST=listmagify.example.com
      - LETSENCRYPT_EMAIL=admin@example.com
      - NEXTAUTH_URL=https://listmagify.example.com

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
      - "traefik.http.routers.listmagify.rule=Host(`listmagify.example.com`)"
      - "traefik.http.routers.listmagify.entrypoints=websecure"
      - "traefik.http.routers.listmagify.tls=true"
      - "traefik.http.routers.listmagify.tls.certresolver=letsencrypt"
      - "traefik.http.services.listmagify.loadbalancer.server.port=3000"

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
