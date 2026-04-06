/**
 * Unified sync executor.
 *
 * Single execution path for both manual (frontend-triggered) and
 * scheduled (background worker) sync operations. Uses DB-stored tokens
 * via createBackgroundProvider so no browser session is needed.
 */

import { createBackgroundProvider } from '@/lib/sync/backgroundProvider';
import { captureSnapshot, fetchPlaylistSnapshotId } from '@/lib/sync/snapshot';
import type { SnapshotOptions } from '@/lib/sync/snapshot';
import { computeSyncDiff } from '@/lib/sync/diff';
import { applySyncPlan } from '@/lib/sync/apply';
import { getSessionFromDb } from '@/lib/auth/sessionFromDb';
import {
  createSyncRun,
  updateSyncRun,
  advanceNextRunAt,
  setNextRunAtFromNow,
  incrementConsecutiveFailures,
  resetConsecutiveFailures,
  updateSyncPairSnapshotIds,
  updateSyncPairBidirectionalMetadata,
} from '@/lib/sync/syncStore';
import type { SyncPair, SyncTrigger, SyncWarning, SyncApplyResult, SyncPlan, SyncDiffItem } from '@/lib/sync/types';
import { getCanonicalTrackMetadata } from '@/lib/resolver/canonicalResolver';
import type { PlaylistSnapshot, CanonicalSnapshotItem } from '@/lib/sync/snapshot';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { ProviderApiError } from '@/lib/music-provider/types';
import { RateLimitError } from '@/lib/spotify/rateLimit';
import { DEFAULT_MATCH_THRESHOLDS } from '@/lib/matching/config';

export interface SyncMatchThresholds {
  convert: number;
  manual: number;
}

export interface ExecuteSyncOptions {
  pair: SyncPair;
  triggeredBy: SyncTrigger;
  matchThresholds?: SyncMatchThresholds | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUnresolvedReason(reason: string): string {
  if (reason === 'not_found') return 'Not found on target provider';
  if (reason === 'materialize_failed') return 'Search on target provider failed';
  return 'No track mapping for target provider';
}

/**
 * Resolve the DB userId for a given provider from the sync pair.
 * Uses providerUserIds map (set at pair creation); falls back to
 * pair.createdBy for legacy pairs that predate the migration.
 */
function resolveUserIdForProvider(pair: SyncPair, providerId: MusicProviderId): string {
  return pair.providerUserIds[providerId] ?? pair.createdBy;
}

type ProviderSessions = {
  sourceUserId: string;
  targetUserId: string;
  missingProvider?: MusicProviderId;
  missingUserId?: string;
};

async function resolveProviderSessions(pair: SyncPair): Promise<ProviderSessions> {
  const sourceUserId = resolveUserIdForProvider(pair, pair.sourceProvider);
  const targetUserId = resolveUserIdForProvider(pair, pair.targetProvider);

  const [sourceSession, targetSession] = await Promise.all([
    getSessionFromDb(sourceUserId, pair.sourceProvider),
    getSessionFromDb(targetUserId, pair.targetProvider),
  ]);

  if (!sourceSession) {
    return { sourceUserId, targetUserId, missingProvider: pair.sourceProvider, missingUserId: sourceUserId };
  }

  if (!targetSession) {
    return { sourceUserId, targetUserId, missingProvider: pair.targetProvider, missingUserId: targetUserId };
  }

  return { sourceUserId, targetUserId };
}

function markRunFailedForMissingSession(
  runId: string,
  pair: SyncPair,
  isScheduled: boolean,
  missingProvider: MusicProviderId,
  missingUserId: string,
): void {
  updateSyncRun(runId, {
    status: 'failed',
    errorMessage: `No valid session for ${missingProvider}, user=${missingUserId}`,
    completedAt: new Date().toISOString(),
  });

  if (isScheduled) {
    incrementConsecutiveFailures(pair.id);
    advanceNextRunAt(pair.id);
  }
}

function finishScheduledSuccess(pair: SyncPair): void {
  resetConsecutiveFailures(pair.id);
  if (pair.syncInterval !== 'off') {
    advanceNextRunAt(pair.id);
  }
}

function parseRetryAfterMsFromError(error: unknown, message: string): number | undefined {
  if (error instanceof RateLimitError) {
    return error.retryAfterMs;
  }

  if (error instanceof ProviderApiError && error.status === 429 && typeof error.details === 'string') {
    const detailsMatch = error.details.match(/retryAfter\s*[=:]\s*(\d+)/i);
    if (detailsMatch?.[1]) {
      return Number(detailsMatch[1]) * 1000;
    }
  }

  const secondsMatch = message.match(/retry after\s+(\d+)\s+second/i);
  if (secondsMatch?.[1]) {
    return Number(secondsMatch[1]) * 1000;
  }

  return undefined;
}

function handleScheduledFailure(pair: SyncPair, message: string, error: unknown): void {
  const isAuthError =
    message.includes('No valid session') ||
    message.includes('invalid_grant') ||
    message.includes('revoked');

  const retryAfterMs = parseRetryAfterMsFromError(error, message);

  incrementConsecutiveFailures(pair.id);

  if (retryAfterMs && (pair.sourceProvider === 'spotify' || pair.targetProvider === 'spotify')) {
    setNextRunAtFromNow(pair.id, retryAfterMs);
    return;
  }

  if (!isAuthError) {
    advanceNextRunAt(pair.id);
  }
}

function buildRunUpdate(result: SyncApplyResult): Record<string, unknown> {
  const hasErrors = result.errors.length > 0;
  const warnings: SyncWarning[] = result.unresolved.map((info) => ({
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

function uniqueCanonicalIds(snapshot: PlaylistSnapshot): string[] {
  return Array.from(new Set(snapshot.items.map((item) => item.canonicalTrackId))).sort();
}

function orderCanonicalIds(snapshot: PlaylistSnapshot): string[] {
  return snapshot.items.map((item) => item.canonicalTrackId);
}

function arraysEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildSnapshotIndex(snapshot: PlaylistSnapshot): Map<string, CanonicalSnapshotItem> {
  const index = new Map<string, CanonicalSnapshotItem>();
  for (const item of snapshot.items) {
    if (!index.has(item.canonicalTrackId)) {
      index.set(item.canonicalTrackId, item);
    }
  }
  return index;
}

function buildDiffItemFromSnapshots(
  canonicalTrackId: string,
  action: 'add' | 'remove',
  targetProvider: MusicProviderId,
  sourceIndex: Map<string, CanonicalSnapshotItem>,
  targetIndex: Map<string, CanonicalSnapshotItem>,
): SyncDiffItem {
  const snapshotItem = sourceIndex.get(canonicalTrackId) ?? targetIndex.get(canonicalTrackId);
  if (snapshotItem) {
    return {
      canonicalTrackId,
      action,
      targetProvider,
      title: snapshotItem.title,
      artists: snapshotItem.artists,
      durationMs: snapshotItem.durationMs,
      confidence: snapshotItem.matchScore,
      providerTrackId: snapshotItem.providerTrackId,
    };
  }

  const meta = getCanonicalTrackMetadata(canonicalTrackId);
  return {
    canonicalTrackId,
    action,
    targetProvider,
    title: meta?.titleNorm ?? '',
    artists: meta?.artistNorm ? [meta.artistNorm] : [],
    durationMs: meta?.durationSec ? meta.durationSec * 1000 : 0,
    confidence: 0,
    providerTrackId: null,
  };
}

function chooseOrderWinner(
  pair: SyncPair,
  sourceOrderChanged: boolean,
  targetOrderChanged: boolean,
): MusicProviderId {
  if (sourceOrderChanged && !targetOrderChanged) return pair.sourceProvider;
  if (targetOrderChanged && !sourceOrderChanged) return pair.targetProvider;
  if (!sourceOrderChanged && !targetOrderChanged) return pair.sourceProvider;

  const sourceTs = pair.sourceLastChangeAt ? Date.parse(pair.sourceLastChangeAt) : Number.NaN;
  const targetTs = pair.targetLastChangeAt ? Date.parse(pair.targetLastChangeAt) : Number.NaN;
  if (Number.isFinite(sourceTs) && Number.isFinite(targetTs) && sourceTs !== targetTs) {
    return sourceTs > targetTs ? pair.sourceProvider : pair.targetProvider;
  }

  return pair.sourceProvider;
}

function buildUnifiedOrder(
  mergedSet: Set<string>,
  winnerOrder: string[],
  loserOrder: string[],
): string[] {
  const unified: string[] = [];
  const seen = new Set<string>();

  const appendFrom = (arr: string[]) => {
    for (const id of arr) {
      if (!mergedSet.has(id) || seen.has(id)) continue;
      unified.push(id);
      seen.add(id);
    }
  };

  appendFrom(winnerOrder);
  appendFrom(loserOrder);

  const missing = Array.from(mergedSet).filter((id) => !seen.has(id)).sort();
  unified.push(...missing);
  return unified;
}

function computeBidirectionalPlanWithMetadata(
  pair: SyncPair,
  sourceSnapshot: PlaylistSnapshot,
  targetSnapshot: PlaylistSnapshot,
  manualThreshold: number,
): {
  plan: SyncPlan;
  sourceMembershipChanged: boolean;
  targetMembershipChanged: boolean;
  sourceOrderChanged: boolean;
  targetOrderChanged: boolean;
} {
  const sourceCurrentMembership = uniqueCanonicalIds(sourceSnapshot);
  const targetCurrentMembership = uniqueCanonicalIds(targetSnapshot);
  const sourceCurrentOrder = orderCanonicalIds(sourceSnapshot);
  const targetCurrentOrder = orderCanonicalIds(targetSnapshot);

  const sourceBaselineMembership = pair.sourceMembershipBaseline ?? sourceCurrentMembership;
  const targetBaselineMembership = pair.targetMembershipBaseline ?? targetCurrentMembership;
  const sourceBaselineOrder = pair.sourceOrderBaseline ?? sourceCurrentOrder;
  const targetBaselineOrder = pair.targetOrderBaseline ?? targetCurrentOrder;

  const sourceMembershipChanged = !arraysEqual(sourceCurrentMembership, sourceBaselineMembership);
  const targetMembershipChanged = !arraysEqual(targetCurrentMembership, targetBaselineMembership);
  const sourceOrderChanged = !arraysEqual(sourceCurrentOrder, sourceBaselineOrder);
  const targetOrderChanged = !arraysEqual(targetCurrentOrder, targetBaselineOrder);

  const baselineSet = new Set<string>([
    ...sourceBaselineMembership,
    ...targetBaselineMembership,
  ]);
  const sourceSet = new Set<string>(sourceCurrentMembership);
  const targetSet = new Set<string>(targetCurrentMembership);

  const sourceAdds = new Set<string>(Array.from(sourceSet).filter((id) => !baselineSet.has(id)));
  const targetAdds = new Set<string>(Array.from(targetSet).filter((id) => !baselineSet.has(id)));
  const sourceRemoves = new Set<string>(Array.from(baselineSet).filter((id) => !sourceSet.has(id)));
  const targetRemoves = new Set<string>(Array.from(baselineSet).filter((id) => !targetSet.has(id)));
  const removedByAny = new Set<string>([...sourceRemoves, ...targetRemoves]);

  const mergedSet = new Set<string>([
    ...baselineSet,
    ...sourceAdds,
    ...targetAdds,
  ]);
  for (const removed of removedByAny) {
    mergedSet.delete(removed);
  }

  const sourceIndex = buildSnapshotIndex(sourceSnapshot);
  const targetIndex = buildSnapshotIndex(targetSnapshot);
  const items: SyncDiffItem[] = [];

  for (const id of mergedSet) {
    if (!sourceSet.has(id)) {
      items.push(buildDiffItemFromSnapshots(id, 'add', pair.sourceProvider, sourceIndex, targetIndex));
    }
    if (!targetSet.has(id)) {
      items.push(buildDiffItemFromSnapshots(id, 'add', pair.targetProvider, sourceIndex, targetIndex));
    }
  }

  for (const id of sourceSet) {
    if (!mergedSet.has(id)) {
      items.push(buildDiffItemFromSnapshots(id, 'remove', pair.sourceProvider, sourceIndex, targetIndex));
    }
  }
  for (const id of targetSet) {
    if (!mergedSet.has(id)) {
      items.push(buildDiffItemFromSnapshots(id, 'remove', pair.targetProvider, sourceIndex, targetIndex));
    }
  }

  const winner = chooseOrderWinner(pair, sourceOrderChanged, targetOrderChanged);
  const winnerOrder = winner === pair.sourceProvider ? sourceCurrentOrder : targetCurrentOrder;
  const loserOrder = winner === pair.sourceProvider ? targetCurrentOrder : sourceCurrentOrder;
  const unifiedOrder = buildUnifiedOrder(mergedSet, winnerOrder, loserOrder);

  const plan: SyncPlan = {
    sourceProvider: pair.sourceProvider,
    sourcePlaylistId: pair.sourcePlaylistId,
    targetProvider: pair.targetProvider,
    targetPlaylistId: pair.targetPlaylistId,
    direction: pair.direction,
    items,
    targetOrder: {
      [pair.sourceProvider]: unifiedOrder,
      [pair.targetProvider]: unifiedOrder,
    },
    summary: {
      toAdd: items.filter((item) => item.action === 'add').length,
      toRemove: items.filter((item) => item.action === 'remove').length,
      unresolved: items.filter((item) => item.confidence < manualThreshold).length,
    },
  };

  return {
    plan,
    sourceMembershipChanged,
    targetMembershipChanged,
    sourceOrderChanged,
    targetOrderChanged,
  };
}

/**
 * Check whether both playlists are unchanged since the last sync by
 * comparing lightweight snapshot IDs. Returns true if we can skip the sync.
 */
async function arePlaylistsUnchanged(
  pair: SyncPair,
  sourceProvider: MusicProvider,
  targetProvider: MusicProvider,
): Promise<boolean> {
  if (!pair.sourceSnapshotId || !pair.targetSnapshotId) return false;

  const [currentSourceId, currentTargetId] = await Promise.all([
    fetchPlaylistSnapshotId(sourceProvider, pair.sourcePlaylistId),
    fetchPlaylistSnapshotId(targetProvider, pair.targetPlaylistId),
  ]);

  return !!(
    currentSourceId &&
    currentTargetId &&
    currentSourceId === pair.sourceSnapshotId &&
    currentTargetId === pair.targetSnapshotId
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a SyncRun record synchronously and return the run ID.
 * The run starts in 'pending' status. Call executeSyncRun() to execute.
 */
export function initiateSyncRun(options: ExecuteSyncOptions): string {
  const run = createSyncRun({
    syncPairId: options.pair.id,
    direction: options.pair.direction,
    triggeredBy: options.triggeredBy,
  });
  return run.id;
}

/**
 * Execute the sync for an already-created SyncRun.
 *
 * Captures snapshots, computes the diff, applies the plan, and records
 * the result on the run. Errors are caught and written to the run record
 * (the function never throws).
 */
export async function executeSyncRun(
  runId: string,
  options: ExecuteSyncOptions,
): Promise<void> {
  const { pair, triggeredBy, matchThresholds } = options;
  const isScheduled = triggeredBy === 'scheduler';

  try {
    const sessions = await resolveProviderSessions(pair);
    if (sessions.missingProvider && sessions.missingUserId) {
      markRunFailedForMissingSession(runId, pair, isScheduled, sessions.missingProvider, sessions.missingUserId);
      return;
    }

    updateSyncRun(runId, { status: 'executing' });

    const sourceProvider = await createBackgroundProvider(sessions.sourceUserId, pair.sourceProvider);
    const targetProvider = await createBackgroundProvider(sessions.targetUserId, pair.targetProvider);

    // Snapshot short-circuit: if both playlists are unchanged, skip the sync
    if (await arePlaylistsUnchanged(pair, sourceProvider, targetProvider)) {
      updateSyncRun(runId, {
        status: 'done',
        tracksAdded: 0,
        tracksRemoved: 0,
        tracksUnresolved: 0,
        completedAt: new Date().toISOString(),
      });
      finishScheduledSuccess(pair);
      console.debug('[sync/executor] skipped — both playlists unchanged', {
        runId,
        pairId: pair.id,
      });
      return;
    }

    const snapshotOpts: SnapshotOptions | undefined = matchThresholds
      ? { resolveOptions: { thresholds: matchThresholds } }
      : undefined;

    const [sourceSnapshot, targetSnapshot] = await Promise.all([
      captureSnapshot(sourceProvider, pair.sourceProvider, pair.sourcePlaylistId, snapshotOpts),
      captureSnapshot(targetProvider, pair.targetProvider, pair.targetPlaylistId, snapshotOpts),
    ]);

    const diffOpts = matchThresholds ? { thresholds: matchThresholds } : undefined;
    const manualThreshold = matchThresholds?.manual ?? DEFAULT_MATCH_THRESHOLDS.manual;
    const bidirectionalPlan = pair.direction === 'bidirectional'
      ? computeBidirectionalPlanWithMetadata(pair, sourceSnapshot, targetSnapshot, manualThreshold)
      : null;
    const plan = bidirectionalPlan
      ? bidirectionalPlan.plan
      : computeSyncDiff(sourceSnapshot, targetSnapshot, pair.direction, diffOpts);

    const providerOverrides: Partial<Record<MusicProviderId, typeof sourceProvider>> = {
      [pair.sourceProvider]: sourceProvider,
      [pair.targetProvider]: targetProvider,
    };
    const result = await applySyncPlan(plan, providerOverrides);

    updateSyncRun(runId, buildRunUpdate(result));

    // Persist snapshot IDs so subsequent syncs can short-circuit
    updateSyncPairSnapshotIds(
      pair.id,
      sourceSnapshot.snapshotId,
      targetSnapshot.snapshotId,
    );

    const [postSourceSnapshot, postTargetSnapshot] = await Promise.all([
      captureSnapshot(sourceProvider, pair.sourceProvider, pair.sourcePlaylistId, snapshotOpts),
      captureSnapshot(targetProvider, pair.targetProvider, pair.targetPlaylistId, snapshotOpts),
    ]);

    const nowIso = new Date().toISOString();
    updateSyncPairBidirectionalMetadata(pair.id, {
      sourceMembershipBaseline: uniqueCanonicalIds(postSourceSnapshot),
      targetMembershipBaseline: uniqueCanonicalIds(postTargetSnapshot),
      sourceOrderBaseline: orderCanonicalIds(postSourceSnapshot),
      targetOrderBaseline: orderCanonicalIds(postTargetSnapshot),
      ...(bidirectionalPlan && (bidirectionalPlan.sourceMembershipChanged || bidirectionalPlan.sourceOrderChanged)
        ? { sourceLastChangeAt: nowIso }
        : {}),
      ...(bidirectionalPlan && (bidirectionalPlan.targetMembershipChanged || bidirectionalPlan.targetOrderChanged)
        ? { targetLastChangeAt: nowIso }
        : {}),
    });

    // Any successful sync resets failures and advances the schedule
    finishScheduledSuccess(pair);

    console.debug('[sync/executor] complete', {
      runId,
      pairId: pair.id,
      triggeredBy,
      added: result.added,
      removed: result.removed,
      unresolved: result.unresolved.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateSyncRun(runId, {
      status: 'failed',
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });

    if (isScheduled) {
      handleScheduledFailure(pair, message, error);
    }

    console.error('[sync/executor] failed', { pairId: pair.id, runId, triggeredBy, error: message });
  }
}

/**
 * Convenience: create the run and execute it in one call.
 * Used by the scheduler which needs to await completion for concurrency tracking.
 */
export async function executeSyncPair(options: ExecuteSyncOptions): Promise<string> {
  const runId = initiateSyncRun(options);
  await executeSyncRun(runId, options);
  return runId;
}
