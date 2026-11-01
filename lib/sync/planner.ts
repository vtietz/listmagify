import { DEFAULT_MATCH_THRESHOLDS } from '@/lib/matching/config';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';
import { computeSyncDiff } from '@/lib/sync/diff';
import {
  computeBidirectionalPlanWithMetadata,
  withoutBaselines,
  type BidirectionalContext,
} from '@/lib/sync/bidirectionalPlan';
import { collectMirrorRemovals, keySnapshot, mirrorBaselines, type MirrorEntry } from '@/lib/sync/mirror';
import { markSkippedItems } from '@/lib/sync/skipped';
import type { MassRemovalWarning, SyncConfig, SyncPair, SyncPlan } from '@/lib/sync/types';

export type SyncPlanContext = BidirectionalContext & {
  skippedCanonicalIds?: string[];
  /** The pair's local copy from the last sync; empty or absent before the first one */
  mirror?: readonly MirrorEntry[];
};

/** Removals above this share of a side are held for review, as they may come from a bad read. */
const MASS_REMOVAL_RATIO = 0.5;
const MASS_REMOVAL_MIN = 10;

/** The saved pair when there is one, otherwise a context without sync history. */
export function resolvePlanContext(
  config: SyncConfig,
  pair: SyncPair | null,
  mirror?: readonly MirrorEntry[],
): SyncPlanContext {
  if (!pair) return withoutBaselines(config);
  return mirror ? { ...pair, mirror } : pair;
}

export interface SyncPlanResult {
  plan: SyncPlan;
  /** Snapshots with the pair's sync keys applied; what the plan's IDs refer to */
  sourceSnapshot: PlaylistSnapshot;
  targetSnapshot: PlaylistSnapshot;
}

function detectMassRemoval(
  plan: SyncPlan,
  sourceSnapshot: PlaylistSnapshot,
  targetSnapshot: PlaylistSnapshot,
): MassRemovalWarning[] {
  const warnings: MassRemovalWarning[] = [];
  for (const snapshot of [sourceSnapshot, targetSnapshot]) {
    const count = plan.items.filter(
      (item) => item.action === 'remove' && item.targetProvider === snapshot.providerId,
    ).length;
    const total = snapshot.items.length;
    if (count > MASS_REMOVAL_MIN && count > total * MASS_REMOVAL_RATIO) {
      warnings.push({ provider: snapshot.providerId, count, total });
    }
  }
  return warnings;
}

/** Applies the pair's local copy: stable keys, last-sync baselines, and removals. */
function applyMirror(
  context: SyncPlanContext,
  sourceSnapshot: PlaylistSnapshot,
  targetSnapshot: PlaylistSnapshot,
): { context: SyncPlanContext; source: PlaylistSnapshot; target: PlaylistSnapshot; trackKeys: SyncPlan['trackKeys'] } {
  const mirror = context.mirror;
  if (!mirror || mirror.length === 0) {
    return { context, source: sourceSnapshot, target: targetSnapshot, trackKeys: undefined };
  }

  const source = keySnapshot(sourceSnapshot, mirror, 'source');
  const target = keySnapshot(targetSnapshot, mirror, 'target');
  const sourceBaseline = mirrorBaselines(mirror, 'source');
  const targetBaseline = mirrorBaselines(mirror, 'target');

  return {
    context: {
      ...context,
      sourceMembershipBaseline: sourceBaseline.membership,
      targetMembershipBaseline: targetBaseline.membership,
      sourceOrderBaseline: sourceBaseline.order,
      targetOrderBaseline: targetBaseline.order,
      removedKeys: collectMirrorRemovals(mirror, source.snapshot, target.snapshot),
    },
    source: source.snapshot,
    target: target.snapshot,
    trackKeys: {
      [context.sourceProvider]: source.aliases,
      [context.targetProvider]: target.aliases,
    },
  };
}

/**
 * The single place where a sync plan is computed. Used by the preview and by
 * scheduled / "sync now" runs, so both always propose the same changes.
 */
export function buildSyncPlan(
  context: SyncPlanContext,
  rawSourceSnapshot: PlaylistSnapshot,
  rawTargetSnapshot: PlaylistSnapshot,
  thresholds?: { convert: number; manual: number },
): SyncPlanResult {
  const keyed = applyMirror(context, rawSourceSnapshot, rawTargetSnapshot);

  const plan = keyed.context.direction === 'bidirectional'
    ? computeBidirectionalPlanWithMetadata(
      keyed.context,
      keyed.source,
      keyed.target,
      thresholds?.manual ?? DEFAULT_MATCH_THRESHOLDS.manual,
    ).plan
    : computeSyncDiff(keyed.source, keyed.target, keyed.context.direction, thresholds ? { thresholds } : undefined);

  markSkippedItems(plan, context.skippedCanonicalIds);

  if (keyed.trackKeys) plan.trackKeys = keyed.trackKeys;
  const massRemoval = detectMassRemoval(plan, keyed.source, keyed.target);
  if (massRemoval.length > 0) {
    plan.massRemoval = massRemoval;
    console.warn('[sync/planner] plan removes an implausibly large share of a playlist', { massRemoval });
  }

  return { plan, sourceSnapshot: keyed.source, targetSnapshot: keyed.target };
}
