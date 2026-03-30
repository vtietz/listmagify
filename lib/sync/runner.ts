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
): void {
  for (const item of items) {
    const resolved = resolvedMap.get(item.canonicalTrackId);
    if (resolved) {
      item.resolvedTargetTrackId = resolved;
      item.materializeStatus = 'resolved';
    } else {
      item.materializeStatus = 'not_found';
    }
  }
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
): Promise<void> {
  const addsByProvider = groupAddItemsByProvider(plan.items);

  for (const [providerId, items] of addsByProvider) {
    const provider = providers.get(providerId);
    if (!provider) {
      markAllNotFound(items);
      continue;
    }

    await resolveProviderItems(providerId, provider, items);
  }

  // Update summary unresolved count based on actual materialization
  plan.summary.unresolved = plan.items.filter(
    (i) => i.action === 'add' && i.materializeStatus === 'not_found',
  ).length;
}

/**
 * Materialize canonical track IDs against a single provider and apply
 * resolution results to the given diff items.
 */
async function resolveProviderItems(
  providerId: MusicProviderId,
  provider: MusicProvider,
  items: SyncDiffItem[],
): Promise<void> {
  const adapter = createSyncMaterializeAdapter(provider, providerId);
  const canonicalIds = items.map((i) => i.canonicalTrackId);

  try {
    const result = await materializeCanonicalTrackIds({
      provider: providerId,
      canonicalTrackIds: canonicalIds,
      adapter,
    });

    const resolvedMap = buildResolvedMap(canonicalIds, result);
    applyResolutionToItems(items, resolvedMap);
  } catch (error) {
    console.warn('[sync/runner] materialization validation failed', { providerId, error });
    markAllNotFound(items);
  }
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
// Sync run tracking helpers
// ---------------------------------------------------------------------------

/**
 * Map an unresolved reason code to a human-readable message.
 */
function formatUnresolvedReason(reason: string): string {
  if (reason === 'not_found') return 'Not found on target provider';
  if (reason === 'materialize_failed') return 'Search on target provider failed';
  return 'No track mapping for target provider';
}

/**
 * Build the run-completion update payload from a `SyncApplyResult`.
 */
function buildRunUpdate(result: SyncApplyResult): Record<string, unknown> {
  const hasErrors = result.errors.length > 0;
  const warnings = result.unresolved.map((info) => ({
    canonicalTrackId: info.canonicalTrackId,
    title: info.title,
    artists: info.artists,
    reason: formatUnresolvedReason(info.reason),
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

/**
 * Execute an async operation with optional sync-run lifecycle tracking.
 *
 * When `syncPairId` is provided, creates a `SyncRun`, marks it executing,
 * updates it on success/failure, and returns the `runId`. Otherwise the
 * operation runs without tracking.
 */
async function withSyncRunTracking<T>(
  syncPairId: string | undefined,
  direction: SyncConfig['direction'],
  operation: () => Promise<{ result: SyncApplyResult } & T>,
): Promise<{ runId?: string } & { result: SyncApplyResult } & T> {
  if (!syncPairId) {
    const outcome = await operation();
    return outcome;
  }

  const run = createSyncRun({ syncPairId, direction });
  const runId = run.id;
  updateSyncRun(runId, { status: 'executing' });

  try {
    const outcome = await operation();
    updateSyncRun(runId, buildRunUpdate(outcome.result));
    return { ...outcome, runId };
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
  const outcome = await withSyncRunTracking(
    config.syncPairId,
    config.direction,
    async () => {
      const previewResult = await previewSync(config, matchThresholds);
      const plan = previewResult.plan;
      const result = await applySyncPlan(plan);
      return { plan, result };
    },
  );

  console.debug('[sync/runner] execute complete', {
    runId: outcome.runId,
    added: outcome.result.added,
    removed: outcome.result.removed,
    errors: outcome.result.errors.length,
  });

  return outcome;
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
  return withSyncRunTracking(
    syncPairId,
    plan.direction,
    async () => {
      const result = await applySyncPlan(plan);
      return { result };
    },
  );
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
