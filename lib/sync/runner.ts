import { getMusicProvider } from '@/lib/music-provider';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { captureSnapshot } from '@/lib/sync/snapshot';
import type { SnapshotOptions } from '@/lib/sync/snapshot';
import { applySyncPlan } from '@/lib/sync/apply';
import { buildSyncPlan, resolvePlanContext, type SyncPlanContext } from '@/lib/sync/planner';
import { createSyncMaterializeAdapter } from '@/lib/sync/materializeAdapter';
import { materializeCanonicalTrackIds } from '@/lib/recs/materialize';
import { getSyncPair, createSyncRun, updateSyncRun, resetConsecutiveFailures, advanceNextRunAt } from '@/lib/sync/syncStore';
import type { SyncConfig, SyncPlan, SyncApplyResult, SyncPreviewResult, SyncPreviewTrack, SyncDiffItem } from '@/lib/sync/types';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';
import { recordPostSyncState, type SyncMatchThresholds } from '@/lib/sync/executor';
import { loadPairMirror } from '@/lib/sync/mirrorStore';
import { isSyncPreviewRunCancellationRequested, updateSyncPreviewRun } from '@/lib/sync/previewStore';
import { createBackgroundProvider } from '@/lib/sync/backgroundProvider';

const PREVIEW_VALIDATION_BATCH_SIZE = 50;
const PREVIEW_VALIDATION_BATCH_TIMEOUT_MS = 20_000;
const PREVIEW_VALIDATION_BATCH_TIMEOUT_BACKOFF_MS = 10_000;
const PREVIEW_VALIDATION_MAX_ATTEMPTS = 3;
const PREVIEW_RUN_TIMEOUT_MS = 10 * 60_000;
const PREVIEW_PROGRESS_CAPTURE_START = 5;
const PREVIEW_PROGRESS_CAPTURE_DONE = 35;
const PREVIEW_PROGRESS_DIFF_DONE = 55;
const PREVIEW_PROGRESS_VALIDATION_START = 56;
const PREVIEW_PROGRESS_VALIDATION_END = 96;
const PREVIEW_PROGRESS_FINALIZING = 98;

// Re-export for backward compatibility with apply route
export type { SyncMatchThresholds };

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
 * Group "add" items by target provider. Non-add items are marked as 'unchecked'.
 */
function groupAddItemsByProvider(
  items: SyncDiffItem[],
): Map<MusicProviderId, SyncDiffItem[]> {
  const addsByProvider = new Map<MusicProviderId, SyncDiffItem[]>();
  for (const item of items) {
    if (item.action !== 'add') {
      item.materializeStatus = 'unchecked';
      continue;
    }
    if (item.materializeStatus === 'skipped') {
      continue;
    }
    const existing = addsByProvider.get(item.targetProvider) ?? [];
    existing.push(item);
    addsByProvider.set(item.targetProvider, existing);
  }
  return addsByProvider;
}

/**
 * Build a map from canonical track ID to resolved provider track ID using
 * the positional mapping from the materialization result.
 */
function buildResolvedMap(
  canonicalIds: string[],
  result: { trackIds: string[]; unresolvedCanonicalIds: string[] },
): Map<string, string> {
  const unresolvedSet = new Set(result.unresolvedCanonicalIds);
  const resolvedMap = new Map<string, string>();

  let resolvedIdx = 0;
  for (const canonicalId of canonicalIds) {
    if (!unresolvedSet.has(canonicalId) && resolvedIdx < result.trackIds.length) {
      resolvedMap.set(canonicalId, result.trackIds[resolvedIdx]!);
      resolvedIdx++;
    }
  }

  return resolvedMap;
}

/**
 * Apply materialization results to diff items: set `resolvedTargetTrackId`
 * and `materializeStatus` on each item.
 */
function applyResolutionToItems(
  items: SyncDiffItem[],
  resolvedMap: Map<string, string>,
  timedOutIds?: Set<string>,
): void {
  for (const item of items) {
    const resolved = resolvedMap.get(item.canonicalTrackId);
    if (resolved) {
      item.resolvedTargetTrackId = resolved;
      item.materializeStatus = 'resolved';
    } else if (timedOutIds?.has(item.canonicalTrackId)) {
      item.materializeStatus = 'timed_out';
    } else {
      item.materializeStatus = 'not_found';
    }
  }
}

function isMaterializationTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Materialization batch timed out after');
}

async function materializeBatchWithTimeout(
  providerId: MusicProviderId,
  batchIds: string[],
  adapter: ReturnType<typeof createSyncMaterializeAdapter>,
  timeoutMs: number,
  matchThresholds?: SyncMatchThresholds,
  onItemProcessed?: () => void,
): Promise<{ trackIds: string[]; unresolvedCanonicalIds: string[] }> {
  const materializeInput = {
    provider: providerId,
    canonicalTrackIds: batchIds,
    adapter,
    ...(matchThresholds ? { thresholds: matchThresholds } : {}),
    ...(onItemProcessed ? { onCanonicalProcessed: onItemProcessed } : {}),
  };

  return Promise.race([
    materializeCanonicalTrackIds(materializeInput),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Materialization batch timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Mark all items in the list with `materializeStatus = 'not_found'`.
 */
function markAllNotFound(items: SyncDiffItem[]): void {
  for (const item of items) {
    item.materializeStatus = 'not_found';
  }
}

/**
 * Validate which "add" items can actually be materialized on the target
 * provider. Performs ISRC lookup + text search without saving anything.
 * Enriches each item with `resolvedTargetTrackId` and `materializeStatus`.
 */
async function validateMaterialization(
  plan: SyncPlan,
  providers: Map<MusicProviderId, MusicProvider>,
  matchThresholds?: SyncMatchThresholds,
  onProgress?: (phase: string, progress: number) => void,
): Promise<void> {
  const addsByProvider = groupAddItemsByProvider(plan.items);
  const totalAdds = Array.from(addsByProvider.values()).reduce((sum, items) => sum + items.length, 0);
  let processedAdds = 0;

  const reportProgress = () => {
    if (totalAdds === 0) {
      onProgress?.('validating_matches', PREVIEW_PROGRESS_VALIDATION_END);
      return;
    }

    const ratio = Math.min(1, processedAdds / totalAdds);
    const progress = PREVIEW_PROGRESS_VALIDATION_START + Math.floor(
      ratio * (PREVIEW_PROGRESS_VALIDATION_END - PREVIEW_PROGRESS_VALIDATION_START),
    );
    onProgress?.('validating_matches', progress);
  };

  for (const [providerId, items] of addsByProvider) {
    const provider = providers.get(providerId);
    if (!provider) {
      markAllNotFound(items);
      processedAdds += items.length;
      reportProgress();
      continue;
    }

    await resolveProviderItems(providerId, provider, items, matchThresholds, () => {
      processedAdds += 1;
      reportProgress();
    });
  }

  // Update summary unresolved count based on actual materialization
  plan.summary.unresolved = plan.items.filter(
    (i) => i.action === 'add' && (i.materializeStatus === 'not_found' || i.materializeStatus === 'timed_out'),
  ).length;

  onProgress?.('validating_matches', PREVIEW_PROGRESS_VALIDATION_END);
}

/**
 * Materialize canonical track IDs against a single provider and apply
 * resolution results to the given diff items.
 */
async function resolveProviderItems(
  providerId: MusicProviderId,
  provider: MusicProvider,
  items: SyncDiffItem[],
  matchThresholds?: SyncMatchThresholds,
  onItemProcessed?: () => void,
): Promise<void> {
  const adapter = createSyncMaterializeAdapter(provider, providerId);
  const resolvedMap = new Map<string, string>();
  const unresolved = new Set<string>();
  const timedOut = new Set<string>();
  const canonicalIds = items.map((i) => i.canonicalTrackId);

  for (let i = 0; i < canonicalIds.length; i += PREVIEW_VALIDATION_BATCH_SIZE) {
    const batchIds = canonicalIds.slice(i, i + PREVIEW_VALIDATION_BATCH_SIZE);
    const { result, batchTimedOut } = await resolveProviderItemsBatch(
      providerId,
      batchIds,
      adapter,
      matchThresholds,
      onItemProcessed,
    );

    if (result) {
      const batchResolved = buildResolvedMap(batchIds, result);
      for (const [canonicalId, trackId] of batchResolved.entries()) {
        resolvedMap.set(canonicalId, trackId);
      }
      for (const unresolvedId of result.unresolvedCanonicalIds) {
        unresolved.add(unresolvedId);
      }
      continue;
    }

    for (const batchId of batchIds) {
      unresolved.add(batchId);
      if (batchTimedOut) {
        timedOut.add(batchId);
      }
    }
  }

  for (const unresolvedId of unresolved) {
    resolvedMap.delete(unresolvedId);
  }

  applyResolutionToItems(items, resolvedMap, timedOut);
}

async function resolveProviderItemsBatch(
  providerId: MusicProviderId,
  batchIds: string[],
  adapter: ReturnType<typeof createSyncMaterializeAdapter>,
  matchThresholds?: SyncMatchThresholds,
  onItemProcessed?: () => void,
): Promise<{ result: { trackIds: string[]; unresolvedCanonicalIds: string[] } | null; batchTimedOut: boolean }> {
  let result: { trackIds: string[]; unresolvedCanonicalIds: string[] } | null = null;
  let batchTimedOut = false;

  for (let attempt = 1; attempt <= PREVIEW_VALIDATION_MAX_ATTEMPTS; attempt += 1) {
    const timeoutMs = PREVIEW_VALIDATION_BATCH_TIMEOUT_MS
      + PREVIEW_VALIDATION_BATCH_TIMEOUT_BACKOFF_MS * (attempt - 1);

    try {
      result = await materializeBatchWithTimeout(
        providerId,
        batchIds,
        adapter,
        timeoutMs,
        matchThresholds,
        onItemProcessed,
      );
      return { result, batchTimedOut: false };
    } catch (error) {
      const timedOutError = isMaterializationTimeoutError(error);
      batchTimedOut = batchTimedOut || timedOutError;
      const canRetry = timedOutError && attempt < PREVIEW_VALIDATION_MAX_ATTEMPTS;

      console.warn('[sync/runner] materialization validation batch failed', {
        providerId,
        attempt,
        maxAttempts: PREVIEW_VALIDATION_MAX_ATTEMPTS,
        timeoutMs,
        canRetry,
        error,
      });

      if (!canRetry) {
        return { result: null, batchTimedOut };
      }
    }
  }

  return { result: null, batchTimedOut };
}

/** The saved pair with its local copy when there is one, otherwise a context without history. */
function loadPlanContext(config: SyncConfig): SyncPlanContext {
  const pair = config.syncPairId ? getSyncPair(config.syncPairId) : null;
  return resolvePlanContext(config, pair, pair ? loadPairMirror(pair.id) : undefined);
}

/**
 * Capture snapshots from both playlists, compute the diff, and validate
 * materialization on the target provider — without applying any changes.
 */
export async function previewSync(
  config: SyncConfig,
  matchThresholds?: SyncMatchThresholds,
  onProgress?: (phase: string, progress: number) => void,
  providerOverrides?: Partial<Record<MusicProviderId, MusicProvider>>,
): Promise<SyncPreviewResult> {
  const sourceProvider = providerOverrides?.[config.sourceProvider] ?? getMusicProvider(config.sourceProvider);
  const targetProvider = providerOverrides?.[config.targetProvider] ?? getMusicProvider(config.targetProvider);

  const snapshotOpts: SnapshotOptions | undefined = matchThresholds
    ? { resolveOptions: { thresholds: matchThresholds } }
    : undefined;

  const sourceSnapshotProgress = { fetched: 0, total: 1 };
  const targetSnapshotProgress = { fetched: 0, total: 1 };

  const reportCaptureProgress = () => {
    const combinedFetched = sourceSnapshotProgress.fetched + targetSnapshotProgress.fetched;
    const combinedTotal = Math.max(1, sourceSnapshotProgress.total + targetSnapshotProgress.total);
    const ratio = Math.min(1, combinedFetched / combinedTotal);
    const progress = PREVIEW_PROGRESS_CAPTURE_START + Math.floor(
      ratio * (PREVIEW_PROGRESS_CAPTURE_DONE - PREVIEW_PROGRESS_CAPTURE_START),
    );
    onProgress?.('capturing_snapshots', progress);
  };

  onProgress?.('capturing_snapshots', PREVIEW_PROGRESS_CAPTURE_START);

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    captureSnapshot(sourceProvider, config.sourceProvider, config.sourcePlaylistId, snapshotOpts, (snapshotProgress) => {
      sourceSnapshotProgress.fetched = snapshotProgress.fetched;
      sourceSnapshotProgress.total = Math.max(1, snapshotProgress.total);
      reportCaptureProgress();
    }),
    captureSnapshot(targetProvider, config.targetProvider, config.targetPlaylistId, snapshotOpts, (snapshotProgress) => {
      targetSnapshotProgress.fetched = snapshotProgress.fetched;
      targetSnapshotProgress.total = Math.max(1, snapshotProgress.total);
      reportCaptureProgress();
    }),
  ]);

  onProgress?.('capturing_snapshots', PREVIEW_PROGRESS_CAPTURE_DONE);
  onProgress?.('computing_diff', PREVIEW_PROGRESS_DIFF_DONE);

  // Same planner as scheduled runs; a saved pair contributes its baselines and skips.
  const { plan, sourceSnapshot: keyedSource, targetSnapshot: keyedTarget } = buildSyncPlan(
    loadPlanContext(config),
    sourceSnapshot,
    targetSnapshot,
    matchThresholds,
  );

  // Validate which tracks can actually be found on the target providers
  const providerMap = new Map<MusicProviderId, MusicProvider>([
    [config.sourceProvider, sourceProvider],
    [config.targetProvider, targetProvider],
  ]);
  onProgress?.('validating_matches', PREVIEW_PROGRESS_VALIDATION_START);
  await validateMaterialization(plan, providerMap, matchThresholds);
  onProgress?.('finalizing', PREVIEW_PROGRESS_FINALIZING);

  console.debug('[sync/runner] preview complete', {
    direction: config.direction,
    toAdd: plan.summary.toAdd,
    toRemove: plan.summary.toRemove,
    unresolved: plan.summary.unresolved,
  });

  return {
    plan,
    sourceTracks: snapshotToPreviewTracks(keyedSource),
    targetTracks: snapshotToPreviewTracks(keyedTarget),
  };
}

// ---------------------------------------------------------------------------
// Sync run tracking helpers (used by applySyncPlanWithRun)
// ---------------------------------------------------------------------------

function formatUnresolvedReason(reason: string): string {
  if (reason === 'not_found') return 'Not found on target provider';
  if (reason === 'materialize_failed') return 'Search on target provider failed';
  return 'No track mapping for target provider';
}

function buildRunUpdate(result: SyncApplyResult): Record<string, unknown> {
  const hasErrors = result.errors.length > 0;
  const warnings = result.unresolved.map((info) => ({
    canonicalTrackId: info.canonicalTrackId,
    title: info.title,
    artists: info.artists,
    reason: formatUnresolvedReason(info.reason),
    ...(info.targetProvider ? { targetProvider: info.targetProvider } : {}),
  }));

  return {
    status: hasErrors ? 'failed' : 'done',
    tracksAdded: result.added,
    tracksRemoved: result.removed,
    tracksUnresolved: result.unresolved.length,
    errorMessage: hasErrors ? result.errors.join('; ') : null,
    warningsJson: warnings.length > 0 ? JSON.stringify(warnings) : null,
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Apply a pre-computed plan (used by SyncPreviewDialog)
// ---------------------------------------------------------------------------

/**
 * Apply a pre-computed `SyncPlan` without re-running preview.
 * When a `syncPairId` is supplied, a `SyncRun` record is created and tracked.
 */
/**
 * Records the post-apply state as the pair's baseline, like scheduled runs do.
 * Failures are logged only: the plan itself was applied successfully.
 */
async function refreshPairBaselines(
  syncPairId: string,
  sideChanges: SyncPlan['sideChanges'],
  addedKeys: SyncApplyResult['addedKeys'],
  matchThresholds: SyncMatchThresholds | undefined,
): Promise<void> {
  const pair = getSyncPair(syncPairId);
  if (!pair) return;

  try {
    await recordPostSyncState({
      pair,
      sourceProvider: getMusicProvider(pair.sourceProvider),
      targetProvider: getMusicProvider(pair.targetProvider),
      snapshotOpts: matchThresholds ? { resolveOptions: { thresholds: matchThresholds } } : undefined,
      sideChanges,
      addedKeys,
    });
  } catch (error) {
    console.warn('[sync/runner] failed to refresh pair baselines', {
      syncPairId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function applySyncPlanWithRun(
  plan: SyncPlan,
  syncPairId?: string,
  matchThresholds?: SyncMatchThresholds,
): Promise<{ result: SyncApplyResult; runId?: string }> {
  if (!syncPairId) {
    const result = await applySyncPlan(plan);
    return { result };
  }

  const { id: runId } = createSyncRun({ syncPairId, direction: plan.direction });
  updateSyncRun(runId, { status: 'executing' });

  try {
    const result = await applySyncPlan(plan);
    updateSyncRun(runId, buildRunUpdate(result));
    await refreshPairBaselines(syncPairId, plan.sideChanges, result.addedKeys, matchThresholds);
    // A successful reviewed apply means the pair is healthy again.
    if (result.errors.length === 0) resetConsecutiveFailures(syncPairId);
    advanceNextRunAt(syncPairId, 'changed'); // the user is active here: a smart pair checks again soon
    return { result, runId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateSyncRun(runId, {
      status: 'failed',
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Pair-based convenience wrappers (preview only)
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
  createdBy?: string | string[],
  matchThresholds?: SyncMatchThresholds,
): Promise<SyncPreviewResult> {
  const pair = getSyncPair(syncPairId, createdBy);
  if (!pair) {
    throw new Error(`Sync pair not found: ${syncPairId}`);
  }

  return previewSync(buildConfigFromPair(pair), matchThresholds);
}

export async function executePreviewRun(
  runId: string,
  config: SyncConfig,
  matchThresholds?: SyncMatchThresholds,
  providerUserIds?: Partial<Record<MusicProviderId, string>>,
): Promise<void> {
  class SyncPreviewCancelledError extends Error {
    constructor() {
      super('Preview canceled by user.');
      this.name = 'SyncPreviewCancelledError';
    }
  }

  let isFinalized = false;

  const finalizeRun = (update: Parameters<typeof updateSyncPreviewRun>[1]) => {
    if (isFinalized) {
      return;
    }
    isFinalized = true;
    updateSyncPreviewRun(runId, update);
  };

  const markCancelled = () => {
    finalizeRun({
      status: 'failed',
      phase: 'cancelled',
      progress: 100,
      errorMessage: 'Preview canceled by user.',
      completedAt: new Date().toISOString(),
    });
  };

  try {
    if (isSyncPreviewRunCancellationRequested(runId)) {
      markCancelled();
      return;
    }

    updateSyncPreviewRun(runId, { status: 'executing', phase: 'capturing_snapshots', progress: 10 });

    let providerOverrides: Partial<Record<MusicProviderId, MusicProvider>> | undefined;
    if (providerUserIds) {
      const sourceUserId = providerUserIds[config.sourceProvider];
      const targetUserId = providerUserIds[config.targetProvider];

      if (sourceUserId && targetUserId) {
        const [sourceProvider, targetProvider] = await Promise.all([
          createBackgroundProvider(sourceUserId, config.sourceProvider),
          createBackgroundProvider(targetUserId, config.targetProvider),
        ]);

        providerOverrides = {
          [config.sourceProvider]: sourceProvider,
          [config.targetProvider]: targetProvider,
        };
      }
    }

    const result = await Promise.race([
      previewSync(config, matchThresholds, (phase, progress) => {
        if (isFinalized) {
          return;
        }

        if (isSyncPreviewRunCancellationRequested(runId)) {
          throw new SyncPreviewCancelledError();
        }

        updateSyncPreviewRun(runId, {
          phase,
          progress,
        });
      }, providerOverrides),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Preview run timed out on server.')), PREVIEW_RUN_TIMEOUT_MS);
      }),
    ]);

    if (isSyncPreviewRunCancellationRequested(runId)) {
      markCancelled();
      return;
    }

    finalizeRun({
      status: 'done',
      phase: 'done',
      progress: 100,
      resultJson: JSON.stringify(result),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof SyncPreviewCancelledError) {
      markCancelled();
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    finalizeRun({
      status: 'failed',
      phase: 'failed',
      progress: 100,
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });
  }
}
