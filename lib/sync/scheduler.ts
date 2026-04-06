/**
 * Background sync scheduler.
 *
 * Polls the database every TICK_MS for sync pairs whose next_run_at
 * has elapsed and dispatches them to the background runner with
 * bounded concurrency.
 *
 * Enabled via the SYNC_SCHEDULER_ENABLED=true environment variable.
 * Configurable via SYNC_TICK_MS, SYNC_MAX_CONCURRENT, and optional
 * provider-specific concurrency caps:
 * - SYNC_MAX_CONCURRENT_SPOTIFY
 * - SYNC_MAX_CONCURRENT_TIDAL
 */

import { getDueSyncPairs, pruneOldSyncRuns, resetStaleSyncRuns } from '@/lib/sync/syncStore';
import { executeSyncPair } from '@/lib/sync/executor';
import { hasRunningImportJobForProvider } from '@/lib/import/importStore';
import type { SyncPair } from '@/lib/sync/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

function getTickMs(): number {
  return Number(process.env.SYNC_TICK_MS ?? 60_000);
}

function getMaxConcurrent(): number {
  return Number(process.env.SYNC_MAX_CONCURRENT ?? 2);
}

function getProviderMaxConcurrent(providerId: MusicProviderId): number {
  const envKey = `SYNC_MAX_CONCURRENT_${providerId.toUpperCase()}`;
  const raw = process.env[envKey];
  if (!raw) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor(parsed);
}

/** Apply ±jitterPct random jitter to a base delay, floored at 1s. */
function jitteredDelay(baseMs: number, jitterPct: number): number {
  const jitter = baseMs * jitterPct * (2 * Math.random() - 1);
  return Math.max(1000, Math.round(baseMs + jitter));
}

let timeoutId: ReturnType<typeof setTimeout> | null = null;
let activeSyncs = 0;
let activeByProvider: Record<MusicProviderId, number> = {
  spotify: 0,
  tidal: 0,
};

function providersForPair(pair: SyncPair): MusicProviderId[] {
  return pair.sourceProvider === pair.targetProvider
    ? [pair.sourceProvider]
    : [pair.sourceProvider, pair.targetProvider];
}

function hasProviderCapacity(pair: SyncPair): boolean {
  const providers = providersForPair(pair);
  return providers.every((providerId) => activeByProvider[providerId] < getProviderMaxConcurrent(providerId));
}

async function tick(): Promise<void> {
  const maxConcurrent = getMaxConcurrent();
  if (activeSyncs >= maxConcurrent) return;

  const slots = maxConcurrent - activeSyncs;
  const duePairs = getDueSyncPairs(slots);
  const providerBlockedByImport: Record<MusicProviderId, boolean> = {
    spotify: hasRunningImportJobForProvider('spotify'),
    tidal: hasRunningImportJobForProvider('tidal'),
  };
  let dispatched = 0;

  for (const pair of duePairs) {
    if (dispatched >= slots) {
      break;
    }

    const providers = providersForPair(pair);

    if (providers.some((providerId) => providerBlockedByImport[providerId])) {
      continue;
    }

    if (!hasProviderCapacity(pair)) {
      continue;
    }

    activeSyncs++;
    dispatched++;
    for (const providerId of providers) {
      activeByProvider[providerId]++;
    }

    executeSyncPair({ pair, triggeredBy: 'scheduler' })
      .catch((err) => console.error('[sync/scheduler] unhandled', err))
      .finally(() => {
        activeSyncs--;
        for (const providerId of providers) {
          activeByProvider[providerId]--;
        }
      });
  }

  try {
    resetStaleSyncRuns(30 * 60 * 1000); // 30 minutes
    pruneOldSyncRuns(3);
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
    providerCaps: {
      spotify: getProviderMaxConcurrent('spotify'),
      tidal: getProviderMaxConcurrent('tidal'),
    },
  });
  void tick();
  scheduleTick();
}

export function stopScheduler(): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  activeSyncs = 0;
  activeByProvider = {
    spotify: 0,
    tidal: 0,
  };
}
