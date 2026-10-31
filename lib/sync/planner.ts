import { DEFAULT_MATCH_THRESHOLDS } from '@/lib/matching/config';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';
import { computeSyncDiff } from '@/lib/sync/diff';
import {
  computeBidirectionalPlanWithMetadata,
  withoutBaselines,
  type BidirectionalContext,
} from '@/lib/sync/bidirectionalPlan';
import { markSkippedItems } from '@/lib/sync/skipped';
import type { SyncConfig, SyncPair, SyncPlan } from '@/lib/sync/types';

export type SyncPlanContext = BidirectionalContext & { skippedCanonicalIds?: string[] };

/** The saved pair when there is one, otherwise a context without sync history. */
export function resolvePlanContext(config: SyncConfig, pair: SyncPair | null): SyncPlanContext {
  return pair ?? withoutBaselines(config);
}

/**
 * The single place where a sync plan is computed. Used by the preview and by
 * scheduled / "sync now" runs, so both always propose the same changes.
 */
export function buildSyncPlan(
  context: SyncPlanContext,
  sourceSnapshot: PlaylistSnapshot,
  targetSnapshot: PlaylistSnapshot,
  thresholds?: { convert: number; manual: number },
): SyncPlan {
  const plan = context.direction === 'bidirectional'
    ? computeBidirectionalPlanWithMetadata(
      context,
      sourceSnapshot,
      targetSnapshot,
      thresholds?.manual ?? DEFAULT_MATCH_THRESHOLDS.manual,
    ).plan
    : computeSyncDiff(sourceSnapshot, targetSnapshot, context.direction, thresholds ? { thresholds } : undefined);

  markSkippedItems(plan, context.skippedCanonicalIds);
  return plan;
}
