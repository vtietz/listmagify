/**
 * Utility functions for computing drag-and-drop index calculations.
 * Handles conversion between filtered view indices and actual playlist indices.
 */

export interface Track {
  id: string;
  uri: string;
  [key: string]: unknown;
}

/**
 * Compute the actual insertion index in the full track list
 * given a drop index in a filtered view.
 */
export function computeInsertIndex(
  dropIndex: number,
  filteredTracks: Track[],
  allTracks: Track[]
): number {
  if (dropIndex >= filteredTracks.length) {
    // Dropping at the end
    const lastFilteredTrack = filteredTracks[filteredTracks.length - 1];
    if (!lastFilteredTrack) return allTracks.length;
    const lastActualIndex = allTracks.findIndex((t) => t.id === lastFilteredTrack.id);
    return lastActualIndex + 1;
  }

  // Find the actual index of the track at the drop position
  const targetTrack = filteredTracks[dropIndex];
  if (!targetTrack) return 0;
  return allTracks.findIndex((t) => t.id === targetTrack.id);
}

/**
 * Given a set of source indices in the original list and a target index,
 * compute the final insert position after accounting for removed items.
 * Used for "move" operations within the same playlist.
 */
export function adjustInsertIndexForRemoval(
  sourceIndices: number[],
  targetIndex: number
): number {
  const sortedSources = [...sourceIndices].sort((a, b) => a - b);
  let adjustment = 0;

  for (const sourceIdx of sortedSources) {
    if (sourceIdx < targetIndex) {
      adjustment++;
    }
  }

  return targetIndex - adjustment;
}

/**
 * Check if tracks can be moved/copied (permissions check).
 */
export function canPerformDrop(
  sourceEditable: boolean,
  targetEditable: boolean,
  mode: 'move' | 'copy'
): { allowed: boolean; reason?: string } {
  if (mode === 'move' && !sourceEditable) {
    return { allowed: false, reason: 'Source playlist is read-only' };
  }

  if (!targetEditable) {
    return { allowed: false, reason: 'Target playlist is read-only' };
  }

  return { allowed: true };
}

/**
 * Extract contiguous ranges from a list of indices for efficient batch operations.
 * Spotify's reorder API works with ranges.
 */
export function extractRanges(
  indices: number[]
): Array<{ start: number; length: number }> {
  if (indices.length === 0) return [];

  const sorted = [...indices].sort((a, b) => a - b);
  const ranges: Array<{ start: number; length: number }> = [];
  let currentStart = sorted[0];
  if (currentStart === undefined) return [];
  
  let currentLength = 1;

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];
    if (current !== undefined && previous !== undefined && current === previous + 1) {
      currentLength++;
    } else {
      ranges.push({ start: currentStart, length: currentLength });
      currentStart = current ?? 0;
      currentLength = 1;
    }
  }

  ranges.push({ start: currentStart, length: currentLength });
  return ranges;
}
