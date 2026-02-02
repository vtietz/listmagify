/**
 * Drop Intent Computation
 *
 * Pure function for computing where a drag operation should drop.
 * Centralizes all drop position logic in one place for consistency.
 *
 * Key features:
 * 1. Accounts for multi-select drag overlay height
 * 2. Excludes dragged tracks from being valid drop targets
 * 3. Maps filtered indices to global playlist positions
 */

import type { Track } from '@/lib/spotify/types';

/**
 * Input parameters for drop intent computation
 */
export interface DropIntentInput {
  /** Current Y position of the pointer (client coordinates) */
  pointerY: number;
  /** Height of fixed header content before virtualized list */
  headerOffset: number;
  /** Top position of scrollable container (from getBoundingClientRect) */
  containerTop: number;
  /** Current scroll position of container */
  scrollTop: number;
  /** Height of a single track row */
  rowHeight: number;
  /** Virtual items currently rendered */
  virtualItems: Array<{ index: number; start: number; size: number }>;
  /** Filtered/visible tracks in the list */
  filteredTracks: Track[];
  /** Global positions of tracks being dragged (to exclude from targeting) */
  draggedTrackPositions: number[];
  /** Number of tracks being dragged (affects overlay height) */
  dragCount: number;
}

/**
 * Result of drop intent computation
 */
export interface DropIntent {
  /** Index in filtered track list where drop indicator should appear */
  insertionIndexFiltered: number;
  /** Global playlist position where tracks should be inserted (for mutation) */
  insertBeforeGlobal: number;
}

/**
 * Compute drop intent from pointer position and drag state.
 *
 * This function:
 * 1. Calculates the effective "top edge" of the drag overlay by accounting for:
 *    - Single-row offset (rowHeight / 2) - pointer is typically mid-row
 *    - Multi-select offset ((dragCount - 1) * rowHeight / 2) - overlay is taller
 * 2. Finds the insertion index in the filtered view
 * 3. Maps to global position, excluding dragged tracks as valid targets
 *
 * @param input - All parameters needed for computation
 * @returns Drop intent with filtered index and global position
 */
export function computeDropIntent(input: DropIntentInput): DropIntent {
  const {
    pointerY,
    headerOffset,
    containerTop,
    scrollTop,
    rowHeight,
    virtualItems,
    filteredTracks,
    draggedTrackPositions,
    dragCount,
  } = input;

  // Calculate relative Y position within the scrollable container
  const relativeY = pointerY - containerTop + scrollTop - headerOffset;

  // Adjust pointer position to represent the top edge of the drag overlay
  // Base adjustment: rowHeight / 2 (pointer is typically in middle of row)
  // Multi-select adjustment: (dragCount - 1) * rowHeight / 2 (overlay is taller)
  const overlayOffset = Math.max(0, (dragCount - 1) * rowHeight / 2);
  const adjustedY = relativeY - (rowHeight / 2) - overlayOffset;

  // Find the insertion index in the filtered view
  let insertionIndexFiltered = filteredTracks.length; // Default: append to end

  for (let i = 0; i < virtualItems.length; i++) {
    const item = virtualItems[i];
    if (!item) continue;

    const itemMiddle = item.start + item.size / 2;

    // If adjusted Y (top of drag overlay) is above the row's middle, insert before this row
    if (adjustedY < itemMiddle) {
      insertionIndexFiltered = item.index;
      break;
    }
  }

  // Map filtered index to global playlist position, excluding dragged tracks
  const insertBeforeGlobal = mapToGlobalPosition(
    insertionIndexFiltered,
    filteredTracks,
    draggedTrackPositions
  );

  return {
    insertionIndexFiltered,
    insertBeforeGlobal,
  };
}

/**
 * Map filtered index to global playlist position.
 *
 * When computing the drop target, we need to exclude dragged tracks from being
 * valid targets. This prevents:
 * - Dropping "on top of" a selected track
 * - Using a dragged track's position as the target index
 *
 * The algorithm:
 * 1. If dropping after all visible tracks, use lastTrack.position + 1
 * 2. Find the first non-dragged track at or after insertionIndexFiltered
 * 3. If all tracks after insertion are dragged, use position after last track
 * 4. If insertion is before first track, check if first track is dragged:
 *    - If not dragged: use its position
 *    - If dragged: scan forward for first non-dragged track
 *
 * @param insertionIndexFiltered - Index in filtered track list
 * @param filteredTracks - Filtered/visible tracks
 * @param draggedTrackPositions - Positions to exclude as targets
 * @returns Global playlist position for insertion
 */
function mapToGlobalPosition(
  insertionIndexFiltered: number,
  filteredTracks: Track[],
  draggedTrackPositions: number[]
): number {
  if (filteredTracks.length === 0) {
    return 0;
  }

  // Dropping after last visible track
  if (insertionIndexFiltered >= filteredTracks.length) {
    const lastTrack = filteredTracks[filteredTracks.length - 1];
    return (lastTrack?.position ?? filteredTracks.length - 1) + 1;
  }

  // Find the first non-dragged track at or after insertion index
  for (let i = insertionIndexFiltered; i < filteredTracks.length; i++) {
    const track = filteredTracks[i];
    const position = track?.position ?? i;

    // Skip if this track is being dragged
    if (draggedTrackPositions.includes(position)) {
      continue;
    }

    // Found a non-dragged track - use its position
    return position;
  }

  // All tracks at and after insertion index are dragged
  // Use position after last track
  const lastTrack = filteredTracks[filteredTracks.length - 1];
  return (lastTrack?.position ?? filteredTracks.length - 1) + 1;
}
