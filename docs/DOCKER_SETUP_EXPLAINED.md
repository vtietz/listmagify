# Building a Cross-Platform Docker Development Environment with Production Overrides

Setting up a development environment that works identically across Windows, macOS, and Linux while also providing a seamless path to production deployment can be challenging. Here's how to build a Docker-based workflow that solves these problems elegantly.

## The Problem

Every developer has experienced this: a project works perfectly on one machine but breaks on another. Maybe it's different Node.js versions, missing system dependencies, or OS-specific quirks. Then there's the production deployment puzzle—how do you keep server-specific configuration (like SSL certificates and domain names) separate from your application code without cluttering your git repository?

## The Solution: A Multi-File Docker Setup

The approach uses three key components working together:

### 1. Cross-Platform Wrapper Scripts

Instead of developers memorizing Docker Compose commands, create simple wrapper scripts: `run.sh` for Unix systems and `run.bat` for Windows. These scripts handle all the Docker complexity behind friendly commands:

- `./run.sh up` - Start development server
- `./run.sh install` - Install dependencies
- `./run.sh prod-build` - Build production image

The scripts automatically detect if a production override file exists and merge it with the base configuration. This means developers never need to think about Docker Compose file merging—it just works.

### 2. Separate Development and Production Environments

Rather than trying to make one Docker setup work for both development and production, split them completely:

**Development** uses hot reloading with your source code mounted as a volume. Every file change instantly reflects in the running application. It's optimized for speed and convenience—full debug tools, verbose logging, and all development dependencies.

**Production** uses a multi-stage build that creates an optimized, minimal image. The final image contains only what's needed to run the application, no development dependencies or build tools. For Next.js apps, this can reduce image size from over 1GB to around 200MB.

### 3. The Production Override Pattern

Here's where it gets interesting. Instead of one production configuration file, use two:

**Base Production Config** (`docker-compose.prod.yml`) contains everything that's the same across all deployments: the Docker image to build, environment variables structure, restart policies, and standard volumes. This file is committed to git and shared across your team.

**Production Override** (`docker-compose.prod.override.yml`) contains server-specific settings: your domain name, SSL certificate configuration, custom networks for reverse proxies, and monitoring setup. This file is NOT committed to git—each server has its own version.

Docker Compose automatically merges these files when both are present. Your wrapper scripts detect the override file and include it in the command, so deployment is still just `./run.sh prod-up`.

## How It Works in Practice

### For Development

A new developer clones the repository and runs three commands:

```bash
./run.sh init-env     # Creates .env from template
./run.sh install      # Installs dependencies in Docker
./run.sh up          # Starts dev server
```

No Node.js installation needed. No figuring out which version. No wrestling with native modules that need specific Python versions. Everything runs in an isolated container with the exact environment specified in the Dockerfile.

Adding a package? `./run.sh exec pnpm add react-query`. Running tests? `./run.sh test`. The wrapper script handles all the Docker Compose orchestration.

### For Production Deployment

On your production server, you create the override file once:

```yaml
# docker-compose.prod.override.yml
services:
  web:
    networks:
      - nginx-proxy
    environment:
      - VIRTUAL_HOST=yourapp.com
      - LETSENCRYPT_HOST=yourapp.com
      - LETSENCRYPT_EMAIL=admin@yourapp.com
```

Then deployment is straightforward:

```bash
./run.sh prod-build    # Build optimized image
./run.sh prod-up       # Start container
```

The container automatically connects to nginx-proxy on the server, which provisions an SSL certificate from Let's Encrypt and sets up the reverse proxy. No manual nginx configuration. No certificate renewal scripts. It's automated.

When you need to deploy to a staging server with a different domain, you create a different override file on that server. The base configuration stays the same.

## The Benefits of This Approach

**Consistency**: Every developer, every CI/CD pipeline, and every production server uses the exact same base environment. "Works on my machine" becomes "works everywhere."

**Simplicity**: Complex Docker commands are hidden behind simple scripts. New team members don't need to learn Docker—they learn your app's commands.

**Separation of Concerns**: Application configuration lives in git. Server-specific deployment configuration stays on servers. No accidental commits of production secrets or domain names.

**Security**: Production secrets never need to be committed. Each server has its own `.env` file and override configuration that never enters version control.

**Flexibility**: Need different SSL providers? Different reverse proxies? Different resource limits on different servers? Just customize the override file on each server while keeping the base configuration identical.

## Key Design Decisions

### Why Separate Docker Compose Files?

A single file that tries to handle both development and production becomes a mess of conditional logic. Separate files make each environment's requirements explicit and easy to understand.

### Why Override Files Instead of Environment Variables?

Some configurations (like network definitions, labels for reverse proxies, and health checks) can't be expressed as simple environment variables. Docker Compose's native file merging handles complex configuration elegantly.

### Why Wrapper Scripts Instead of Direct Docker Commands?

The scripts encode your team's conventions. They make the common tasks trivial while still allowing power users to run raw Docker commands when needed. They also provide a single place to handle the override file detection logic.

### Why Not Docker Secrets?

Docker Secrets work great in Swarm mode but add complexity for simple single-server deployments. The `.env` file approach is simpler for most use cases. For multi-server orchestrated deployments, you'd migrate to Kubernetes or Swarm with proper secrets management.

## Implementation Tips

**Start Small**: Begin with basic Dockerfiles and compose files. Add optimizations like build cache mounts and multi-stage builds once the basics work.

**Document the Override**: Include a well-commented example override file in your repository (`docker-compose.prod.override.example.yml`) that developers can reference when setting up new servers.

**Test Production Builds Locally**: Add a command that runs the production build locally to catch issues before deployment.

**Pin Versions**: Lock your Node.js version, package manager version, and all system dependencies in the Dockerfile. This prevents surprise breakages from upstream updates.

## Real-World Usage

This pattern works particularly well for:

- Small to medium teams deploying to a handful of servers
- Applications that need staging and production environments with different domains
- Projects where developers use different operating systems
- Situations where you need reproducible builds for compliance or debugging

It's less suitable for:

- Large-scale orchestrated deployments (use Kubernetes)
- Applications with complex multi-service dependencies (though Docker Compose can handle this)
- Teams that prefer platform-as-a-service solutions (Heroku, Vercel, etc.)

## Getting Started

The complete setup requires:
- Two Dockerfiles (dev and production)
- Three Docker Compose files (dev, prod base, prod override example)
- Two wrapper scripts (Unix and Windows)
- Environment file template

Once these files are in place, the workflow becomes simple: developers run wrapper commands, production servers have their custom override files, and everything else is automated.

The initial setup takes a few hours, but it pays dividends immediately. Every new developer onboards faster. Every deployment is predictable. Every environment is consistent.

That's the power of a well-designed Docker development environment.

---

## Quick Reference

**Development Commands:**
- `./run.sh install` - Install dependencies
- `./run.sh up` - Start dev server
- `./run.sh exec [command]` - Run command in container
- `./run.sh test` - Run tests

**Production Commands:**
- `./run.sh prod-build` - Build production image
- `./run.sh prod-up` - Start production deployment
- `./run.sh prod-logs -f` - View logs
- `./run.sh prod-down` - Stop deployment

**Files to Create:**
- `docker/Dockerfile` - Development image
- `docker/Dockerfile.prod` - Production image (multi-stage)
- `docker/docker-compose.yml` - Development services
- `docker/docker-compose.prod.yml` - Production base (committed)
- `docker/docker-compose.prod.override.example.yml` - Template
- `run.sh` and `run.bat` - Wrapper scripts

**Files to .gitignore:**
- `.env` - Contains secrets
- `docker/docker-compose.prod.override.yml` - Server-specific
