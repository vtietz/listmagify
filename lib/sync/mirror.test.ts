import { describe, expect, it, vi } from 'vitest';
import {
  collectMirrorRemovals,
  entryKeysFor,
  keySnapshot,
  mirrorBaselines,
  mirrorMatchesSnapshot,
  reconcileMirror,
  type MirrorEntry,
  type MirrorSide,
} from '@/lib/sync/mirror';
import { computeBidirectionalPlanWithMetadata, withoutBaselines } from '@/lib/sync/bidirectionalPlan';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';

vi.mock('@/lib/resolver/canonicalResolver', () => ({
  getCanonicalTrackMetadata: vi.fn().mockReturnValue(null),
}));

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-02T00:00:00.000Z';
const T2 = '2026-01-03T00:00:00.000Z';

const PROVIDER: Record<MirrorSide, 'spotify' | 'tidal'> = { source: 'spotify', target: 'tidal' };

/** Items as `providerTrackId=canonicalId`, or just `id` for `<provider>-<id>=<id>`. */
function snapshot(side: MirrorSide, items: string[]): PlaylistSnapshot {
  const providerId = PROVIDER[side];
  return {
    providerId,
    playlistId: `${providerId}-pl`,
    snapshotId: null,
    trackCount: items.length,
    items: items.map((spec, position) => {
      const [trackId, canonicalId] = spec.includes('=') ? spec.split('=') : [`${providerId}-${spec}`, spec];
      return {
        canonicalTrackId: canonicalId!,
        providerTrackId: trackId!,
        matchScore: 1,
        confidence: 'high' as const,
        title: canonicalId!,
        artists: [],
        durationMs: 0,
        position,
      };
    }),
  };
}

function reconcile(
  previous: MirrorEntry[],
  source: string[],
  target: string[],
  now: string,
  addedKeys: Partial<Record<MirrorSide, Record<string, string>>> = {},
): MirrorEntry[] {
  return reconcileMirror({
    previous,
    source: snapshot('source', source),
    target: snapshot('target', target),
    addedKeys: { source: addedKeys.source ?? {}, target: addedKeys.target ?? {} },
    now,
  });
}

/** Plans the next bidirectional run from the local copy, as the planner does. */
function planFromMirror(mirror: MirrorEntry[], source: string[], target: string[]): string[] {
  const keyedSource = keySnapshot(snapshot('source', source), mirror, 'source').snapshot;
  const keyedTarget = keySnapshot(snapshot('target', target), mirror, 'target').snapshot;
  const sourceBaseline = mirrorBaselines(mirror, 'source');
  const targetBaseline = mirrorBaselines(mirror, 'target');
  const context = {
    ...withoutBaselines({
      sourceProvider: 'spotify' as const,
      sourcePlaylistId: 'spotify-pl',
      targetProvider: 'tidal' as const,
      targetPlaylistId: 'tidal-pl',
      direction: 'bidirectional' as const,
    }),
    sourceMembershipBaseline: sourceBaseline.membership,
    targetMembershipBaseline: targetBaseline.membership,
    sourceOrderBaseline: sourceBaseline.order,
    targetOrderBaseline: targetBaseline.order,
    removedKeys: collectMirrorRemovals(mirror, keyedSource, keyedTarget),
  };
  const { plan } = computeBidirectionalPlanWithMetadata(context, keyedSource, keyedTarget, 0.72);
  return plan.items.map((item) => `${item.action}:${item.targetProvider}:${item.canonicalTrackId}`).sort();
}

describe('entryKeysFor', () => {
  it('numbers duplicates of a track by occurrence', () => {
    expect(entryKeysFor(snapshot('source', ['x=a', 'y=b', 'x=a']))).toEqual(['x#0', 'y#0', 'x#1']);
  });
});

describe('reconcileMirror', () => {
  it('remembers every entry with its position and first-seen time', () => {
    const mirror = reconcile([], ['a', 'b'], ['a'], T0);

    expect(mirror).toHaveLength(3);
    expect(mirror.find((e) => e.side === 'source' && e.syncKey === 'b')).toMatchObject({
      entryKey: 'spotify-b#0',
      position: 1,
      firstSeenAt: T0,
      lastSeenAt: T0,
      removedAt: null,
    });
  });

  it('keeps the sync key of a known entry even when its canonical ID changes', () => {
    const first = reconcile([], ['sp1=a'], ['td1=a'], T0);
    const second = reconcile(first, ['sp1=a'], ['td1=drifted'], T1);

    expect(second.find((e) => e.side === 'target')?.syncKey).toBe('a');
    expect(second.find((e) => e.side === 'target')?.firstSeenAt).toBe(T0);
  });

  it('gives a track the sync added the key it was added for', () => {
    const first = reconcile([], ['sp1=a'], [], T0);
    const second = reconcile(first, ['sp1=a'], ['td1=other'], T1, { target: { td1: 'a' } });

    expect(second.find((e) => e.side === 'target')?.syncKey).toBe('a');
  });

  it('merges keys proven to be the same song on both sides', () => {
    // Same song resolved to different canonical IDs; the sync's add found the existing TIDAL entry.
    const first = reconcile([], ['sp1=k1'], ['td1=k2'], T0);
    const second = reconcile(first, ['sp1=k1'], ['td1=k2'], T1, { target: { td1: 'k1' }, source: { sp1: 'k2' } });

    expect(new Set(second.map((e) => e.syncKey))).toEqual(new Set(['k1']));
  });

  it('joins first-sync cross-adds where each side resolved the song differently', () => {
    // No local copy yet; the sync added k1 to TIDAL and k2 to Spotify, and both
    // adds found the track already on that side.
    const mirror = reconcile([], ['sp1=k1'], ['td1=k2'], T0, { target: { td1: 'k1' }, source: { sp1: 'k2' } });

    expect(new Set(mirror.map((e) => e.syncKey))).toEqual(new Set(['k1']));
    expect(planFromMirror(mirror, ['sp1=k1'], ['td1=k2'])).toEqual([]);
  });

  it('keeps a tombstone while the other side still lists the song', () => {
    const first = reconcile([], ['a', 'b'], ['a', 'b'], T0);
    const second = reconcile(first, ['a'], ['a', 'b'], T1);

    expect(second.find((e) => e.side === 'source' && e.syncKey === 'b')).toMatchObject({
      position: null,
      removedAt: T1,
    });
  });

  it('drops the tombstone once the removal reached the other side', () => {
    const first = reconcile([], ['a', 'b'], ['a', 'b'], T0);
    const second = reconcile(first, ['a'], ['a'], T1);

    expect(second.some((e) => e.syncKey === 'b')).toBe(false);
  });

  it('treats a re-listed entry as newly seen', () => {
    const first = reconcile([], ['a', 'b'], ['a', 'b'], T0);
    const removed = reconcile(first, ['a'], ['a', 'b'], T1);
    const reAdded = reconcile(removed, ['a', 'b'], ['a', 'b'], T2);

    expect(reAdded.find((e) => e.side === 'source' && e.syncKey === 'b')).toMatchObject({
      firstSeenAt: T2,
      removedAt: null,
    });
  });
});

describe('planning from the local copy', () => {
  it('passes a removal on to the other side', () => {
    const mirror = reconcile([], ['a', 'b'], ['a', 'b'], T0);

    expect(planFromMirror(mirror, ['a'], ['a', 'b'])).toEqual(['remove:tidal:b']);
  });

  it('passes a removal on even when the other side\'s copy now resolves to a different canonical ID', () => {
    const mirror = reconcile([], ['sp-b=b', 'sp-a=a'], ['td-b=b', 'td-a=a'], T0);

    expect(planFromMirror(mirror, ['sp-a=a'], ['td-b=drifted', 'td-a=a'])).toEqual(['remove:tidal:b']);
  });

  it('does not re-add a song whose removal could not be carried over last time', () => {
    // Removed on Spotify; the TIDAL removal failed, so TIDAL still has it and the tombstone stayed.
    const first = reconcile([], ['a', 'b'], ['a', 'b'], T0);
    const afterFailedRemoval = reconcile(first, ['a'], ['a', 'b'], T1);

    expect(planFromMirror(afterFailedRemoval, ['a'], ['a', 'b'])).toEqual(['remove:tidal:b']);
  });

  it('lets a later re-add on the other side win over an earlier removal', () => {
    const first = reconcile([], ['a', 'b'], ['a', 'b'], T0);
    const removedOnSpotify = reconcile(first, ['a'], ['a', 'b'], T1);
    // TIDAL's copy of "b" was first seen after the Spotify removal (re-added there).
    const reAddedOnTidal = removedOnSpotify.map((entry) => (
      entry.side === 'target' && entry.syncKey === 'b' ? { ...entry, firstSeenAt: T2 } : entry
    ));

    expect(removedOnSpotify.find((e) => e.side === 'source' && e.syncKey === 'b')?.removedAt).toBe(T1);
    expect(planFromMirror(reAddedOnTidal, ['a'], ['a', 'b'])).toEqual(['add:spotify:b']);
  });

  it('keeps a song added on the other side since the last sync', () => {
    const mirror = reconcile([], ['a', 'b'], ['a'], T0);

    // "b" removed on Spotify, but TIDAL got its own (new) copy of "b" meanwhile.
    expect(planFromMirror(mirror, ['a'], ['a', 'b'])).toEqual(['add:spotify:b']);
  });

  it('never removes a song that only ever existed on one side', () => {
    const mirror = reconcile([], ['a', 'x'], ['a'], T0);

    expect(planFromMirror(mirror, ['a', 'x'], ['a'])).toEqual(['add:tidal:x']);
  });

  it('keeps a song when only one of its duplicates was removed', () => {
    const mirror = reconcile([], ['a', 'b', 'a'], ['a', 'b'], T0);

    expect(planFromMirror(mirror, ['a', 'b'], ['a', 'b'])).toEqual([]);
  });
});

describe('mirrorMatchesSnapshot', () => {
  it('matches when a side lists exactly what the last sync recorded', () => {
    const mirror = reconcile([], ['a', 'b'], ['a'], T0);

    expect(mirrorMatchesSnapshot(mirror, snapshot('source', ['a', 'b']), 'source')).toBe(true);
    expect(mirrorMatchesSnapshot(mirror, snapshot('target', ['a']), 'target')).toBe(true);
  });

  it('detects additions, removals and reorders', () => {
    const mirror = reconcile([], ['a', 'b'], ['a', 'b'], T0);

    expect(mirrorMatchesSnapshot(mirror, snapshot('source', ['a', 'b', 'c']), 'source')).toBe(false);
    expect(mirrorMatchesSnapshot(mirror, snapshot('source', ['a']), 'source')).toBe(false);
    expect(mirrorMatchesSnapshot(mirror, snapshot('source', ['b', 'a']), 'source')).toBe(false);
  });

  it('ignores tombstones', () => {
    const first = reconcile([], ['a', 'b'], ['a', 'b'], T0);
    const removed = reconcile(first, ['a'], ['a', 'b'], T1);

    expect(mirrorMatchesSnapshot(removed, snapshot('source', ['a']), 'source')).toBe(true);
  });
});
