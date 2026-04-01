/**
 * Computes the minimum set of Spotify-compatible move operations to reorder
 * a playlist while preserving `added_at` metadata.
 *
 * Uses the Longest Increasing Subsequence (LIS) to identify tracks already
 * in correct relative order (they stay in place). Then simulates single-track
 * moves for the remaining tracks, producing exact `range_start`/`insert_before`
 * values matching Spotify's reorder API contract.
 */

import type { Track } from '@/lib/music-provider/types';

export type MoveStep = {
  trackName: string; // For progress display (track title)
  fromIndex: number; // range_start in Spotify API terms
  toIndex: number; // insert_before in Spotify API terms
};

export type MovePlan = {
  moves: MoveStep[];
  totalMoves: number;
  lisLength: number; // tracks that stay in place
};

/**
 * Compute the indices of the Longest Increasing Subsequence using
 * the O(n log n) patience sorting algorithm.
 *
 * @param seq - array of numbers
 * @returns Set of indices into `seq` that form the LIS
 */
export function longestIncreasingSubsequenceIndices(seq: number[]): Set<number> {
  const n = seq.length;
  if (n === 0) return new Set();

  // tails[i] holds the index in seq of the smallest tail element for
  // an increasing subsequence of length i+1
  const tails: number[] = [];
  // predecessors[i] holds the index of the previous element in the LIS
  // ending at seq[i]
  const predecessors: number[] = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const val = seq[i]!;

    // Binary search for the leftmost tail >= val
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (seq[tails[mid]!]! < val) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // lo is the position where val should go
    if (lo === tails.length) {
      tails.push(i);
    } else {
      tails[lo] = i;
    }

    // Record predecessor
    predecessors[i] = lo > 0 ? (tails[lo - 1] ?? -1) : -1;
  }

  // Reconstruct the LIS indices by backtracking through predecessors
  const lisIndices = new Set<number>();
  let idx: number = tails[tails.length - 1] ?? -1;
  while (idx !== -1) {
    lisIndices.add(idx);
    idx = predecessors[idx] ?? -1;
  }

  return lisIndices;
}

/**
 * Compute the minimal set of move operations to transform a playlist
 * from its current order into the desired sorted order.
 *
 * @param sortedTracks - tracks in the desired final order, each with
 *   `originalPosition` indicating current position in the playlist
 * @returns A MovePlan with the sequence of moves and metadata
 */
export function computeMovePlan(sortedTracks: Track[]): MovePlan {
  // Step 1: Filter to tracks with a defined originalPosition
  const tracksWithPosition = sortedTracks.filter(
    (t): t is Track & { originalPosition: number } => t.originalPosition != null
  );

  const n = tracksWithPosition.length;
  if (n === 0) {
    return { moves: [], totalMoves: 0, lisLength: 0 };
  }

  // Step 2: Extract the sequence of originalPosition values in sorted display order
  const originalPositions = tracksWithPosition.map((t) => t.originalPosition);

  // Step 3: Compute LIS indices
  const lisIndices = longestIncreasingSubsequenceIndices(originalPositions);

  // Step 4: Mark which tracks must move (not in LIS)
  const mustMove = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (!lisIndices.has(i)) {
      mustMove.add(i);
    }
  }

  // Step 5: Simulate moves
  // Start with the original order: positions [0, 1, 2, ..., n-1]
  const simulated: number[] = Array.from({ length: n }, (_, i) => i);

  const moves: MoveStep[] = [];
  let targetIndex = 0;

  for (let i = 0; i < n; i++) {
    const track = tracksWithPosition[i]!;
    const origPos = track.originalPosition;

    if (!mustMove.has(i)) {
      // Track is in the LIS, it stays in place
      targetIndex++;
      continue;
    }

    // Find where this track currently sits in the simulated array
    const currentIndex = simulated.indexOf(origPos);

    // Remove from current position
    simulated.splice(currentIndex, 1);
    // Insert at target position
    simulated.splice(targetIndex, 0, origPos);

    // Compute Spotify API parameters:
    // Spotify removes the item first (range_start = currentIndex in the pre-removal array),
    // then inserts at insert_before in the post-removal array.
    //
    // Our splice operations match this exactly:
    // - We removed from currentIndex (this is range_start)
    // - We inserted at targetIndex in the post-removal array (this is insert_before)
    const fromIndex = currentIndex;
    const toIndex = targetIndex;

    moves.push({
      trackName: track.name,
      fromIndex,
      toIndex,
    });

    targetIndex++;
  }

  return {
    moves,
    totalMoves: moves.length,
    lisLength: lisIndices.size,
  };
}
