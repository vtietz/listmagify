import type { Track } from '@/lib/spotify/types';

/**
 * Selection state for tracks in a playlist.
 */
export interface SelectionState {
  /** Set of selected track IDs or URIs */
  selectedIds: Set<string>;
  /** ID of the last selected item (for shift-click range selection) */
  lastSelectedId: string | null;
}

/**
 * Creates an empty selection state.
 */
export function createEmptySelection(): SelectionState {
  return {
    selectedIds: new Set(),
    lastSelectedId: null,
  };
}

/**
 * Gets array of selected track IDs from selection state.
 * 
 * @param selection - Current selection state
 * @returns Array of selected track IDs
 */
export function getSelectedTrackIds(selection: SelectionState): string[] {
  return Array.from(selection.selectedIds);
}

/**
 * Checks if a track is currently selected.
 * 
 * @param selection - Current selection state
 * @param trackId - Track ID or URI to check
 * @returns True if track is selected
 */
export function isTrackSelected(selection: SelectionState, trackId: string): boolean {
  return selection.selectedIds.has(trackId);
}

/**
 * Toggles selection state of a single track.
 * 
 * @param selection - Current selection state
 * @param trackId - Track ID or URI to toggle
 * @returns New selection state
 */
export function toggleTrackSelection(
  selection: SelectionState,
  trackId: string
): SelectionState {
  const newSelectedIds = new Set(selection.selectedIds);
  
  if (newSelectedIds.has(trackId)) {
    newSelectedIds.delete(trackId);
    return {
      selectedIds: newSelectedIds,
      lastSelectedId: newSelectedIds.size > 0 ? selection.lastSelectedId : null,
    };
  } else {
    newSelectedIds.add(trackId);
    return {
      selectedIds: newSelectedIds,
      lastSelectedId: trackId,
    };
  }
}

/**
 * Selects a single track (clears other selections).
 * 
 * @param trackId - Track ID or URI to select
 * @returns New selection state with only this track selected
 */
export function selectSingleTrack(trackId: string): SelectionState {
  return {
    selectedIds: new Set([trackId]),
    lastSelectedId: trackId,
  };
}

/**
 * Selects multiple tracks (clears other selections).
 * 
 * @param trackIds - Array of track IDs or URIs to select
 * @returns New selection state with these tracks selected
 */
export function selectMultipleTracks(trackIds: string[]): SelectionState {
  return {
    selectedIds: new Set(trackIds),
    lastSelectedId: trackIds[trackIds.length - 1] || null,
  };
}

/**
 * Selects a range of tracks between two indices (for shift-click).
 * 
 * @param selection - Current selection state
 * @param tracks - Array of all tracks in order
 * @param clickedTrackId - ID of the clicked track
 * @returns New selection state with range selected
 */
export function selectTrackRange(
  selection: SelectionState,
  tracks: Track[],
  clickedTrackId: string
): SelectionState {
  if (!selection.lastSelectedId) {
    // No previous selection, just select the clicked track
    return selectSingleTrack(clickedTrackId);
  }

  // Find indices of last selected and clicked tracks
  const lastIndex = tracks.findIndex(t => (t.id || t.uri) === selection.lastSelectedId);
  const clickedIndex = tracks.findIndex(t => (t.id || t.uri) === clickedTrackId);

  if (lastIndex === -1 || clickedIndex === -1) {
    // Can't find one of the tracks, just select clicked
    return selectSingleTrack(clickedTrackId);
  }

  // Select all tracks between last and clicked (inclusive)
  const startIndex = Math.min(lastIndex, clickedIndex);
  const endIndex = Math.max(lastIndex, clickedIndex);
  const rangeTrackIds = tracks
    .slice(startIndex, endIndex + 1)
    .map(t => t.id || t.uri);

  return {
    selectedIds: new Set(rangeTrackIds),
    lastSelectedId: clickedTrackId,
  };
}

/**
 * Adds multiple tracks to current selection (preserves existing).
 * 
 * @param selection - Current selection state
 * @param trackIds - Array of track IDs to add
 * @returns New selection state
 */
export function addToSelection(
  selection: SelectionState,
  trackIds: string[]
): SelectionState {
  const newSelectedIds = new Set(selection.selectedIds);
  trackIds.forEach(id => newSelectedIds.add(id));

  return {
    selectedIds: newSelectedIds,
    lastSelectedId: trackIds[trackIds.length - 1] || selection.lastSelectedId,
  };
}

/**
 * Removes multiple tracks from current selection.
 * 
 * @param selection - Current selection state
 * @param trackIds - Array of track IDs to remove
 * @returns New selection state
 */
export function removeFromSelection(
  selection: SelectionState,
  trackIds: string[]
): SelectionState {
  const newSelectedIds = new Set(selection.selectedIds);
  trackIds.forEach(id => newSelectedIds.delete(id));

  return {
    selectedIds: newSelectedIds,
    lastSelectedId: newSelectedIds.size > 0 ? selection.lastSelectedId : null,
  };
}

/**
 * Clears all selections.
 * 
 * @returns Empty selection state
 */
export function clearSelection(): SelectionState {
  return createEmptySelection();
}

/**
 * Gets the number of selected tracks.
 * 
 * @param selection - Current selection state
 * @returns Count of selected tracks
 */
export function getSelectionCount(selection: SelectionState): number {
  return selection.selectedIds.size;
}
