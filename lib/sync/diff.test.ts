/**
 * Unit tests for sync diff computation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeSyncDiff } from '@/lib/sync/diff';
import type { PlaylistSnapshot, CanonicalSnapshotItem } from '@/lib/sync/snapshot';

// Mock the canonical resolver (depends on DB)
vi.mock('@/lib/resolver/canonicalResolver', () => ({
  getCanonicalTrackMetadata: vi.fn().mockReturnValue(null),
}));

function createSnapshotItem(overrides: Partial<CanonicalSnapshotItem> = {}): CanonicalSnapshotItem {
  return {
    canonicalTrackId: 'canonical-1',
    providerTrackId: 'provider-1',
    matchScore: 1,
    confidence: 'high',
    title: 'Test Track',
    artists: ['Test Artist'],
    durationMs: 180000,
    position: 0,
    ...overrides,
  };
}

function createSnapshot(
  providerId: 'spotify' | 'tidal',
  playlistId: string,
  items: CanonicalSnapshotItem[],
): PlaylistSnapshot {
  return {
    providerId,
    playlistId,
    snapshotId: null,
    items,
    trackCount: items.length,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeSyncDiff', () => {
  describe('a-to-b direction', () => {
    it('returns empty items when playlists are identical', () => {
      const item = createSnapshotItem({ canonicalTrackId: 'track-A' });
      const source = createSnapshot('spotify', 'pl-1', [item]);
      const target = createSnapshot('tidal', 'pl-2', [
        createSnapshotItem({ canonicalTrackId: 'track-A', providerTrackId: 'tidal-1' }),
      ]);

      const plan = computeSyncDiff(source, target, 'a-to-b');

      expect(plan.items).toHaveLength(0);
      expect(plan.summary.toAdd).toBe(0);
      expect(plan.summary.toRemove).toBe(0);
    });

    it('marks tracks in source but not target as add', () => {
      const source = createSnapshot('spotify', 'pl-1', [
        createSnapshotItem({ canonicalTrackId: 'track-A', title: 'Song A' }),
        createSnapshotItem({ canonicalTrackId: 'track-B', title: 'Song B', position: 1 }),
      ]);
      const target = createSnapshot('tidal', 'pl-2', [
        createSnapshotItem({ canonicalTrackId: 'track-A', providerTrackId: 'tidal-1' }),
      ]);

      const plan = computeSyncDiff(source, target, 'a-to-b');

      expect(plan.summary.toAdd).toBe(1);
      expect(plan.summary.toRemove).toBe(0);
      const addItem = plan.items.find((i) => i.action === 'add');
      expect(addItem).toBeDefined();
      expect(addItem?.canonicalTrackId).toBe('track-B');
      expect(addItem?.title).toBe('Song B');
    });

    it('marks tracks in target but not source as remove', () => {
      const source = createSnapshot('spotify', 'pl-1', [
        createSnapshotItem({ canonicalTrackId: 'track-A' }),
      ]);
      const target = createSnapshot('tidal', 'pl-2', [
        createSnapshotItem({ canonicalTrackId: 'track-A', providerTrackId: 'tidal-1' }),
        createSnapshotItem({
          canonicalTrackId: 'track-C',
          providerTrackId: 'tidal-3',
          title: 'Song C',
          position: 1,
        }),
      ]);

      const plan = computeSyncDiff(source, target, 'a-to-b');

      expect(plan.summary.toRemove).toBe(1);
      const removeItem = plan.items.find((i) => i.action === 'remove');
      expect(removeItem).toBeDefined();
      expect(removeItem?.canonicalTrackId).toBe('track-C');
    });

    it('sets correct source/target metadata in the plan', () => {
      const source = createSnapshot('spotify', 'source-pl', []);
      const target = createSnapshot('tidal', 'target-pl', []);

      const plan = computeSyncDiff(source, target, 'a-to-b');

      expect(plan.sourceProvider).toBe('spotify');
      expect(plan.sourcePlaylistId).toBe('source-pl');
      expect(plan.targetProvider).toBe('tidal');
      expect(plan.targetPlaylistId).toBe('target-pl');
      expect(plan.direction).toBe('a-to-b');
    });
  });

  describe('b-to-a direction', () => {
    it('treats target as authoritative', () => {
      const source = createSnapshot('spotify', 'pl-1', [
        createSnapshotItem({ canonicalTrackId: 'track-A' }),
        createSnapshotItem({ canonicalTrackId: 'track-B', position: 1 }),
      ]);
      const target = createSnapshot('tidal', 'pl-2', [
        createSnapshotItem({ canonicalTrackId: 'track-A', providerTrackId: 'tidal-1' }),
      ]);

      const plan = computeSyncDiff(source, target, 'b-to-a');

      // In b-to-a, target is authoritative, source is receiver.
      // track-B is in source (receiver) but not target (auth) -> remove
      // No tracks in target missing from source -> no adds
      expect(plan.summary.toRemove).toBe(1);
      expect(plan.summary.toAdd).toBe(0);
      const removeItem = plan.items.find((i) => i.action === 'remove');
      expect(removeItem?.canonicalTrackId).toBe('track-B');
    });
  });

  describe('bidirectional direction', () => {
    it('adds missing tracks to both sides without removals', () => {
      const source = createSnapshot('spotify', 'pl-1', [
        createSnapshotItem({ canonicalTrackId: 'track-A', title: 'Song A' }),
        createSnapshotItem({ canonicalTrackId: 'track-B', title: 'Song B', position: 1 }),
      ]);
      const target = createSnapshot('tidal', 'pl-2', [
        createSnapshotItem({ canonicalTrackId: 'track-A', providerTrackId: 'tidal-1' }),
        createSnapshotItem({
          canonicalTrackId: 'track-C',
          providerTrackId: 'tidal-3',
          title: 'Song C',
          position: 1,
        }),
      ]);

      const plan = computeSyncDiff(source, target, 'bidirectional');

      // bidirectional = union merge, no removals
      expect(plan.summary.toRemove).toBe(0);
      expect(plan.summary.toAdd).toBe(2);
      expect(plan.items.every((i) => i.action === 'add')).toBe(true);

      const trackIds = plan.items.map((i) => i.canonicalTrackId).sort();
      expect(trackIds).toEqual(['track-B', 'track-C']);
    });

    it('returns empty items when playlists are identical', () => {
      const items = [
        createSnapshotItem({ canonicalTrackId: 'track-A' }),
        createSnapshotItem({ canonicalTrackId: 'track-B', position: 1 }),
      ];
      const source = createSnapshot('spotify', 'pl-1', items);
      const target = createSnapshot('tidal', 'pl-2', items);

      const plan = computeSyncDiff(source, target, 'bidirectional');

      expect(plan.items).toHaveLength(0);
    });
  });

  describe('deduplication', () => {
    it('uses only the first occurrence of a canonical ID in a snapshot', () => {
      const source = createSnapshot('spotify', 'pl-1', [
        createSnapshotItem({ canonicalTrackId: 'track-A', position: 0 }),
        createSnapshotItem({ canonicalTrackId: 'track-A', position: 1 }), // duplicate
        createSnapshotItem({ canonicalTrackId: 'track-B', position: 2 }),
      ]);
      const target = createSnapshot('tidal', 'pl-2', []);

      const plan = computeSyncDiff(source, target, 'a-to-b');

      // Should produce 2 adds (track-A once, track-B once), not 3
      expect(plan.summary.toAdd).toBe(2);
    });
  });

  describe('unresolved count', () => {
    it('counts items below medium confidence threshold as unresolved', () => {
      const source = createSnapshot('spotify', 'pl-1', [
        createSnapshotItem({ canonicalTrackId: 'track-A', matchScore: 0.3 }),
      ]);
      const target = createSnapshot('tidal', 'pl-2', []);

      const plan = computeSyncDiff(source, target, 'a-to-b');

      // matchScore 0.3 < 0.75 (medium) -> unresolved
      expect(plan.summary.unresolved).toBe(1);
    });

    it('does not count high confidence items as unresolved', () => {
      const source = createSnapshot('spotify', 'pl-1', [
        createSnapshotItem({ canonicalTrackId: 'track-A', matchScore: 1 }),
      ]);
      const target = createSnapshot('tidal', 'pl-2', []);

      const plan = computeSyncDiff(source, target, 'a-to-b');

      expect(plan.summary.unresolved).toBe(0);
    });
  });
});
