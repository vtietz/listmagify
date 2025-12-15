/**
 * Utility functions for computing drag-and-drop index calculations.
 * Handles conversion between filtered view indices and actual playlist indices.
 */

export interface Track {
  id: string | null;
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

// ============================================================
// Infinite Query Page Manipulation Helpers
// ============================================================

interface PlaylistTracksPage {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
}

interface InfiniteData<T> {
  pages: T[];
  pageParams: unknown[];
}

/**
 * Flatten all tracks from infinite query pages into a single array.
 * Optionally de-duplicates based on track URI.
 */
export function flattenInfinitePages(
  data: InfiniteData<PlaylistTracksPage> | undefined,
  dedupe = true
): Track[] {
  if (!data?.pages) return [];
  
  const tracks: Track[] = [];
  const seen = new Set<string>();
  
  for (const page of data.pages) {
    for (const track of page.tracks) {
      if (dedupe && seen.has(track.uri)) continue;
      if (dedupe) seen.add(track.uri);
      tracks.push(track);
    }
  }
  
  return tracks;
}

/**
 * Update position field on all tracks to reflect their index in the array.
 * This ensures the UI shows correct positions after reorder operations.
 */
function updateTrackPositions(tracks: Track[]): Track[] {
  return tracks.map((track, index) => ({
    ...track,
    position: index,
    // Keep originalPosition stable for sorting reference
    originalPosition: track.originalPosition ?? track.position ?? index,
  }));
}

/**
 * Distribute a flat track array back into pages, preserving page structure.
 * Used after reordering to rebuild infinite query cache.
 * Automatically updates position fields to reflect new order.
 */
export function rebuildInfinitePages(
  originalData: InfiniteData<PlaylistTracksPage>,
  newTracks: Track[]
): InfiniteData<PlaylistTracksPage> {
  // Update positions on all tracks first
  const tracksWithPositions = updateTrackPositions(newTracks);
  
  const newPages: PlaylistTracksPage[] = [];
  let trackIndex = 0;
  
  for (let i = 0; i < originalData.pages.length; i++) {
    const originalPage = originalData.pages[i];
    if (!originalPage) continue;
    
    const pageSize = originalPage.tracks.length;
    const pageTracks = tracksWithPositions.slice(trackIndex, trackIndex + pageSize);
    trackIndex += pageSize;
    
    newPages.push({
      ...originalPage,
      tracks: pageTracks,
    });
  }
  
  // Handle case where tracks overflow original page structure
  // (shouldn't happen in normal reorder, but handle gracefully)
  if (trackIndex < tracksWithPositions.length && newPages.length > 0) {
    const lastPage = newPages[newPages.length - 1];
    if (lastPage) {
      lastPage.tracks = [...lastPage.tracks, ...tracksWithPositions.slice(trackIndex)];
    }
  }
  
  return {
    pages: newPages,
    pageParams: originalData.pageParams,
  };
}

/**
 * Apply a reorder operation to infinite query data.
 * Handles the splice logic for moving track ranges.
 */
export function applyReorderToInfinitePages(
  data: InfiniteData<PlaylistTracksPage>,
  fromIndex: number,
  toIndex: number,
  rangeLength: number = 1
): InfiniteData<PlaylistTracksPage> {
  // Flatten tracks
  const allTracks = flattenInfinitePages(data, false);
  
  // Apply reorder: splice out moved items, then insert at new position
  const movedItems = allTracks.splice(fromIndex, rangeLength);
  
  // Calculate insert position (adjusting for removed items)
  const insertAt = toIndex > fromIndex 
    ? toIndex - rangeLength 
    : toIndex;
  
  allTracks.splice(insertAt, 0, ...movedItems);
  
  // Rebuild pages
  return rebuildInfinitePages(data, allTracks);
}

/**
 * Apply a remove operation to infinite query data.
 * Removes tracks matching the given URIs.
 */
export function applyRemoveToInfinitePages(
  data: InfiniteData<PlaylistTracksPage>,
  trackUris: string[]
): InfiniteData<PlaylistTracksPage> {
  const uriSet = new Set(trackUris);
  
  // Flatten and filter
  const allTracks = flattenInfinitePages(data, false);
  const filteredTracks = allTracks.filter(track => !uriSet.has(track.uri));
  
  // Rebuild pages with updated total
  const newData = rebuildInfinitePages(data, filteredTracks);
  
  // Update total in all pages
  const newTotal = filteredTracks.length;
  for (const page of newData.pages) {
    page.total = newTotal;
  }
  
  return newData;
}

/**
 * Apply an add/insert operation to infinite query data.
 * Inserts new tracks at the specified position.
 */
export function applyAddToInfinitePages(
  data: InfiniteData<PlaylistTracksPage>,
  newTracks: Track[],
  position?: number
): InfiniteData<PlaylistTracksPage> {
  // Flatten tracks
  const allTracks = flattenInfinitePages(data, false);
  
  // Insert at position (or append if not specified)
  const insertAt = position ?? allTracks.length;
  allTracks.splice(insertAt, 0, ...newTracks);
  
  // Rebuild pages with updated total
  const newData = rebuildInfinitePages(data, allTracks);
  
  // Update total in all pages
  const newTotal = allTracks.length;
  for (const page of newData.pages) {
    page.total = newTotal;
  }
  
  return newData;
}
