/**
 * Unified sync executor.
 *
 * Single execution path for both manual (frontend-triggered) and
 * scheduled (background worker) sync operations. Uses DB-stored tokens
 * via createBackgroundProvider so no browser session is needed.
 */

import { createBackgroundProvider } from '@/lib/sync/backgroundProvider';
import { captureSnapshot, captureSnapshotWithChangeToken, fetchPlaylistSnapshotId } from '@/lib/sync/snapshot';
import type { PlaylistSnapshot, SnapshotOptions } from '@/lib/sync/snapshot';
import { applySyncPlan } from '@/lib/sync/apply';
import { buildSyncPlan } from '@/lib/sync/planner';
import { mirrorBaselines, mirrorMatchesSnapshot, reconcileMirror, type MirrorEntry } from '@/lib/sync/mirror';
import { loadPairMirror, savePairMirror } from '@/lib/sync/mirrorStore';
import { getProviderDisplayName } from '@/lib/music-provider/providerLabels';
import { getSessionFromDb } from '@/lib/auth/sessionFromDb';
import { describeMissingSession } from '@/lib/auth/missingSessionMessage';
import { notifyReauthRequired } from '@/lib/sync/reauthNotifier';
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
import type { SyncActivity } from '@/lib/sync/syncSchedule';
import { SYNC_HELD_FOR_REVIEW_PREFIX } from '@/lib/sync/types';
import type { SyncPair, SyncTrigger, SyncWarning, SyncApplyResult, SyncPlan, MassRemovalWarning } from '@/lib/sync/types';
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

type MissingSession = { providerId: MusicProviderId; userId: string };

type ProviderSessions = {
  sourceUserId: string;
  targetUserId: string;
  /** Every side without a valid session (deduplicated for same-account pairs). */
  missing: MissingSession[];
};

async function resolveProviderSessions(pair: SyncPair): Promise<ProviderSessions> {
  const sourceUserId = resolveUserIdForProvider(pair, pair.sourceProvider);
  const targetUserId = resolveUserIdForProvider(pair, pair.targetProvider);

  const [sourceSession, targetSession] = await Promise.all([
    getSessionFromDb(sourceUserId, pair.sourceProvider),
    getSessionFromDb(targetUserId, pair.targetProvider),
  ]);

  const missing: MissingSession[] = [];
  if (!sourceSession) {
    missing.push({ providerId: pair.sourceProvider, userId: sourceUserId });
  }
  const targetIsSameAccount = pair.targetProvider === pair.sourceProvider && targetUserId === sourceUserId;
  if (!targetSession && !(targetIsSameAccount && !sourceSession)) {
    missing.push({ providerId: pair.targetProvider, userId: targetUserId });
  }

  return { sourceUserId, targetUserId, missing };
}

function markRunFailedForMissingSession(
  runId: string,
  pair: SyncPair,
  isScheduled: boolean,
  missing: MissingSession[],
): void {
  updateSyncRun(runId, {
    status: 'failed',
    errorMessage: missing.map(({ providerId, userId }) => describeMissingSession(userId, providerId)).join('; '),
    completedAt: new Date().toISOString(),
  });

  if (isScheduled) {
    incrementConsecutiveFailures(pair.id);
    advanceNextRunAt(pair.id);
    for (const { providerId, userId } of missing) {
      void notifyReauthRequired(userId, providerId);
    }
  }
}

function finishScheduledSuccess(pair: SyncPair, activity: SyncActivity): void {
  resetConsecutiveFailures(pair.id);
  if (pair.syncInterval !== 'off') {
    advanceNextRunAt(pair.id, activity);
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
 * Even when change tokens say nothing changed, both playlists are read in full
 * at least this often, in case a provider's token misses a change.
 */
const FULL_READ_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isFullReadRecent(pair: SyncPair): boolean {
  if (!pair.lastFullReadAt) return false;
  return Date.now() - new Date(pair.lastFullReadAt).getTime() < FULL_READ_MAX_AGE_MS;
}

/**
 * Check whether both playlists are unchanged since the last sync by
 * comparing lightweight change tokens. Returns true if we can skip the sync.
 */
async function arePlaylistsUnchanged(
  pair: SyncPair,
  sourceProvider: MusicProvider,
  targetProvider: MusicProvider,
): Promise<boolean> {
  if (!pair.sourceSnapshotId || !pair.targetSnapshotId || !isFullReadRecent(pair)) return false;

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

  const mirror = loadPairMirror(pair.id);
  const activity = detectActivity(pair, mirror, sourceSnapshot, targetSnapshot);
  const { plan } = buildSyncPlan({ ...pair, mirror }, sourceSnapshot, targetSnapshot, matchThresholds);

  if (plan.massRemoval) {
    markRunHeldForMassRemoval(runId, pair, isScheduled, plan.massRemoval);
    return;
  }

  const providerOverrides: Partial<Record<MusicProviderId, typeof sourceProvider>> = {
    [pair.sourceProvider]: sourceProvider,
    [pair.targetProvider]: targetProvider,
  };
  const result = await applySyncPlan(plan, providerOverrides);

  updateSyncRun(runId, buildRunUpdate(result));

  await recordPostSyncState({
    pair,
    sourceProvider,
    targetProvider,
    snapshotOpts,
    sideChanges: plan.sideChanges,
    addedKeys: result.addedKeys,
  });

  finishScheduledSuccess(pair, activity);
  console.debug('[sync/executor] complete', {
    runId,
    pairId: pair.id,
    triggeredBy,
    activity,
    added: result.added,
    removed: result.removed,
    unresolved: result.unresolved.length,
  });
}

/**
 * Whether anyone changed either playlist since the last sync. The first sync
 * always counts as a change.
 */
function detectActivity(
  pair: SyncPair,
  mirror: readonly MirrorEntry[],
  sourceSnapshot: PlaylistSnapshot,
  targetSnapshot: PlaylistSnapshot,
): SyncActivity {
  if (!pair.lastFullReadAt) return 'changed';
  const unchanged = mirrorMatchesSnapshot(mirror, sourceSnapshot, 'source')
    && mirrorMatchesSnapshot(mirror, targetSnapshot, 'target');
  return unchanged ? 'unchanged' : 'changed';
}

/**
 * Records both playlists as they are after a sync: the pair's local copy (entries,
 * sync keys, tombstones) and the membership/order baselines derived from it, so
 * the next run can tell what changed on which side. Also used after applying a
 * plan from the preview dialog.
 */
export async function recordPostSyncState(params: {
  pair: SyncPair;
  sourceProvider: MusicProvider;
  targetProvider: MusicProvider;
  snapshotOpts: SnapshotOptions | undefined;
  sideChanges: SyncPlan['sideChanges'];
  addedKeys: SyncApplyResult['addedKeys'];
}): Promise<void> {
  const { pair, sourceProvider, targetProvider, snapshotOpts, sideChanges, addedKeys } = params;

  const [postSourceSnapshot, postTargetSnapshot] = await Promise.all([
    captureSnapshotWithChangeToken(sourceProvider, pair.sourceProvider, pair.sourcePlaylistId, snapshotOpts),
    captureSnapshotWithChangeToken(targetProvider, pair.targetProvider, pair.targetPlaylistId, snapshotOpts),
  ]);
  // Tokens from after the sync's own writes, so those do not count as changes next time.
  updateSyncPairSnapshotIds(pair.id, postSourceSnapshot.snapshotId, postTargetSnapshot.snapshotId);

  const nowIso = new Date().toISOString();
  const mirror = reconcileMirror({
    previous: loadPairMirror(pair.id),
    source: postSourceSnapshot,
    target: postTargetSnapshot,
    addedKeys: {
      source: addedKeys?.[pair.sourceProvider] ?? {},
      target: addedKeys?.[pair.targetProvider] ?? {},
    },
    now: nowIso,
  });
  savePairMirror(pair.id, mirror);

  const sourceBaseline = mirrorBaselines(mirror, 'source');
  const targetBaseline = mirrorBaselines(mirror, 'target');
  updateSyncPairBidirectionalMetadata(pair.id, {
    sourceMembershipBaseline: sourceBaseline.membership,
    targetMembershipBaseline: targetBaseline.membership,
    sourceOrderBaseline: sourceBaseline.order,
    targetOrderBaseline: targetBaseline.order,
    ...(sideChanges?.source ? { sourceLastChangeAt: nowIso } : {}),
    ...(sideChanges?.target ? { targetLastChangeAt: nowIso } : {}),
  });
}

export function describeMassRemoval(warnings: MassRemovalWarning[]): string {
  const parts = warnings.map(
    (warning) => `${warning.count} of ${warning.total} tracks would be removed from ${getProviderDisplayName(warning.provider)}`,
  );
  return `${SYNC_HELD_FOR_REVIEW_PREFIX}: ${parts.join('; ')}. Open the sync preview to confirm.`;
}

/**
 * Unattended runs never apply implausibly large removals: nothing is changed and
 * the pair shows as needing attention until the user confirms in the preview.
 * A hold is not a failure: scheduling continues, so a hold caused by a bad read
 * clears itself on the next run.
 */
function markRunHeldForMassRemoval(
  runId: string,
  pair: SyncPair,
  isScheduled: boolean,
  warnings: MassRemovalWarning[],
): void {
  updateSyncRun(runId, {
    status: 'failed',
    errorMessage: describeMassRemoval(warnings),
    completedAt: new Date().toISOString(),
  });

  if (isScheduled) {
    advanceNextRunAt(pair.id);
  }

  console.warn('[sync/executor] held: implausibly large removal', { runId, pairId: pair.id, warnings });
}

async function resolveExecutionProviders(
  runId: string,
  pair: SyncPair,
  isScheduled: boolean,
): Promise<{ sourceProvider: MusicProvider; targetProvider: MusicProvider } | null> {
  const sessions = await resolveProviderSessions(pair);
  if (sessions.missing.length > 0) {
    markRunFailedForMissingSession(runId, pair, isScheduled, sessions.missing);
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
  finishScheduledSuccess(pair, 'unchanged');
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
