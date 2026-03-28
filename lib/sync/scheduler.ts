/**
 * Background sync scheduler.
 *
 * Polls the database every TICK_MS for sync pairs whose next_run_at
 * has elapsed and dispatches them to the background runner with
 * bounded concurrency.
 *
 * Enabled via the SYNC_SCHEDULER_ENABLED=true environment variable.
 */

import { getDueSyncPairs } from '@/lib/sync/syncStore';
import { executeBackgroundSync } from '@/lib/sync/backgroundRunner';

const TICK_MS = 60_000;
const MAX_CONCURRENT = 2;

let intervalId: ReturnType<typeof setInterval> | null = null;
let activeSyncs = 0;

async function tick(): Promise<void> {
  if (activeSyncs >= MAX_CONCURRENT) return;

  const slots = MAX_CONCURRENT - activeSyncs;
  const duePairs = getDueSyncPairs(slots);

  for (const pair of duePairs) {
    activeSyncs++;
    executeBackgroundSync(pair)
      .catch((err) => console.error('[sync/scheduler] unhandled', err))
      .finally(() => {
        activeSyncs--;
      });
  }
}

export function startScheduler(): void {
  if (intervalId) return;
  if (process.env.SYNC_SCHEDULER_ENABLED !== 'true') return;

  console.debug('[sync/scheduler] starting');
  intervalId = setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
