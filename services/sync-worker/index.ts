/**
 * Standalone sync worker process.
 *
 * Runs the background sync scheduler and token keepalive loop
 * as a long-lived Node.js process, separate from the Next.js web server.
 *
 * Usage:
 *   Development: pnpm exec tsx services/sync-worker/index.ts
 *   Production:  node dist/services/sync-worker/index.js
 */

import { startScheduler, stopScheduler } from '@/lib/sync/scheduler';
import { startTokenKeepaliveLoop, stopTokenKeepaliveLoop } from '@/lib/auth/tokenKeepalive';

function main(): void {
  console.debug('[sync-worker] starting', {
    SYNC_SCHEDULER_ENABLED: process.env.SYNC_SCHEDULER_ENABLED,
    TOKEN_KEEPALIVE_ENABLED: process.env.TOKEN_KEEPALIVE_ENABLED,
  });

  let started = false;

  if (process.env.SYNC_SCHEDULER_ENABLED === 'true') {
    startScheduler();
    started = true;
  }

  if (process.env.TOKEN_KEEPALIVE_ENABLED === 'true') {
    startTokenKeepaliveLoop();
    started = true;
  }

  if (!started) {
    console.warn('[sync-worker] nothing enabled (set SYNC_SCHEDULER_ENABLED=true and/or TOKEN_KEEPALIVE_ENABLED=true)');
    process.exit(0);
  }

  console.debug('[sync-worker] running');
}

function shutdown(): void {
  console.debug('[sync-worker] shutting down...');
  stopScheduler();
  stopTokenKeepaliveLoop();

  // Give in-flight operations a grace period, then exit
  setTimeout(() => {
    console.debug('[sync-worker] exit');
    process.exit(0);
  }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();
