import { getMusicProvider } from '@/lib/music-provider';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { captureSnapshot } from '@/lib/sync/snapshot';
import type { SnapshotOptions } from '@/lib/sync/snapshot';
import { computeSyncDiff } from '@/lib/sync/diff';
import { applySyncPlan } from '@/lib/sync/apply';
import { createSyncMaterializeAdapter } from '@/lib/sync/materializeAdapter';
import { materializeCanonicalTrackIds } from '@/lib/recs/materialize';
import { getSyncPair, createSyncRun, updateSyncRun } from '@/lib/sync/syncStore';
import type { SyncConfig, SyncPlan, SyncApplyResult, SyncPreviewResult, SyncPreviewTrack, SyncDiffItem } from '@/lib/sync/types';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';

export interface SyncMatchThresholds {
  convert: number;
  manual: number;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function snapshotToPreviewTracks(snapshot: PlaylistSnapshot): SyncPreviewTrack[] {
  return snapshot.items.map((item) => ({
    canonicalTrackId: item.canonicalTrackId,
    title: item.title,
    artists: item.artists,
    durationMs: item.durationMs,
  }));
}

/**
 * Validate which "add" items can actually be materialized on the target
 * provider. Performs ISRC lookup + text search without saving anything.
 * Enriches each item with `resolvedTargetTrackId` and `materializeStatus`.
 */
async function validateMaterialization(
  plan: SyncPlan,
  providers: Map<MusicProviderId, MusicProvider>,
): Promise<void> {
  // Group add items by target provider
  const addsByProvider = new Map<MusicProviderId, SyncDiffItem[]>();
  for (const item of plan.items) {
    if (item.action !== 'add') {
      item.materializeStatus = 'unchecked';
      continue;
    }
    const existing = addsByProvider.get(item.targetProvider) ?? [];
    existing.push(item);
    addsByProvider.set(item.targetProvider, existing);
  }

  for (const [providerId, items] of addsByProvider) {
    const provider = providers.get(providerId);
    if (!provider) {
      for (const item of items) {
        item.materializeStatus = 'not_found';
      }
      continue;
    }

    const adapter = createSyncMaterializeAdapter(provider, providerId);
    const canonicalIds = items.map((i) => i.canonicalTrackId);

    try {
      const result = await materializeCanonicalTrackIds({
        provider: providerId,
        canonicalTrackIds: canonicalIds,
        adapter,
      });

      const unresolvedSet = new Set(result.unresolvedCanonicalIds);
      const resolvedMap = new Map<string, string>();

      // Map canonical IDs to resolved provider track IDs by position
      let resolvedIdx = 0;
      for (const canonicalId of canonicalIds) {
        if (!unresolvedSet.has(canonicalId)) {
          if (resolvedIdx < result.trackIds.length) {
            resolvedMap.set(canonicalId, result.trackIds[resolvedIdx]!);
            resolvedIdx++;
          }
        }
      }

      for (const item of items) {
        const resolved = resolvedMap.get(item.canonicalTrackId);
        if (resolved) {
          item.resolvedTargetTrackId = resolved;
          item.materializeStatus = 'resolved';
        } else {
          item.materializeStatus = 'not_found';
        }
      }
    } catch (error) {
      console.warn('[sync/runner] materialization validation failed', { providerId, error });
      for (const item of items) {
        item.materializeStatus = 'not_found';
      }
    }
  }

  // Update summary unresolved count based on actual materialization
  plan.summary.unresolved = plan.items.filter(
    (i) => i.action === 'add' && i.materializeStatus === 'not_found',
  ).length;
}

/**
 * Capture snapshots from both playlists, compute the diff, and validate
 * materialization on the target provider — without applying any changes.
 */
export async function previewSync(
  config: SyncConfig,
  matchThresholds?: SyncMatchThresholds,
): Promise<SyncPreviewResult> {
  const sourceProvider = getMusicProvider(config.sourceProvider);
  const targetProvider = getMusicProvider(config.targetProvider);

  const snapshotOpts: SnapshotOptions | undefined = matchThresholds
    ? { resolveOptions: { thresholds: matchThresholds } }
    : undefined;

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    captureSnapshot(sourceProvider, config.sourceProvider, config.sourcePlaylistId, snapshotOpts),
    captureSnapshot(targetProvider, config.targetProvider, config.targetPlaylistId, snapshotOpts),
  ]);

  const diffOpts = matchThresholds ? { thresholds: matchThresholds } : undefined;
  const plan = computeSyncDiff(sourceSnapshot, targetSnapshot, config.direction, diffOpts);

  // Validate which tracks can actually be found on the target providers
  const providerMap = new Map<MusicProviderId, MusicProvider>([
    [config.sourceProvider, sourceProvider],
    [config.targetProvider, targetProvider],
  ]);
  await validateMaterialization(plan, providerMap);

  console.debug('[sync/runner] preview complete', {
    direction: config.direction,
    toAdd: plan.summary.toAdd,
    toRemove: plan.summary.toRemove,
    unresolved: plan.summary.unresolved,
  });

  return {
    plan,
    sourceTracks: snapshotToPreviewTracks(sourceSnapshot),
    targetTracks: snapshotToPreviewTracks(targetSnapshot),
  };
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
export async function executeSync(
  config: ExecuteSyncConfig,
  matchThresholds?: SyncMatchThresholds,
): Promise<ExecuteSyncResult> {
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

    const previewResult = await previewSync(config, matchThresholds);
    const plan = previewResult.plan;
    const result = await applySyncPlan(plan);

    if (runId) {
      const hasErrors = result.errors.length > 0;
      const warnings = result.unresolved.map((info) => ({
        canonicalTrackId: info.canonicalTrackId,
        title: info.title,
        artists: info.artists,
        reason: info.reason === 'not_found' ? 'Not found on target provider'
          : info.reason === 'materialize_failed' ? 'Search on target provider failed'
          : 'No track mapping for target provider',
      }));
      updateSyncRun(runId, {
        status: hasErrors ? 'failed' : 'done',
        tracksAdded: result.added,
        tracksRemoved: result.removed,
        tracksUnresolved: result.unresolved.length,
        errorMessage: hasErrors ? result.errors.join('; ') : null,
        warningsJson: warnings.length > 0 ? JSON.stringify(warnings) : null,
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
// Apply a pre-computed plan
// ---------------------------------------------------------------------------

/**
 * Apply a pre-computed `SyncPlan` without re-running preview.
 * When a `syncPairId` is supplied, a `SyncRun` record is created and tracked.
 */
export async function applySyncPlanWithRun(
  plan: SyncPlan,
  syncPairId?: string,
  _matchThresholds?: SyncMatchThresholds,
): Promise<{ result: SyncApplyResult; runId?: string }> {
  let runId: string | undefined;

  try {
    if (syncPairId) {
      const run = createSyncRun({
        syncPairId,
        direction: plan.direction,
      });
      runId = run.id;
      updateSyncRun(runId, { status: 'executing' });
    }

    const result = await applySyncPlan(plan);

    if (runId) {
      const hasErrors = result.errors.length > 0;
      const warnings = result.unresolved.map((info) => ({
        canonicalTrackId: info.canonicalTrackId,
        title: info.title,
        artists: info.artists,
        reason: info.reason === 'not_found' ? 'Not found on target provider'
          : info.reason === 'materialize_failed' ? 'Search on target provider failed'
          : 'No track mapping for target provider',
      }));
      updateSyncRun(runId, {
        status: hasErrors ? 'failed' : 'done',
        tracksAdded: result.added,
        tracksRemoved: result.removed,
        tracksUnresolved: result.unresolved.length,
        errorMessage: hasErrors ? result.errors.join('; ') : null,
        warningsJson: warnings.length > 0 ? JSON.stringify(warnings) : null,
        completedAt: new Date().toISOString(),
      });
    }

    return runId !== undefined ? { result, runId } : { result };
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
export async function previewSyncFromPair(
  syncPairId: string,
  createdBy?: string,
  matchThresholds?: SyncMatchThresholds,
): Promise<SyncPreviewResult> {
  const pair = getSyncPair(syncPairId, createdBy);
  if (!pair) {
    throw new Error(`Sync pair not found: ${syncPairId}`);
  }

  return previewSync(buildConfigFromPair(pair), matchThresholds);
}

/**
 * Look up a saved sync pair and execute a full sync, recording a SyncRun.
 * When `createdBy` is provided, the pair must belong to that user.
 */
export async function executeSyncFromPair(
  syncPairId: string,
  createdBy?: string,
  matchThresholds?: SyncMatchThresholds,
): Promise<{ plan: SyncPlan; result: SyncApplyResult; runId: string }> {
  const pair = getSyncPair(syncPairId, createdBy);
  if (!pair) {
    throw new Error(`Sync pair not found: ${syncPairId}`);
  }

  const config = buildConfigFromPair(pair);
  const outcome = await executeSync({ ...config, syncPairId }, matchThresholds);

  // runId is always defined when syncPairId is provided
  return { plan: outcome.plan, result: outcome.result, runId: outcome.runId! };
}
