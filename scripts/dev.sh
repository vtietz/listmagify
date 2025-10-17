#!/bin/sh

# Display configuration info
node /app/scripts/show-config.js

# Start Next.js dev server
exec pnpm dev
