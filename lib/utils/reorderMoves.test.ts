/**
 * Unit tests for reorderMoves utility
 */
import { describe, it, expect } from 'vitest';
import type { Track } from '@/lib/music-provider/types';
import {
  computeMovePlan,
  longestIncreasingSubsequenceIndices,
  type MoveStep,
} from '@/lib/utils/reorderMoves';

// ---------------------------------------------------------------------------
// Test fixture factory
// ---------------------------------------------------------------------------

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'test-id',
    uri: 'spotify:track:test',
    name: 'Test Track',
    artists: ['Test Artist'],
    durationMs: 180000,
    ...overrides,
  };
}

/**
 * Build an array of tracks in the desired final order.
 * Each entry is the originalPosition of the track.
 * Track names default to "Track {originalPosition}" for readability.
 */
function buildSortedTracks(originalPositions: number[]): Track[] {
  return originalPositions.map((pos) =>
    createTrack({
      name: `Track ${pos}`,
      originalPosition: pos,
      uri: `spotify:track:${pos}`,
    })
  );
}

/**
 * Apply a sequence of MoveSteps to an array using Spotify's reorder semantics:
 *   1. Remove item at range_start (fromIndex)
 *   2. Insert at insert_before (toIndex) in the post-removal array
 *
 * Returns the final array order.
 */
function applyMoves<T>(original: T[], moves: MoveStep[]): T[] {
  const arr = [...original];
  for (const move of moves) {
    const [item] = arr.splice(move.fromIndex, 1);
    arr.splice(move.toIndex, 0, item!);
  }
  return arr;
}

// ---------------------------------------------------------------------------
// LIS helper tests
// ---------------------------------------------------------------------------

describe('longestIncreasingSubsequenceIndices', () => {
  it('returns empty set for empty input', () => {
    expect(longestIncreasingSubsequenceIndices([])).toEqual(new Set());
  });

  it('returns all indices for already sorted sequence', () => {
    const result = longestIncreasingSubsequenceIndices([0, 1, 2, 3]);
    expect(result.size).toBe(4);
  });

  it('returns single index for reversed sequence', () => {
    const result = longestIncreasingSubsequenceIndices([3, 2, 1, 0]);
    expect(result.size).toBe(1);
  });

  it('finds correct LIS length for mixed sequence', () => {
    // [3, 0, 2, 1] -> LIS could be [0, 2] or [0, 1], length 2
    const result = longestIncreasingSubsequenceIndices([3, 0, 2, 1]);
    expect(result.size).toBe(2);
  });

  it('handles single element', () => {
    const result = longestIncreasingSubsequenceIndices([42]);
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(true);
  });

  it('handles duplicate values (strictly increasing)', () => {
    // [1, 1, 1] -> LIS of strictly increasing is length 1
    const result = longestIncreasingSubsequenceIndices([1, 1, 1]);
    expect(result.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeMovePlan tests
// ---------------------------------------------------------------------------

describe('computeMovePlan', () => {
  it('returns 0 moves for empty array', () => {
    const plan = computeMovePlan([]);
    expect(plan.moves).toEqual([]);
    expect(plan.totalMoves).toBe(0);
    expect(plan.lisLength).toBe(0);
  });

  it('returns 0 moves when already in order [0,1,2,3]', () => {
    const tracks = buildSortedTracks([0, 1, 2, 3]);
    const plan = computeMovePlan(tracks);
    expect(plan.totalMoves).toBe(0);
    expect(plan.lisLength).toBe(4);
    expect(plan.moves).toEqual([]);
  });

  it('handles completely reversed order [3,2,1,0] with 3 moves', () => {
    const tracks = buildSortedTracks([3, 2, 1, 0]);
    const plan = computeMovePlan(tracks);
    // LIS length = 1, so 3 tracks need to move
    expect(plan.lisLength).toBe(1);
    expect(plan.totalMoves).toBe(3);
  });

  it('handles single swap [1,0,2,3] with 1 move', () => {
    const tracks = buildSortedTracks([1, 0, 2, 3]);
    const plan = computeMovePlan(tracks);
    // LIS: [0, 2, 3] has length 3, so 1 move
    expect(plan.lisLength).toBe(3);
    expect(plan.totalMoves).toBe(1);
  });

  it('handles single track with 0 moves', () => {
    const tracks = buildSortedTracks([0]);
    const plan = computeMovePlan(tracks);
    expect(plan.totalMoves).toBe(0);
    expect(plan.lisLength).toBe(1);
  });

  it('handles two tracks swapped [1,0] with 1 move', () => {
    const tracks = buildSortedTracks([1, 0]);
    const plan = computeMovePlan(tracks);
    expect(plan.totalMoves).toBe(1);
    expect(plan.lisLength).toBe(1);
  });

  it('filters out tracks without originalPosition gracefully', () => {
    const tracks = [
      createTrack({ name: 'Has Position', originalPosition: 0 }),
      createTrack({ name: 'No Position' }), // originalPosition is undefined
      createTrack({ name: 'Also Has Position', originalPosition: 1 }),
    ];
    const plan = computeMovePlan(tracks);
    // Only 2 tracks with positions, already in order
    expect(plan.totalMoves).toBe(0);
    expect(plan.lisLength).toBe(2);
  });

  it('includes trackName in move steps', () => {
    const tracks = buildSortedTracks([1, 0]);
    const plan = computeMovePlan(tracks);
    expect(plan.moves).toHaveLength(1);
    // Track 1 is at original position 1 and needs to go to index 0
    // Track 0 is at original position 0 and is in the LIS
    // Actually: desired order is [1, 0], meaning Track1 first, Track0 second
    // Original: [0, 1]
    // LIS of [1, 0] has length 1
    expect(plan.moves[0]!.trackName).toMatch(/Track \d/);
  });

  // -------------------------------------------------------------------------
  // Move simulation verification
  // -------------------------------------------------------------------------

  describe('move simulation verification', () => {
    /**
     * For each test case, we verify that applying the generated moves to
     * the original array produces the desired target order.
     */

    it('correctly transforms reversed [3,2,1,0]', () => {
      const desiredOrder = [3, 2, 1, 0];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      // Start with original order
      const original = [0, 1, 2, 3];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('correctly transforms single swap [1,0,2,3]', () => {
      const desiredOrder = [1, 0, 2, 3];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      const original = [0, 1, 2, 3];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('correctly transforms two-track swap [1,0]', () => {
      const desiredOrder = [1, 0];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      const original = [0, 1];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('correctly transforms complex case [3,0,2,1]', () => {
      const desiredOrder = [3, 0, 2, 1];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      const original = [0, 1, 2, 3];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('correctly transforms [2,4,1,3,0]', () => {
      const desiredOrder = [2, 4, 1, 3, 0];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      const original = [0, 1, 2, 3, 4];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('correctly transforms [4,3,2,1,0]', () => {
      const desiredOrder = [4, 3, 2, 1, 0];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      const original = [0, 1, 2, 3, 4];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('correctly transforms already-sorted [0,1,2,3,4]', () => {
      const desiredOrder = [0, 1, 2, 3, 4];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      expect(plan.totalMoves).toBe(0);
      const original = [0, 1, 2, 3, 4];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('correctly transforms move-last-to-first [1,2,3,4,0]', () => {
      const desiredOrder = [1, 2, 3, 4, 0];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      const original = [0, 1, 2, 3, 4];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('correctly transforms move-first-to-last [4,0,1,2,3]', () => {
      const desiredOrder = [4, 0, 1, 2, 3];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      const original = [0, 1, 2, 3, 4];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });

    it('handles larger playlist with interleaved moves', () => {
      // Simulate a realistic sort: original was [0..9], sorted by some criteria
      const desiredOrder = [5, 2, 8, 0, 3, 7, 1, 9, 4, 6];
      const tracks = buildSortedTracks(desiredOrder);
      const plan = computeMovePlan(tracks);

      const original = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const result = applyMoves(original, plan.moves);
      expect(result).toEqual(desiredOrder);
    });
  });

  // -------------------------------------------------------------------------
  // Move count optimality
  // -------------------------------------------------------------------------

  describe('move count optimality', () => {
    it('uses minimum moves (n - LIS length)', () => {
      // [3, 0, 2, 1]: LIS length 2 -> 2 moves needed
      const tracks = buildSortedTracks([3, 0, 2, 1]);
      const plan = computeMovePlan(tracks);
      expect(plan.totalMoves).toBe(plan.moves.length);
      expect(plan.totalMoves + plan.lisLength).toBe(4);
    });

    it('move count equals n minus LIS length for various inputs', () => {
      const testCases = [
        [0, 1, 2, 3],
        [3, 2, 1, 0],
        [1, 0, 2, 3],
        [2, 4, 1, 3, 0],
        [5, 2, 8, 0, 3, 7, 1, 9, 4, 6],
      ];

      for (const desiredOrder of testCases) {
        const tracks = buildSortedTracks(desiredOrder);
        const plan = computeMovePlan(tracks);
        expect(plan.totalMoves + plan.lisLength).toBe(desiredOrder.length);
      }
    });
  });
});
