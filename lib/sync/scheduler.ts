/**
 * Background sync scheduler.
 *
 * Polls the database every TICK_MS for sync pairs whose next_run_at
 * has elapsed and dispatches them to the background runner with
 * bounded concurrency.
 *
 * Enabled via the SYNC_SCHEDULER_ENABLED=true environment variable.
 * Configurable via SYNC_TICK_MS and SYNC_MAX_CONCURRENT env vars.
 */

import { getDueSyncPairs, pruneOldSyncRuns, resetStaleSyncRuns } from '@/lib/sync/syncStore';
import { executeSyncPair } from '@/lib/sync/executor';

function getTickMs(): number {
  return Number(process.env.SYNC_TICK_MS ?? 60_000);
}

function getMaxConcurrent(): number {
  return Number(process.env.SYNC_MAX_CONCURRENT ?? 2);
}

/** Apply ±jitterPct random jitter to a base delay, floored at 1s. */
function jitteredDelay(baseMs: number, jitterPct: number): number {
  const jitter = baseMs * jitterPct * (2 * Math.random() - 1);
  return Math.max(1000, Math.round(baseMs + jitter));
}

let timeoutId: ReturnType<typeof setTimeout> | null = null;
let activeSyncs = 0;

async function tick(): Promise<void> {
  const maxConcurrent = getMaxConcurrent();
  if (activeSyncs >= maxConcurrent) return;

  const slots = maxConcurrent - activeSyncs;
  const duePairs = getDueSyncPairs(slots);

  for (const pair of duePairs) {
    activeSyncs++;
    executeSyncPair({ pair, triggeredBy: 'scheduler' })
      .catch((err) => console.error('[sync/scheduler] unhandled', err))
      .finally(() => {
        activeSyncs--;
      });
  }

  try {
    resetStaleSyncRuns(30 * 60 * 1000); // 30 minutes
    pruneOldSyncRuns(50);
  } catch {
    // Cleanup failure should never break the scheduler
  }
}

function scheduleTick(): void {
  const delay = jitteredDelay(getTickMs(), 0.05);
  timeoutId = setTimeout(() => {
    void tick().finally(scheduleTick);
  }, delay);
}

export function startScheduler(): void {
  if (timeoutId) return;
  if (process.env.SYNC_SCHEDULER_ENABLED !== 'true') return;

  console.debug('[sync/scheduler] starting', {
    tickMs: getTickMs(),
    maxConcurrent: getMaxConcurrent(),
  });
  void tick();
  scheduleTick();
}

export function stopScheduler(): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}
