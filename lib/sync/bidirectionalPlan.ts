import { getCanonicalTrackMetadata } from '@/lib/resolver/canonicalResolver';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { PlaylistSnapshot, CanonicalSnapshotItem } from '@/lib/sync/snapshot';
import type { SyncPair, SyncPlan, SyncDiffItem } from '@/lib/sync/types';

/** What the bidirectional merge needs to know about a pair. */
export type BidirectionalContext = Pick<
  SyncPair,
  | 'sourceProvider'
  | 'sourcePlaylistId'
  | 'targetProvider'
  | 'targetPlaylistId'
  | 'direction'
  | 'sourceMembershipBaseline'
  | 'targetMembershipBaseline'
  | 'sourceOrderBaseline'
  | 'targetOrderBaseline'
  | 'sourceLastChangeAt'
  | 'targetLastChangeAt'
>;

/** Context for a sync without history (first sync or one-off): a pure union merge. */
export function withoutBaselines(
  config: Pick<SyncPair, 'sourceProvider' | 'sourcePlaylistId' | 'targetProvider' | 'targetPlaylistId' | 'direction'>,
): BidirectionalContext {
  return {
    ...config,
    sourceMembershipBaseline: null,
    targetMembershipBaseline: null,
    sourceOrderBaseline: null,
    targetOrderBaseline: null,
    sourceLastChangeAt: null,
    targetLastChangeAt: null,
  };
}

/** Removals above this share of the previous playlist are treated as a glitch, not intent. */
const MASS_REMOVAL_RATIO = 0.5;
const MASS_REMOVAL_MIN = 10;

export function uniqueCanonicalIds(snapshot: PlaylistSnapshot): string[] {
  return Array.from(new Set(snapshot.items.map((item) => item.canonicalTrackId))).sort();
}

export function orderCanonicalIds(snapshot: PlaylistSnapshot): string[] {
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
  pair: BidirectionalContext,
  sourceOrderChanged: boolean,
  targetOrderChanged: boolean,
): MusicProviderId {
  if (sourceOrderChanged !== targetOrderChanged) {
    return sourceOrderChanged ? pair.sourceProvider : pair.targetProvider;
  }

  if (!sourceOrderChanged) {
    return pair.sourceProvider;
  }

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

type BidirectionalDelta = {
  sourceMembershipChanged: boolean;
  targetMembershipChanged: boolean;
  sourceOrderChanged: boolean;
  targetOrderChanged: boolean;
  sourceSet: Set<string>;
  targetSet: Set<string>;
  mergedSet: Set<string>;
  sourceCurrentOrder: string[];
  targetCurrentOrder: string[];
};

function difference(from: Iterable<string>, without: Set<string>): Set<string> {
  return new Set(Array.from(from).filter((id) => !without.has(id)));
}

/**
 * A track counts as removed only if it was on that same side at the last sync and
 * is gone now. Tracks that never made it to a side (e.g. not found there) are not
 * removals. Implausibly large removals are ignored to protect against bad reads.
 */
function collectRemovals(
  sourceBaseline: string[],
  targetBaseline: string[],
  sourceSet: Set<string>,
  targetSet: Set<string>,
): Set<string> {
  const removed = new Set<string>([
    ...difference(sourceBaseline, sourceSet),
    ...difference(targetBaseline, targetSet),
  ]);

  const previousSize = Math.max(sourceBaseline.length, targetBaseline.length);
  if (removed.size > MASS_REMOVAL_MIN && removed.size > previousSize * MASS_REMOVAL_RATIO) {
    console.warn('[sync/bidirectional] ignoring implausible mass removal', {
      removed: removed.size,
      previousSize,
    });
    return new Set();
  }

  return removed;
}

function buildBidirectionalDelta(
  pair: BidirectionalContext,
  sourceSnapshot: PlaylistSnapshot,
  targetSnapshot: PlaylistSnapshot,
): BidirectionalDelta {
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

  const sourceSet = new Set<string>(sourceCurrentMembership);
  const targetSet = new Set<string>(targetCurrentMembership);
  const removedByAny = collectRemovals(sourceBaselineMembership, targetBaselineMembership, sourceSet, targetSet);
  const mergedSet = difference([...sourceSet, ...targetSet], removedByAny);

  return {
    sourceMembershipChanged,
    targetMembershipChanged,
    sourceOrderChanged,
    targetOrderChanged,
    sourceSet,
    targetSet,
    mergedSet,
    sourceCurrentOrder,
    targetCurrentOrder,
  };
}

function buildBidirectionalItems(
  pair: BidirectionalContext,
  sourceSet: Set<string>,
  targetSet: Set<string>,
  mergedSet: Set<string>,
  sourceIndex: Map<string, CanonicalSnapshotItem>,
  targetIndex: Map<string, CanonicalSnapshotItem>,
): SyncDiffItem[] {
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

  return items;
}

export function computeBidirectionalPlanWithMetadata(
  pair: BidirectionalContext,
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
  const delta = buildBidirectionalDelta(pair, sourceSnapshot, targetSnapshot);

  const sourceIndex = buildSnapshotIndex(sourceSnapshot);
  const targetIndex = buildSnapshotIndex(targetSnapshot);
  const items = buildBidirectionalItems(
    pair,
    delta.sourceSet,
    delta.targetSet,
    delta.mergedSet,
    sourceIndex,
    targetIndex,
  );

  const winner = chooseOrderWinner(pair, delta.sourceOrderChanged, delta.targetOrderChanged);
  const winnerOrder = winner === pair.sourceProvider ? delta.sourceCurrentOrder : delta.targetCurrentOrder;
  const loserOrder = winner === pair.sourceProvider ? delta.targetCurrentOrder : delta.sourceCurrentOrder;
  const unifiedOrder = buildUnifiedOrder(delta.mergedSet, winnerOrder, loserOrder);

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
    sideChanges: {
      source: delta.sourceMembershipChanged || delta.sourceOrderChanged,
      target: delta.targetMembershipChanged || delta.targetOrderChanged,
    },
    summary: {
      toAdd: items.filter((item) => item.action === 'add').length,
      toRemove: items.filter((item) => item.action === 'remove').length,
      unresolved: items.filter((item) => item.confidence < manualThreshold).length,
    },
  };

  return {
    plan,
    sourceMembershipChanged: delta.sourceMembershipChanged,
    targetMembershipChanged: delta.targetMembershipChanged,
    sourceOrderChanged: delta.sourceOrderChanged,
    targetOrderChanged: delta.targetOrderChanged,
  };
}
