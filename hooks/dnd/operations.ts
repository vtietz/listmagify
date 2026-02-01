/**
 * DnD Pure Business Logic Operations
 *
 * Testable pure functions for drag-and-drop decision making.
 * These functions have no side effects and can be easily unit tested.
 */

import type { Track } from '@/lib/spotify/types';
import { getTrackSelectionKey } from '@/lib/dnd/selection';

/**
 * Determine which tracks should be dragged based on selection state.
 * Returns the tracks to drag and their indices in the ordered list.
 */
export function determineDragTracks(
  draggedTrack: Track,
  draggedTrackIndex: number,
  panelSelection: Set<string>,
  orderedTracks: Track[]
): { dragTracks: Track[]; selectedIndices: number[] } {
  const draggedTrackKey = getTrackSelectionKey(draggedTrack, draggedTrackIndex);
  const isDraggedTrackSelected = panelSelection.has(draggedTrackKey);

  if (isDraggedTrackSelected && panelSelection.size > 0) {
    // Dragged track is in selection - use all selected tracks
    const selectedWithIndices = orderedTracks
      .map((t, idx) => ({ t, idx }))
      .filter(({ t, idx }) => panelSelection.has(getTrackSelectionKey(t, idx)));
    
    return {
      dragTracks: selectedWithIndices.map(({ t }) => t),
      selectedIndices: selectedWithIndices.map(({ idx }) => idx),
    };
  }

  // Dragged track is NOT in selection - just drag this single track
  return {
    dragTracks: [draggedTrack],
    selectedIndices: draggedTrackIndex >= 0 ? [draggedTrackIndex] : [],
  };
}

/**
 * Determine the effective DnD mode (copy or move) based on context.
 * 
 * @param isSamePanelSamePlaylist - Whether source and target are the same panel and playlist
 * @param sourceDndMode - The configured mode for the source panel
 * @param isCtrlPressed - Whether Ctrl/Cmd key is pressed
 * @param canInvertMode - Whether the source panel allows mode inversion (editable playlists only)
 */
export function determineEffectiveMode(
  isSamePanelSamePlaylist: boolean,
  sourceDndMode: 'copy' | 'move',
  isCtrlPressed: boolean,
  canInvertMode: boolean
): 'copy' | 'move' {
  // Same panel, same playlist: ALWAYS move (reorder), regardless of dndMode or Ctrl
  if (isSamePanelSamePlaylist) {
    return 'move';
  }

  // Different panels (cross-panel): respect panel's dndMode setting with Ctrl inversion
  if (isCtrlPressed && canInvertMode) {
    return sourceDndMode === 'copy' ? 'move' : 'copy';
  }

  return sourceDndMode;
}

/**
 * Determine whether to adjust the target index for removed tracks.
 * 
 * Single track drops with computed position don't need adjustment (pointer is accurate).
 * Multi-track or clicked positions need adjustment because tracks are removed before insertion.
 */
export function shouldAdjustTargetIndex(
  finalDropPosition: number | null,
  dragTracksCount: number
): boolean {
  return !(finalDropPosition !== null && dragTracksCount === 1);
}

/**
 * Validate if a drop operation can proceed.
 * Returns null if valid, or an error message if invalid.
 */
export function validateDropOperation(
  sourceData: Record<string, unknown> | undefined,
  targetData: Record<string, unknown> | undefined,
  over: unknown
): string | null {
  if (!over) {
    return 'No drop target';
  }

  if (!sourceData) {
    return 'Missing source data';
  }

  const sourceType = sourceData.type as string;
  if (sourceType !== 'track' && sourceType !== 'lastfm-track') {
    return 'Invalid source type';
  }

  if (!targetData) {
    return 'Missing target data';
  }

  const targetType = targetData.type as string;
  if (targetType !== 'track' && targetType !== 'panel' && targetType !== 'player') {
    return 'Invalid target type';
  }

  return null;
}

/**
 * Check if the drop is from a browse panel (Search, Recommendations, Last.fm)
 * These panels have no source playlist ID.
 */
export function isBrowsePanelDrop(
  sourcePlaylistId: string | null | undefined,
  sourcePanelId: string | null | undefined
): boolean {
  return !sourcePlaylistId && !!sourcePanelId;
}

/**
 * Calculate the effective target index after accounting for track removal.
 * This is a convenience wrapper for computeAdjustedTargetIndex with cleaner semantics.
 */
export function calculateEffectiveTargetIndex(
  targetIndex: number,
  shouldAdjust: boolean,
  computeAdjustment: () => number
): number {
  return shouldAdjust ? computeAdjustment() : targetIndex;
}
