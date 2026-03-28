/**
 * Executes a single background sync for a SyncPair.
 *
 * Captures fresh snapshots from both providers, computes the diff,
 * applies the plan, and records the run result in the database.
 */

import { createBackgroundProvider } from '@/lib/sync/backgroundProvider';
import { captureSnapshot } from '@/lib/sync/snapshot';
import { computeSyncDiff } from '@/lib/sync/diff';
import { applySyncPlan } from '@/lib/sync/apply';
import {
  createSyncRun,
  updateSyncRun,
  advanceNextRunAt,
  incrementConsecutiveFailures,
  resetConsecutiveFailures,
} from '@/lib/sync/syncStore';
import type { SyncPair, SyncWarning } from '@/lib/sync/types';

export async function executeBackgroundSync(pair: SyncPair): Promise<void> {
  const run = createSyncRun({
    syncPairId: pair.id,
    direction: pair.direction,
    triggeredBy: 'scheduler',
  });

  try {
    updateSyncRun(run.id, { status: 'executing' });

    const sourceProvider = await createBackgroundProvider(pair.createdBy, pair.sourceProvider);
    const targetProvider = await createBackgroundProvider(pair.createdBy, pair.targetProvider);

    const [sourceSnapshot, targetSnapshot] = await Promise.all([
      captureSnapshot(sourceProvider, pair.sourceProvider, pair.sourcePlaylistId),
      captureSnapshot(targetProvider, pair.targetProvider, pair.targetPlaylistId),
    ]);

    const plan = computeSyncDiff(sourceSnapshot, targetSnapshot, pair.direction);
    const result = await applySyncPlan(plan, targetProvider);

    // Build warnings from unresolved tracks
    const reasonLabels: Record<string, string> = {
      not_found: 'Not found on target provider',
      materialize_failed: 'Search on target provider failed',
      no_provider_mapping: 'No track mapping for target provider',
    };
    const warnings: SyncWarning[] = result.unresolved.map((info) => ({
      canonicalTrackId: info.canonicalTrackId,
      title: info.title,
      artists: info.artists,
      reason: reasonLabels[info.reason] ?? 'Could not match on target provider',
    }));

    const hasErrors = result.errors.length > 0;
    updateSyncRun(run.id, {
      status: hasErrors ? 'failed' : 'done',
      tracksAdded: result.added,
      tracksRemoved: result.removed,
      tracksUnresolved: result.unresolved.length,
      errorMessage: hasErrors ? result.errors.join('; ') : null,
      warningsJson: warnings.length > 0 ? JSON.stringify(warnings) : null,
      completedAt: new Date().toISOString(),
    });

    resetConsecutiveFailures(pair.id);
    advanceNextRunAt(pair.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAuthError =
      message.includes('No valid session') ||
      message.includes('invalid_grant') ||
      message.includes('revoked');

    updateSyncRun(run.id, {
      status: 'failed',
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });

    incrementConsecutiveFailures(pair.id);

    if (!isAuthError) {
      advanceNextRunAt(pair.id);
    }
    // Auth errors: don't advance next_run_at -- the pair stays stuck until user re-auths

    console.error('[sync/background] sync failed', { pairId: pair.id, error: message });
  }
}
