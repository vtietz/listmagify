# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHOKIDAR_USEPOLLING=1 \
    WATCHPACK_POLLING=true \
    COREPACK_ENABLE_STRICT=0
WORKDIR /usr/src/app
RUN corepack enable && corepack install -g pnpm@10.18.3

# Dev image: install deps once, keep cache
FROM base AS dev
# Install OS deps (git, openssl for Auth.js PKCE)
RUN apk add --no-cache bash openssl
# Dev image: no dependency install; dependencies are installed during development via docker/run.bat install
COPY . .

# Default command will be overridden by run scripts
CMD ["pnpm","dev"]