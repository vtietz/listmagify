import type { SyncDirection, SyncDiffItem, SyncPlan } from '@/lib/sync/types';
import type { PlaylistSnapshot, CanonicalSnapshotItem } from '@/lib/sync/snapshot';
import { getCanonicalTrackMetadata } from '@/lib/resolver/canonicalResolver';

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

/**
 * Convert a confidence label into a numeric score for `SyncDiffItem.confidence`.
 */
function confidenceToNumber(confidence: string): number {
  switch (confidence) {
    case 'high':
      return 1;
    case 'medium':
      return 0.75;
    case 'low':
      return 0.5;
    default:
      return 0;
  }
}

/**
 * Build a `SyncDiffItem` from a snapshot item. Falls back to canonical
 * metadata when the snapshot item is unavailable.
 */
function buildDiffItem(
  canonicalTrackId: string,
  action: 'add' | 'remove',
  snapshotItem: CanonicalSnapshotItem | undefined,
): SyncDiffItem {
  if (snapshotItem) {
    return {
      canonicalTrackId,
      action,
      title: snapshotItem.title,
      artists: snapshotItem.artists,
      durationMs: snapshotItem.durationMs,
      confidence: snapshotItem.matchScore,
      providerTrackId: snapshotItem.providerTrackId,
    };
  }

  // Fallback: look up canonical metadata from the resolver DB
  const meta = getCanonicalTrackMetadata(canonicalTrackId);
  if (meta) {
    return {
      canonicalTrackId,
      action,
      title: meta.titleNorm,
      artists: meta.artistNorm ? [meta.artistNorm] : [],
      durationMs: meta.durationSec != null ? meta.durationSec * 1000 : 0,
      confidence: 0,
      providerTrackId: null,
    };
  }

  // Absolute fallback: no metadata available
  return {
    canonicalTrackId,
    action,
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
      toAdd.push(buildDiffItem(id, 'add', authIndex.get(id)));
    }
  }

  const toRemove: SyncDiffItem[] = [];
  for (const id of receiverIds) {
    if (!authIds.has(id)) {
      toRemove.push(buildDiffItem(id, 'remove', receiverIndex.get(id)));
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
): SyncPlan {
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
          items.push(buildDiffItem(id, 'add', sourceIndex.get(id)));
        }
      }

      // Tracks in target missing from source -> add to source
      for (const id of targetIds) {
        if (!sourceIds.has(id)) {
          items.push(buildDiffItem(id, 'add', targetIndex.get(id)));
        }
      }

      break;
    }
  }

  const summary = {
    toAdd: items.filter((i) => i.action === 'add').length,
    toRemove: items.filter((i) => i.action === 'remove').length,
    unresolved: items.filter((i) => i.confidence < confidenceToNumber('medium')).length,
  };

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
    summary,
  };
}
