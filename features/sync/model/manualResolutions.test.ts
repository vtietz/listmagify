import { describe, expect, it } from 'vitest';
import type { SyncDiffItem, SyncPlan } from '@/lib/sync/types';
import { applyResolutionsToPlan, resolutionKey } from './manualResolutions';

function item(canonicalTrackId: string, overrides: Partial<SyncDiffItem> = {}): SyncDiffItem {
  return {
    canonicalTrackId,
    action: 'add',
    targetProvider: 'tidal',
    title: canonicalTrackId,
    artists: [],
    durationMs: 0,
    confidence: 1,
    materializeStatus: 'not_found',
    ...overrides,
  };
}

function plan(items: SyncDiffItem[]): SyncPlan {
  return {
    sourceProvider: 'spotify',
    sourcePlaylistId: 'sp',
    targetProvider: 'tidal',
    targetPlaylistId: 'td',
    direction: 'bidirectional',
    items,
    summary: { toAdd: items.length, toRemove: 0, unresolved: items.length },
  };
}

describe('applyResolutionsToPlan', () => {
  it('turns a manual match into a resolved add with the picked track', () => {
    const result = applyResolutionsToPlan(plan([item('a'), item('b')]), {
      [resolutionKey('tidal', 'a')]: { kind: 'matched', providerTrackId: '123', title: 'A', artists: [] },
    });

    expect(result.items[0]).toMatchObject({ materializeStatus: 'resolved', resolvedTargetTrackId: '123', manualMatch: true });
    expect(result.items[1]!.materializeStatus).toBe('not_found');
    expect(result.summary.unresolved).toBe(1);
  });

  it('marks skipped tracks and un-skips previously skipped ones for resolution on apply', () => {
    const result = applyResolutionsToPlan(plan([item('a'), item('b', { materializeStatus: 'skipped' })]), {
      [resolutionKey('tidal', 'a')]: { kind: 'skipped' },
      [resolutionKey('tidal', 'b')]: { kind: 'unskipped' },
    });

    expect(result.items.map((entry) => entry.materializeStatus)).toEqual(['skipped', 'unchecked']);
    expect(result.summary.unresolved).toBe(0);
  });

  it('only applies a resolution to the side it was made for', () => {
    const result = applyResolutionsToPlan(plan([item('a', { targetProvider: 'spotify' })]), {
      [resolutionKey('tidal', 'a')]: { kind: 'skipped' },
    });

    expect(result.items[0]!.materializeStatus).toBe('not_found');
  });

  it('returns the same plan when nothing was resolved', () => {
    const original = plan([item('a')]);
    expect(applyResolutionsToPlan(original, {})).toBe(original);
  });
});
