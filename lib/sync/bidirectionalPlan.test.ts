import { describe, expect, it, vi } from 'vitest';
import {
  computeBidirectionalPlanWithMetadata,
  withoutBaselines,
  type BidirectionalContext,
} from '@/lib/sync/bidirectionalPlan';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';

vi.mock('@/lib/resolver/canonicalResolver', () => ({
  getCanonicalTrackMetadata: vi.fn().mockReturnValue(null),
}));

function snapshot(providerId: 'spotify' | 'tidal', ids: string[]): PlaylistSnapshot {
  return {
    providerId,
    playlistId: `${providerId}-pl`,
    snapshotId: null,
    trackCount: ids.length,
    items: ids.map((id, position) => ({
      canonicalTrackId: id,
      providerTrackId: `${providerId}-${id}`,
      matchScore: 1,
      confidence: 'high',
      title: id,
      artists: [],
      durationMs: 0,
      position,
    })),
  };
}

function context(sourceBaseline: string[] | null, targetBaseline: string[] | null): BidirectionalContext {
  return {
    ...withoutBaselines({
      sourceProvider: 'tidal',
      sourcePlaylistId: 'tidal-pl',
      targetProvider: 'spotify',
      targetPlaylistId: 'spotify-pl',
      direction: 'bidirectional',
    }),
    sourceMembershipBaseline: sourceBaseline && [...sourceBaseline].sort(),
    targetMembershipBaseline: targetBaseline && [...targetBaseline].sort(),
    sourceOrderBaseline: sourceBaseline,
    targetOrderBaseline: targetBaseline,
  };
}

function plan(ctx: BidirectionalContext, source: string[], target: string[]) {
  return computeBidirectionalPlanWithMetadata(ctx, snapshot('tidal', source), snapshot('spotify', target), 0.72).plan;
}

function describeItems(items: ReturnType<typeof plan>['items']): string[] {
  return items.map((item) => `${item.action}:${item.targetProvider}:${item.canonicalTrackId}`).sort();
}

describe('computeBidirectionalPlanWithMetadata', () => {
  it('merges without removals when there is no sync history', () => {
    const result = plan(context(null, null), ['a', 'b'], ['a', 'c']);

    expect(describeItems(result.items)).toEqual(['add:spotify:b', 'add:tidal:c']);
  });

  it('never deletes a track that could not be added to the other side last time', () => {
    // "x" was not found on Spotify in the last sync: it is only in the TIDAL baseline
    const result = plan(context(['a', 'x'], ['a']), ['a', 'x'], ['a']);

    expect(describeItems(result.items)).toEqual(['add:spotify:x']);
  });

  it('passes a removal on one side to the other side', () => {
    const result = plan(context(['a', 'b'], ['a', 'b']), ['a'], ['a', 'b']);

    expect(describeItems(result.items)).toEqual(['remove:spotify:b']);
    expect(result.sideChanges).toEqual({ source: true, target: false });
  });

  it('adds tracks that were added on one side since the last sync', () => {
    const result = plan(context(['a'], ['a']), ['a'], ['a', 'n']);

    expect(describeItems(result.items)).toEqual(['add:tidal:n']);
    expect(result.sideChanges).toEqual({ source: false, target: true });
  });

  it('passes large removals on as removals instead of re-adding the tracks (the planner flags them)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const result = plan(context(ids, ids), [], ids);

    expect(result.items.every((item) => item.action === 'remove' && item.targetProvider === 'spotify')).toBe(true);
    expect(result.items).toHaveLength(20);
  });

  it('uses removals decided from the local copy instead of the baselines', () => {
    const ctx = { ...context(['a', 'b'], ['a', 'b']), removedKeys: new Set(['a']) };
    const result = plan(ctx, ['b'], ['a', 'b']);

    expect(describeItems(result.items)).toEqual(['remove:spotify:a']);
  });

  it('orders both sides by the side that changed its order', () => {
    const result = plan(context(['a', 'b', 'c'], ['a', 'b', 'c']), ['a', 'b', 'c'], ['c', 'a', 'b']);

    expect(result.targetOrder).toEqual({ tidal: ['c', 'a', 'b'], spotify: ['c', 'a', 'b'] });
  });
});
