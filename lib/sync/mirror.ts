/**
 * Local copy ("mirror") of both sides of a sync pair, as seen after the last sync.
 *
 * Every playlist entry is remembered with a pair-stable sync key. Both sides share
 * the key for the same song, so a removal on one side maps to the exact entry on
 * the other side even when canonical track resolution changes between runs.
 * Removed entries stay as tombstones until the removal has reached the other side,
 * so a song deleted on one side is never re-added from the other.
 *
 * Pure functions only; persistence lives in `mirrorStore.ts`.
 */
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';

export type MirrorSide = 'source' | 'target';

export interface MirrorEntry {
  side: MirrorSide;
  /** `<providerTrackId>#<occurrence>`: distinguishes duplicates of one track */
  entryKey: string;
  providerTrackId: string;
  /** Pair-stable identity of the song, shared by both sides (a canonical track ID) */
  syncKey: string;
  /** Position in the playlist; null for tombstones */
  position: number | null;
  /** Provider's "added at" timestamp, when known */
  addedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Set when the entry disappeared from the playlist */
  removedAt: string | null;
}

/** providerTrackId -> sync key of the plan item that was added as that track */
export type AddedKeys = Record<string, string>;

function otherSide(side: MirrorSide): MirrorSide {
  return side === 'source' ? 'target' : 'source';
}

/** Entry keys for the items of a snapshot, in playlist order. */
export function entryKeysFor(snapshot: PlaylistSnapshot): string[] {
  const occurrences = new Map<string, number>();
  return snapshot.items.map((item) => {
    const occurrence = occurrences.get(item.providerTrackId) ?? 0;
    occurrences.set(item.providerTrackId, occurrence + 1);
    return `${item.providerTrackId}#${occurrence}`;
  });
}

function entriesBySide(entries: readonly MirrorEntry[], side: MirrorSide): Map<string, MirrorEntry> {
  const result = new Map<string, MirrorEntry>();
  for (const entry of entries) {
    if (entry.side === side) result.set(entry.entryKey, entry);
  }
  return result;
}

export interface KeyedSnapshot {
  snapshot: PlaylistSnapshot;
  /** providerTrackId -> sync key, only where it differs from the resolved canonical ID */
  aliases: Record<string, string>;
}

/**
 * Replaces the freshly resolved canonical IDs of a snapshot with the sync keys
 * remembered for its entries. Entries the mirror does not know keep their
 * resolved canonical ID.
 */
export function keySnapshot(
  snapshot: PlaylistSnapshot,
  entries: readonly MirrorEntry[],
  side: MirrorSide,
): KeyedSnapshot {
  const known = entriesBySide(entries, side);
  const entryKeys = entryKeysFor(snapshot);
  const aliases: Record<string, string> = {};

  const items = snapshot.items.map((item, index) => {
    const entry = known.get(entryKeys[index]!);
    if (!entry || entry.syncKey === item.canonicalTrackId) return item;
    aliases[item.providerTrackId] = entry.syncKey;
    return { ...item, canonicalTrackId: entry.syncKey };
  });

  return { snapshot: { ...snapshot, items }, aliases };
}

/** Membership and order of a side at the last sync, as sync keys. */
export function mirrorBaselines(
  entries: readonly MirrorEntry[],
  side: MirrorSide,
): { membership: string[]; order: string[] } {
  const alive = entries
    .filter((entry) => entry.side === side && entry.removedAt === null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const order = alive.map((entry) => entry.syncKey);
  return { membership: Array.from(new Set(order)).sort(), order };
}

/**
 * Whether a side lists exactly the entries, in the same order, that the mirror
 * recorded after the last sync. The sync's own writes are part of the mirror,
 * so this detects only changes made by someone else since then.
 */
export function mirrorMatchesSnapshot(
  entries: readonly MirrorEntry[],
  snapshot: PlaylistSnapshot,
  side: MirrorSide,
): boolean {
  const alive = entries
    .filter((entry) => entry.side === side && entry.removedAt === null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const current = entryKeysFor(snapshot);
  return current.length === alive.length && current.every((entryKey, index) => alive[index]!.entryKey === entryKey);
}

function collectSideRemovals(
  side: MirrorSide,
  entries: readonly MirrorEntry[],
  keyed: Record<MirrorSide, PlaylistSnapshot>,
  removed: Set<string>,
): void {
  const present = new Set(keyed[side].items.map((item) => item.canonicalTrackId));
  const other = otherSide(side);
  const otherKnown = entriesBySide(entries, other);
  const otherEntryKeys = entryKeysFor(keyed[other]);

  for (const entry of entries) {
    if (entry.side !== side || present.has(entry.syncKey) || removed.has(entry.syncKey)) continue;

    // Still-listed entries that are gone now were removed just now (after everything we know).
    const removedAt = entry.removedAt;
    const reAddedOnOtherSide = keyed[other].items.some((item, index) => {
      if (item.canonicalTrackId !== entry.syncKey) return false;
      const otherEntry = otherKnown.get(otherEntryKeys[index]!);
      // Unknown to the mirror: added on the other side since the last sync.
      if (!otherEntry) return true;
      return removedAt !== null && otherEntry.firstSeenAt > removedAt;
    });

    if (!reAddedOnOtherSide) removed.add(entry.syncKey);
  }
}

/**
 * Sync keys that were removed on one side and must be removed on the other side.
 *
 * A key counts as removed when the mirror knew it on a side and it is gone from
 * that side now, either since the last sync or earlier (tombstone not yet carried
 * over). An entry that was added on the other side after the removal wins: the
 * song stays and is added back.
 */
export function collectMirrorRemovals(
  entries: readonly MirrorEntry[],
  keyedSource: PlaylistSnapshot,
  keyedTarget: PlaylistSnapshot,
): Set<string> {
  const keyed: Record<MirrorSide, PlaylistSnapshot> = { source: keyedSource, target: keyedTarget };
  const removed = new Set<string>();
  collectSideRemovals('source', entries, keyed, removed);
  collectSideRemovals('target', entries, keyed, removed);
  return removed;
}

/** Minimal union-find over sync keys; the smallest key represents a group. */
class KeyUnion {
  private readonly parent = new Map<string, string>();

  find(key: string): string {
    const parent = this.parent.get(key);
    if (!parent || parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    if (rootA < rootB) this.parent.set(rootB, rootA);
    else this.parent.set(rootA, rootB);
  }
}

interface ObservedEntry {
  side: MirrorSide;
  entryKey: string;
  providerTrackId: string;
  syncKey: string;
  position: number;
  addedAt: string | null;
}

function observeSide(
  side: MirrorSide,
  snapshot: PlaylistSnapshot,
  known: Map<string, MirrorEntry>,
  addedKeys: AddedKeys,
  keys: KeyUnion,
): ObservedEntry[] {
  const entryKeys = entryKeysFor(snapshot);
  return snapshot.items.map((item, index) => {
    const entryKey = entryKeys[index]!;
    const syncKey = known.get(entryKey)?.syncKey ?? item.canonicalTrackId;
    const addedKey = addedKeys[item.providerTrackId];

    // The sync added (or found) this track for `addedKey`, so both keys name the
    // same song. This also joins first-sync cross-adds, where each side resolved
    // the song differently and received the other side's key.
    if (addedKey && addedKey !== syncKey) keys.union(addedKey, syncKey);

    return {
      side,
      entryKey,
      providerTrackId: item.providerTrackId,
      syncKey,
      position: index,
      addedAt: item.addedAt ?? null,
    };
  });
}

export interface ReconcileInput {
  previous: readonly MirrorEntry[];
  /** Raw (not keyed) snapshots read after the sync was applied */
  source: PlaylistSnapshot;
  target: PlaylistSnapshot;
  addedKeys: Record<MirrorSide, AddedKeys>;
  now: string;
}

/**
 * Builds the mirror after a sync: keeps sync keys of known entries, gives new
 * entries the key they were added for (or their canonical ID), merges keys proven
 * to be the same song, tombstones entries that disappeared, and drops tombstones
 * that no longer have a counterpart on the other side.
 */
export function reconcileMirror(input: ReconcileInput): MirrorEntry[] {
  const keys = new KeyUnion();
  const knownBySide: Record<MirrorSide, Map<string, MirrorEntry>> = {
    source: entriesBySide(input.previous, 'source'),
    target: entriesBySide(input.previous, 'target'),
  };

  const observed = [
    ...observeSide('source', input.source, knownBySide.source, input.addedKeys.source, keys),
    ...observeSide('target', input.target, knownBySide.target, input.addedKeys.target, keys),
  ];

  const result: MirrorEntry[] = observed.map((entry) => {
    const previous = knownBySide[entry.side].get(entry.entryKey);
    const stillListed = previous !== undefined && previous.removedAt === null;
    return {
      ...entry,
      syncKey: keys.find(entry.syncKey),
      firstSeenAt: stillListed ? previous.firstSeenAt : input.now,
      lastSeenAt: input.now,
      removedAt: null,
    };
  });

  const observedKeys = new Set(observed.map((entry) => `${entry.side}:${entry.entryKey}`));
  for (const previous of input.previous) {
    if (observedKeys.has(`${previous.side}:${previous.entryKey}`)) continue;
    result.push({
      ...previous,
      syncKey: keys.find(previous.syncKey),
      position: null,
      removedAt: previous.removedAt ?? input.now,
    });
  }

  const aliveKeys: Record<MirrorSide, Set<string>> = { source: new Set(), target: new Set() };
  for (const entry of result) {
    if (entry.removedAt === null) aliveKeys[entry.side].add(entry.syncKey);
  }

  // A tombstone only matters while the other side still lists the song.
  return result.filter((entry) => entry.removedAt === null || aliveKeys[otherSide(entry.side)].has(entry.syncKey));
}
