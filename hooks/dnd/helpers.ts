/**
 * DnD Helper Functions
 *
 * Utility functions for drag-and-drop operations
 */

import type { Track } from '@/lib/spotify/types';
import type { TrackWithPositions } from './types';

/**
 * Get tracks to drag from browse panel drag data.
 * Consolidates logic for extracting multi-select tracks from Search, Recommendations, and Last.fm panels.
 * 
 * @param sourceData - The drag source data from active.data.current
 * @param fallbackTrack - The single track to use if no selection exists
 * @returns Array of track URIs to add to playlist
 */
export function getBrowsePanelDragUris(
  sourceData: Record<string, unknown> | undefined,
  fallbackTrack: Track | undefined
): string[] {
  // First check for selectedTracks (Search/Recommendations panels)
  const selectedTracks = sourceData?.selectedTracks as Track[] | undefined;
  if (selectedTracks && selectedTracks.length > 0) {
    return selectedTracks.map(t => t.uri).filter(Boolean);
  }
  
  // Fall back to single track
  if (fallbackTrack?.uri) {
    return [fallbackTrack.uri];
  }
  
  return [];
}

/**
 * Builds tracks array with positions for precise removal (handles duplicate tracks).
 * Groups tracks by URI and collects their positions.
 */
export function buildTracksWithPositions(
  dragTracks: Track[],
  orderedTracks: Track[]
): TrackWithPositions[] {
  const uriToPositions = new Map<string, number[]>();

  dragTracks.forEach((track) => {
    // Find the track's index in orderedTracks to get its position
    const idx = orderedTracks.findIndex(
      (ot) => (ot.id || ot.uri) === (track.id || track.uri) && ot.position === track.position
    );
    const position = track.position ?? (idx >= 0 ? idx : 0);

    const positions = uriToPositions.get(track.uri) || [];
    positions.push(position);
    uriToPositions.set(track.uri, positions);
  });

  const result: TrackWithPositions[] = [];
  uriToPositions.forEach((positions, uri) => {
    result.push({ uri, positions });
  });

  return result;
}

/**
 * Compute adjusted target index when moving within the same playlist.
 * Accounts for the fact that removed items affect target position.
 */
export function computeAdjustedTargetIndex(
  targetIdx: number,
  dragList: Track[],
  ordered: Track[],
  sourcePlId?: string | null,
  targetPlId?: string | null
): number {
  if (!sourcePlId || !targetPlId) return targetIdx;
  if (sourcePlId !== targetPlId) return targetIdx;
  if (!dragList.length) return targetIdx;

  const indices = dragList
    .map((t) => ordered.findIndex((ot) => (ot.id || ot.uri) === (t.id || t.uri)))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  const removedBefore = indices.filter((i) => i < targetIdx).length;
  return Math.max(0, targetIdx - removedBefore);
}

/**
 * Check if selected tracks form a contiguous range in the track list.
 */
export function isContiguousRange(
  dragTracks: Track[],
  orderedTracks: Track[]
): boolean {
  if (dragTracks.length <= 1) return true;

  const indices = dragTracks
    .map((t) =>
      orderedTracks.findIndex(
        (ot) => (ot?.id || ot?.uri) === (t?.id || t?.uri)
      )
    )
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  const first = indices[0];
  const last = indices[indices.length - 1];

  if (
    indices.length !== dragTracks.length ||
    first === undefined ||
    last === undefined
  ) {
    return false;
  }

  return last - first + 1 === indices.length;
}

/**
 * Get track positions (global playlist positions) from filtered indices.
 */
export function getTrackPositions(
  indices: number[],
  orderedTracks: Track[]
): number[] {
  return indices
    .map((idx) => orderedTracks[idx]?.position ?? idx)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);
}
