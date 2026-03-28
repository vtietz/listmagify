import { getMusicProvider } from '@/lib/music-provider';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { captureSnapshot } from '@/lib/sync/snapshot';
import { computeSyncDiff } from '@/lib/sync/diff';
import { applySyncPlan } from '@/lib/sync/apply';
import { getSyncPair, createSyncRun, updateSyncRun } from '@/lib/sync/syncStore';
import type { SyncConfig, SyncPlan, SyncApplyResult } from '@/lib/sync/types';

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Capture snapshots from both playlists and compute the diff without
 * applying any changes.
 */
export async function previewSync(config: SyncConfig): Promise<SyncPlan> {
  const sourceProvider = getMusicProvider(config.sourceProvider);
  const targetProvider = getMusicProvider(config.targetProvider);

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    captureSnapshot(sourceProvider, config.sourceProvider, config.sourcePlaylistId),
    captureSnapshot(targetProvider, config.targetProvider, config.targetPlaylistId),
  ]);

  const plan = computeSyncDiff(sourceSnapshot, targetSnapshot, config.direction);

  console.debug('[sync/runner] preview complete', {
    direction: config.direction,
    toAdd: plan.summary.toAdd,
    toRemove: plan.summary.toRemove,
    unresolved: plan.summary.unresolved,
  });

  return plan;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

interface ExecuteSyncConfig extends SyncConfig {
  syncPairId?: string;
}

interface ExecuteSyncResult {
  plan: SyncPlan;
  result: SyncApplyResult;
  runId?: string;
}

/**
 * Preview then apply the sync plan. When a `syncPairId` is supplied, a
 * `SyncRun` record is created and updated through the lifecycle.
 */
export async function executeSync(config: ExecuteSyncConfig): Promise<ExecuteSyncResult> {
  let runId: string | undefined;

  try {
    if (config.syncPairId) {
      const run = createSyncRun({
        syncPairId: config.syncPairId,
        direction: config.direction,
      });
      runId = run.id;
      updateSyncRun(runId, { status: 'executing' });
    }

    const plan = await previewSync(config);
    const result = await applySyncPlan(plan);

    if (runId) {
      const hasErrors = result.errors.length > 0;
      updateSyncRun(runId, {
        status: hasErrors ? 'failed' : 'done',
        tracksAdded: result.added,
        tracksRemoved: result.removed,
        tracksUnresolved: result.unresolved.length,
        errorMessage: hasErrors ? result.errors.join('; ') : null,
        completedAt: new Date().toISOString(),
      });
    }

    console.debug('[sync/runner] execute complete', {
      runId,
      added: result.added,
      removed: result.removed,
      errors: result.errors.length,
    });

    const base = { plan, result };
    return runId !== undefined ? { ...base, runId } : base;
  } catch (error) {
    if (runId) {
      const message = error instanceof Error ? error.message : String(error);
      updateSyncRun(runId, {
        status: 'failed',
        errorMessage: message,
        completedAt: new Date().toISOString(),
      });
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Pair-based convenience wrappers
// ---------------------------------------------------------------------------

function buildConfigFromPair(pair: {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  direction: SyncConfig['direction'];
}): SyncConfig {
  return {
    sourceProvider: pair.sourceProvider,
    sourcePlaylistId: pair.sourcePlaylistId,
    targetProvider: pair.targetProvider,
    targetPlaylistId: pair.targetPlaylistId,
    direction: pair.direction,
  };
}

/**
 * Look up a saved sync pair and preview the diff.
 * When `createdBy` is provided, the pair must belong to that user.
 */
export async function previewSyncFromPair(syncPairId: string, createdBy?: string): Promise<SyncPlan> {
  const pair = getSyncPair(syncPairId, createdBy);
  if (!pair) {
    throw new Error(`Sync pair not found: ${syncPairId}`);
  }

  return previewSync(buildConfigFromPair(pair));
}

/**
 * Look up a saved sync pair and execute a full sync, recording a SyncRun.
 * When `createdBy` is provided, the pair must belong to that user.
 */
export async function executeSyncFromPair(
  syncPairId: string,
  createdBy?: string,
): Promise<{ plan: SyncPlan; result: SyncApplyResult; runId: string }> {
  const pair = getSyncPair(syncPairId, createdBy);
  if (!pair) {
    throw new Error(`Sync pair not found: ${syncPairId}`);
  }

  const config = buildConfigFromPair(pair);
  const outcome = await executeSync({ ...config, syncPairId });

  // runId is always defined when syncPairId is provided
  return { plan: outcome.plan, result: outcome.result, runId: outcome.runId! };
}
