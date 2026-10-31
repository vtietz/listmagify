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
import { applySyncPlan } from '@/lib/sync/apply';
import { buildSyncPlan } from '@/lib/sync/planner';
import { orderCanonicalIds, uniqueCanonicalIds } from '@/lib/sync/bidirectionalPlan';
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
import type { SyncPair, SyncTrigger, SyncWarning, SyncApplyResult, SyncPlan } from '@/lib/sync/types';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { ProviderApiError } from '@/lib/music-provider/types';
import { RateLimitError } from '@/lib/spotify/rateLimit';

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
  const retryAfterMs = parseRetryAfterMsFromError(error, message);

  incrementConsecutiveFailures(pair.id);

  if (retryAfterMs && (pair.sourceProvider === 'spotify' || pair.targetProvider === 'spotify')) {
    setNextRunAtFromNow(pair.id, retryAfterMs);
    return;
  }

  // Auth failures also wait for the next interval; re-login resumes the pair
  // immediately via resumeFailedSyncPairsForUser.
  advanceNextRunAt(pair.id);
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
  const { pair, triggeredBy } = options;
  const isScheduled = triggeredBy === 'scheduler';

  try {
    await executeSyncRunInternal(runId, options, isScheduled);
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

async function executeSyncRunInternal(
  runId: string,
  options: ExecuteSyncOptions,
  isScheduled: boolean,
): Promise<void> {
  const { pair, triggeredBy, matchThresholds } = options;
  const providers = await resolveExecutionProviders(runId, pair, isScheduled);
  if (!providers) {
    return;
  }
  const { sourceProvider, targetProvider } = providers;

  if (await arePlaylistsUnchanged(pair, sourceProvider, targetProvider)) {
    markRunSkippedUnchanged(runId, pair);
    return;
  }

  const snapshotOpts = buildSnapshotOptions(matchThresholds);

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    captureSnapshot(sourceProvider, pair.sourceProvider, pair.sourcePlaylistId, snapshotOpts),
    captureSnapshot(targetProvider, pair.targetProvider, pair.targetPlaylistId, snapshotOpts),
  ]);

  const plan = buildSyncPlan(pair, sourceSnapshot, targetSnapshot, matchThresholds);

  const providerOverrides: Partial<Record<MusicProviderId, typeof sourceProvider>> = {
    [pair.sourceProvider]: sourceProvider,
    [pair.targetProvider]: targetProvider,
  };
  const result = await applySyncPlan(plan, providerOverrides);

  updateSyncRun(runId, buildRunUpdate(result));
  updateSyncPairSnapshotIds(pair.id, sourceSnapshot.snapshotId, targetSnapshot.snapshotId);

  await refreshBidirectionalMetadata({
    pair,
    sourceProvider,
    targetProvider,
    snapshotOpts,
    sideChanges: plan.sideChanges,
  });

  finishScheduledSuccess(pair);
  console.debug('[sync/executor] complete', {
    runId,
    pairId: pair.id,
    triggeredBy,
    added: result.added,
    removed: result.removed,
    unresolved: result.unresolved.length,
  });
}

/**
 * Stores post-sync membership/order baselines so the next bidirectional run can
 * tell which side changed. Also used after applying a plan from the preview dialog.
 */
export async function refreshBidirectionalMetadata(params: {
  pair: SyncPair;
  sourceProvider: MusicProvider;
  targetProvider: MusicProvider;
  snapshotOpts: SnapshotOptions | undefined;
  sideChanges: SyncPlan['sideChanges'];
}): Promise<void> {
  const { pair, sourceProvider, targetProvider, snapshotOpts, sideChanges } = params;

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
    ...(sideChanges?.source ? { sourceLastChangeAt: nowIso } : {}),
    ...(sideChanges?.target ? { targetLastChangeAt: nowIso } : {}),
  });
}

async function resolveExecutionProviders(
  runId: string,
  pair: SyncPair,
  isScheduled: boolean,
): Promise<{ sourceProvider: MusicProvider; targetProvider: MusicProvider } | null> {
  const sessions = await resolveProviderSessions(pair);
  if (sessions.missingProvider && sessions.missingUserId) {
    markRunFailedForMissingSession(runId, pair, isScheduled, sessions.missingProvider, sessions.missingUserId);
    return null;
  }

  updateSyncRun(runId, { status: 'executing' });

  const sourceProvider = await createBackgroundProvider(sessions.sourceUserId, pair.sourceProvider);
  const targetProvider = await createBackgroundProvider(sessions.targetUserId, pair.targetProvider);
  return { sourceProvider, targetProvider };
}

function markRunSkippedUnchanged(runId: string, pair: SyncPair): void {
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
}

function buildSnapshotOptions(matchThresholds?: SyncMatchThresholds): SnapshotOptions | undefined {
  return matchThresholds ? { resolveOptions: { thresholds: matchThresholds } } : undefined;
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
