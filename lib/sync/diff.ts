import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncDirection, SyncDiffItem, SyncPlan } from '@/lib/sync/types';
import type { PlaylistSnapshot, CanonicalSnapshotItem } from '@/lib/sync/snapshot';
import { getCanonicalTrackMetadata } from '@/lib/resolver/canonicalResolver';
import { DEFAULT_MATCH_THRESHOLDS } from '@/lib/matching/config';

/**
 * Build a lookup map from canonical track ID to the first matching snapshot item.
 */
function buildSnapshotIndex(
  snapshot: PlaylistSnapshot,
): Map<string, CanonicalSnapshotItem> {
  const index = new Map<string, CanonicalSnapshotItem>();
  for (const item of snapshot.items) {
    if (!index.has(item.canonicalTrackId)) {
      index.set(item.canonicalTrackId, item);
    }
  }
  return index;
}

export interface SyncDiffOptions {
  thresholds?: { convert: number; manual: number };
}

/**
 * Build a `SyncDiffItem` from a snapshot item. Falls back to canonical
 * metadata when the snapshot item is unavailable.
 */
function buildDiffItem(
  canonicalTrackId: string,
  action: 'add' | 'remove',
  targetProvider: MusicProviderId,
  snapshotItem: CanonicalSnapshotItem | undefined,
): SyncDiffItem {
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
  if (meta) {
    return {
      canonicalTrackId,
      action,
      targetProvider,
      title: meta.titleNorm,
      artists: meta.artistNorm ? [meta.artistNorm] : [],
      durationMs: meta.durationSec != null ? meta.durationSec * 1000 : 0,
      confidence: 0,
      providerTrackId: null,
    };
  }

  return {
    canonicalTrackId,
    action,
    targetProvider,
    title: '',
    artists: [],
    durationMs: 0,
    confidence: 0,
    providerTrackId: null,
  };
}

/**
 * Compute a one-way diff: tracks in `authoritative` that are missing
 * from `receiver`.
 */
function computeOneway(
  authoritative: PlaylistSnapshot,
  receiver: PlaylistSnapshot,
): { toAdd: SyncDiffItem[]; toRemove: SyncDiffItem[] } {
  const authIndex = buildSnapshotIndex(authoritative);
  const receiverIndex = buildSnapshotIndex(receiver);

  const authIds = new Set(authIndex.keys());
  const receiverIds = new Set(receiverIndex.keys());

  const toAdd: SyncDiffItem[] = [];
  for (const id of authIds) {
    if (!receiverIds.has(id)) {
      toAdd.push(buildDiffItem(id, 'add', receiver.providerId, authIndex.get(id)));
    }
  }

  const toRemove: SyncDiffItem[] = [];
  for (const id of receiverIds) {
    if (!authIds.has(id)) {
      toRemove.push(buildDiffItem(id, 'remove', receiver.providerId, receiverIndex.get(id)));
    }
  }

  return { toAdd, toRemove };
}

/**
 * Compute the diff between two playlist snapshots and return a `SyncPlan`.
 *
 * - `a-to-b`: source is authoritative; tracks in source but not target
 *   are added, tracks in target but not source are removed.
 * - `b-to-a`: target is authoritative; logic is reversed.
 * - `bidirectional`: union merge -- missing tracks are added to the side
 *   that lacks them. No removals.
 */
export function computeSyncDiff(
  source: PlaylistSnapshot,
  target: PlaylistSnapshot,
  direction: SyncDirection,
  options?: SyncDiffOptions,
): SyncPlan {
  const manualThreshold = options?.thresholds?.manual ?? DEFAULT_MATCH_THRESHOLDS.manual;
  let items: SyncDiffItem[];

  switch (direction) {
    case 'a-to-b': {
      const { toAdd, toRemove } = computeOneway(source, target);
      items = [...toAdd, ...toRemove];
      break;
    }

    case 'b-to-a': {
      const { toAdd, toRemove } = computeOneway(target, source);
      items = [...toAdd, ...toRemove];
      break;
    }

    case 'bidirectional': {
      const sourceIndex = buildSnapshotIndex(source);
      const targetIndex = buildSnapshotIndex(target);
      const sourceIds = new Set(sourceIndex.keys());
      const targetIds = new Set(targetIndex.keys());

      items = [];

      // Tracks in source missing from target -> add to target
      for (const id of sourceIds) {
        if (!targetIds.has(id)) {
          items.push(buildDiffItem(id, 'add', target.providerId, sourceIndex.get(id)));
        }
      }

      // Tracks in target missing from source -> add to source
      for (const id of targetIds) {
        if (!sourceIds.has(id)) {
          items.push(buildDiffItem(id, 'add', source.providerId, targetIndex.get(id)));
        }
      }

      break;
    }
  }

  const summary = {
    toAdd: items.filter((i) => i.action === 'add').length,
    toRemove: items.filter((i) => i.action === 'remove').length,
    unresolved: items.filter((i) => i.confidence < manualThreshold).length,
  };

  // Compute desired canonical ID order for each side after sync
  const removedIds = new Set(
    items.filter((i) => i.action === 'remove').map((i) => `${i.targetProvider}::${i.canonicalTrackId}`),
  );
  const targetOrder: Record<string, string[]> = {};

  if (direction === 'a-to-b') {
    // Target should match source order (source is authoritative)
    targetOrder[target.providerId] = source.items
      .map((i) => i.canonicalTrackId)
      .filter((id) => !removedIds.has(`${target.providerId}::${id}`));
  } else if (direction === 'b-to-a') {
    // Source should match target order (target is authoritative)
    targetOrder[source.providerId] = target.items
      .map((i) => i.canonicalTrackId)
      .filter((id) => !removedIds.has(`${source.providerId}::${id}`));
  } else {
    // Bidirectional: source (left panel) is authoritative for order.
    // Both playlists end up with the same canonical order — source order
    // with target-only tracks appended at the end.
    const sourceCanonicalIds = source.items.map((i) => i.canonicalTrackId);
    const targetCanonicalIds = target.items.map((i) => i.canonicalTrackId);
    const sourceIdSet = new Set(sourceCanonicalIds);

    const unifiedOrder = [
      ...sourceCanonicalIds,
      ...targetCanonicalIds.filter((id) => !sourceIdSet.has(id)),
    ];

    targetOrder[source.providerId] = unifiedOrder;
    targetOrder[target.providerId] = unifiedOrder;
  }

  console.debug('[sync/diff] computed sync diff', {
    direction,
    sourcePlaylist: source.playlistId,
    targetPlaylist: target.playlistId,
    ...summary,
  });

  return {
    sourceProvider: source.providerId,
    sourcePlaylistId: source.playlistId,
    targetProvider: target.providerId,
    targetPlaylistId: target.playlistId,
    direction,
    items,
    targetOrder,
    summary,
  };
}
