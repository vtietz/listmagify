import { describe, expect, it, vi } from 'vitest';
import { buildSyncPlan, resolvePlanContext } from '@/lib/sync/planner';
import { reconcileMirror } from '@/lib/sync/mirror';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';
import type { SyncPair } from '@/lib/sync/types';

vi.mock('@/lib/resolver/canonicalResolver', () => ({
  getCanonicalTrackMetadata: vi.fn().mockReturnValue(null),
}));

const T0 = '2026-01-01T00:00:00.000Z';

function snapshot(providerId: 'spotify' | 'tidal', ids: string[], canonical: (id: string) => string = (id) => id): PlaylistSnapshot {
  return {
    providerId,
    playlistId: `${providerId}-pl`,
    snapshotId: null,
    trackCount: ids.length,
    items: ids.map((id, position) => ({
      canonicalTrackId: canonical(id),
      providerTrackId: `${providerId}-${id}`,
      matchScore: 1,
      confidence: 'high' as const,
      title: id,
      artists: [],
      durationMs: 0,
      position,
    })),
  };
}

function pair(direction: SyncPair['direction'] = 'bidirectional'): SyncPair {
  return {
    id: 'pair-1',
    sourceProvider: 'spotify',
    sourcePlaylistId: 'spotify-pl',
    sourcePlaylistName: 'S',
    targetProvider: 'tidal',
    targetPlaylistId: 'tidal-pl',
    targetPlaylistName: 'T',
    direction,
    createdBy: 'spotify:u',
    providerUserIds: {},
    autoSync: false,
    syncInterval: 'off',
    nextRunAt: null,
    consecutiveFailures: 0,
    sourceSnapshotId: null,
    targetSnapshotId: null,
    sourceMembershipBaseline: null,
    targetMembershipBaseline: null,
    sourceOrderBaseline: null,
    targetOrderBaseline: null,
    sourceLastChangeAt: null,
    targetLastChangeAt: null,
    skippedCanonicalIds: [],
    createdAt: T0,
    updatedAt: T0,
  };
}

const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);

function mirrorOf(source: string[], target: string[]) {
  return reconcileMirror({
    previous: [],
    source: snapshot('spotify', source),
    target: snapshot('tidal', target),
    addedKeys: { source: {}, target: {} },
    now: T0,
  });
}

describe('buildSyncPlan', () => {
  it('flags a plan that removes most of a playlist', () => {
    const context = resolvePlanContext(pair(), pair(), mirrorOf(ids, ids));
    const { plan } = buildSyncPlan(context, snapshot('spotify', ids.slice(0, 5)), snapshot('tidal', ids));

    expect(plan.summary.toRemove).toBe(15);
    expect(plan.massRemoval).toEqual([{ provider: 'tidal', count: 15, total: 20 }]);
  });

  it('does not flag ordinary removals', () => {
    const context = resolvePlanContext(pair(), pair(), mirrorOf(ids, ids));
    const { plan } = buildSyncPlan(context, snapshot('spotify', ids.slice(0, 18)), snapshot('tidal', ids));

    expect(plan.summary.toRemove).toBe(2);
    expect(plan.massRemoval).toBeUndefined();
  });

  it('flags one-way plans that would empty the receiving playlist', () => {
    const { plan } = buildSyncPlan(pair('a-to-b'), snapshot('spotify', []), snapshot('tidal', ids));

    expect(plan.massRemoval).toEqual([{ provider: 'tidal', count: 20, total: 20 }]);
  });

  it('returns snapshots keyed by the local copy and the aliases for reordering', () => {
    const context = resolvePlanContext(pair(), pair(), mirrorOf(['a'], ['a']));
    const result = buildSyncPlan(context, snapshot('spotify', ['a']), snapshot('tidal', ['a'], () => 'drifted'));

    expect(result.plan.items).toEqual([]);
    expect(result.targetSnapshot.items[0]?.canonicalTrackId).toBe('a');
    expect(result.plan.trackKeys?.tidal).toEqual({ 'tidal-a': 'a' });
  });

  it('falls back to the stored baselines while the pair has no local copy yet', () => {
    const legacy = { ...pair(), sourceMembershipBaseline: ['a', 'b'], targetMembershipBaseline: ['a', 'b'] };
    const { plan } = buildSyncPlan(resolvePlanContext(legacy, legacy, []), snapshot('spotify', ['a']), snapshot('tidal', ['a', 'b']));

    expect(plan.items.map((item) => `${item.action}:${item.targetProvider}:${item.canonicalTrackId}`)).toEqual(['remove:tidal:b']);
  });
});
