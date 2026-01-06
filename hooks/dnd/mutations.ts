/**
 * DnD Mutation Handlers
 *
 * Extracted mutation logic from useDndOrchestrator for different drop scenarios.
 * Each handler returns true if the operation was handled, false otherwise.
 */

import type { Track } from '@/lib/spotify/types';
import type { PanelConfig, TrackWithPositions } from './types';
import { buildTracksWithPositions, getTrackPositions, isContiguousRange } from './helpers';
import { logDebug } from '@/lib/utils/debug';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

/**
 * Mutation functions passed from the hook
 */
export interface MutationHandlers {
  addTracks: {
    mutate: (params: {
      playlistId: string;
      trackUris: string[];
      position: number;
    }, options?: { onSuccess?: () => void }) => void;
  };
  removeTracks: {
    mutate: (params: {
      playlistId: string;
      tracks: TrackWithPositions[];
    }) => void;
  };
  reorderTracks: {
    mutate: (params: {
      playlistId: string;
      fromIndex: number;
      toIndex: number;
      rangeLength?: number;
    }) => void;
  };
}

/**
 * Context for drop operations
 */
export interface DropContext {
  panels: PanelConfig[];
  mutations: MutationHandlers;
  selectedIndices: number[];
  orderedTracks: Track[];
  /** Optional callback to clear UI selection after drop (e.g., Last.fm selection) */
  clearSelection?: () => void;
}

/**
 * Handle Last.fm track drop (copy only - no source playlist)
 * Returns true if handled, false if should continue to next handler
 */
export function handleLastfmDrop(
  matchedTrack: Track | null | undefined,
  selectedMatchedUris: string[] | undefined,
  targetPanelId: string,
  targetPlaylistId: string,
  targetIndex: number,
  context: DropContext
): boolean {
  const { panels, mutations } = context;

  // Find target panel and verify it's editable
  const targetPanel = panels.find((p) => p.id === targetPanelId);
  if (!targetPanel || !targetPanel.isEditable) {
    toast.error('Target playlist is not editable');
    return true; // Handled (with error)
  }

  // Determine track URIs to add
  let trackUris: string[];

  if (selectedMatchedUris && selectedMatchedUris.length > 0) {
    // Multi-selection: use pre-computed matched URIs from drag data
    trackUris = selectedMatchedUris;

    // Clear selection after successful drag via context callback
    context.clearSelection?.();
  } else if (matchedTrack?.uri) {
    // Single track: use the matched track from drag data
    trackUris = [matchedTrack.uri];
  } else {
    toast.error('Track not matched to Spotify');
    return true; // Handled (with error)
  }

  logDebug('✅ ADD from Last.fm:', trackUris.length, 'tracks →', targetPlaylistId, 'at', targetIndex);

  // Add tracks to target playlist
  mutations.addTracks.mutate({
    playlistId: targetPlaylistId,
    trackUris,
    position: targetIndex,
  });

  return true;
}

/**
 * Handle same panel, same playlist operations (reorder or copy duplicate)
 */
export function handleSamePanelDrop(
  effectiveMode: 'copy' | 'move',
  sourceIndex: number,
  targetIndex: number,
  effectiveTargetIndex: number,
  dragTracks: Track[],
  dragTrackUris: string[],
  sourcePlaylistId: string,
  targetPlaylistId: string,
  context: DropContext
): boolean {
  const { mutations, selectedIndices, orderedTracks } = context;

  // Copy mode: add duplicates
  if (effectiveMode === 'copy') {
    logDebug('✅ COPY (add duplicate):', dragTrackUris.length, 'tracks →', targetIndex);
    mutations.addTracks.mutate({
      playlistId: targetPlaylistId,
      trackUris: dragTrackUris,
      position: targetIndex, // Use raw targetIndex for copy
    });
    return true;
  }

  // Move mode: reorder operations
  if (dragTracks.length === 1) {
    logDebug('✅ REORDER single:', sourceIndex, '→', effectiveTargetIndex);
    console.debug('[DND] end: branch = single-item', {
      sourceIndex,
      targetIndex: effectiveTargetIndex,
    });
    if (sourceIndex === targetIndex) return true;
    mutations.reorderTracks.mutate({
      playlistId: targetPlaylistId,
      fromIndex: sourceIndex,
      toIndex: effectiveTargetIndex,
    });
    return true;
  }

  const isContiguousSelection = isContiguousRange(dragTracks, orderedTracks);

  if (isContiguousSelection) {
    const indices =
      selectedIndices.length > 0
        ? selectedIndices.slice().sort((a, b) => a - b)
        : dragTracks
            .map((t) => orderedTracks.findIndex((ot) => (ot.id || ot.uri) === (t.id || t.uri)))
            .filter((i) => i >= 0)
            .sort((a, b) => a - b);

    // Use track positions (global playlist positions) not filtered indices
    const trackPositions = getTrackPositions(indices, orderedTracks);
    const fromIndex = trackPositions[0] ?? sourceIndex;
    const rangeLength = trackPositions.length || 1;

    logDebug('✅ REORDER contiguous:', trackPositions, '→', effectiveTargetIndex, `(${rangeLength} tracks)`);
    console.debug('[DND] end: branch = contiguous', {
      fromIndex,
      toIndex: effectiveTargetIndex,
      rangeLength,
      indices: trackPositions.slice(0, 25),
    });

    mutations.reorderTracks.mutate({
      playlistId: targetPlaylistId,
      fromIndex,
      toIndex: effectiveTargetIndex,
      rangeLength,
    });
    return true;
  }

  // Non-contiguous move within same playlist: fall back to remove + add
  logDebug('✅ REORDER non-contiguous:', selectedIndices, '→', effectiveTargetIndex, '(add+remove)');
  console.debug('[DND] end: branch = non-contiguous', {
    toIndex: effectiveTargetIndex,
    trackCount: dragTrackUris.length,
  });

  // Build tracks with positions for precise removal (handles duplicate tracks)
  const tracksWithPositions = buildTracksWithPositions(dragTracks, orderedTracks);

  mutations.addTracks.mutate(
    {
      playlistId: targetPlaylistId,
      trackUris: dragTrackUris,
      position: effectiveTargetIndex,
    },
    {
      onSuccess: () => {
        mutations.removeTracks.mutate({
          playlistId: sourcePlaylistId,
          tracks: tracksWithPositions,
        });
      },
    }
  );

  return true;
}

/**
 * Handle cross-panel operations (same or different playlist)
 */
export function handleCrossPanelDrop(
  effectiveMode: 'copy' | 'move',
  sourceIndex: number,
  targetIndex: number,
  effectiveTargetIndex: number,
  dragTracks: Track[],
  dragTrackUris: string[],
  sourcePlaylistId: string,
  targetPlaylistId: string,
  sourcePanel: PanelConfig,
  context: DropContext
): boolean {
  const { mutations, selectedIndices, orderedTracks } = context;
  const isSamePlaylist = sourcePlaylistId === targetPlaylistId;

  logDebug('[DragEnd] Cross-panel operation:', {
    sourcePlaylistId,
    targetPlaylistId,
    sourceIsEditable: sourcePanel.isEditable,
    effectiveMode,
    samePlaylist: isSamePlaylist,
  });

  if (isSamePlaylist) {
    // Same playlist, different panels
    if (effectiveMode === 'copy') {
      logDebug('✅ COPY same playlist, cross-panel:', dragTrackUris.length, 'tracks →', targetIndex);
      mutations.addTracks.mutate({
        playlistId: targetPlaylistId,
        trackUris: dragTrackUris,
        position: targetIndex, // Use raw targetIndex for copy (no adjustment needed)
      });
      return true;
    }

    // Move within same playlist across panels
    // IMPORTANT: Must use reorder API, not add+remove, because remove by URI
    // would remove ALL occurrences including the newly added tracks
    const isContiguousSelection = isContiguousRange(dragTracks, orderedTracks);

    if (isContiguousSelection && dragTracks.length > 1) {
      // Contiguous multi-track: use rangeLength reorder
      const indices =
        selectedIndices.length > 0
          ? selectedIndices.slice().sort((a, b) => a - b)
          : dragTracks
              .map((t) => orderedTracks.findIndex((ot) => (ot?.id || ot?.uri) === (t?.id || t?.uri)))
              .filter((i) => i >= 0)
              .sort((a, b) => a - b);

      const trackPositions = getTrackPositions(indices, orderedTracks);
      const fromIndex = trackPositions[0] ?? sourceIndex;
      const rangeLength = trackPositions.length || 1;

      logDebug('✅ REORDER cross-panel (contiguous):', trackPositions, '→', effectiveTargetIndex, `(${rangeLength} tracks)`);
      mutations.reorderTracks.mutate({
        playlistId: targetPlaylistId,
        fromIndex,
        toIndex: effectiveTargetIndex,
        rangeLength,
      });
    } else {
      // Non-contiguous or single track: use reorder API for each track
      logDebug('✅ REORDER cross-panel (single/non-contiguous):', dragTracks.map((t) => t.position), '→', effectiveTargetIndex);
      mutations.reorderTracks.mutate({
        playlistId: targetPlaylistId,
        fromIndex: sourceIndex,
        toIndex: effectiveTargetIndex,
        rangeLength: 1,
      });
    }
    return true;
  }

  // Different playlists
  if (effectiveMode === 'copy') {
    // Copy to target at mouse position
    mutations.addTracks.mutate({
      playlistId: targetPlaylistId,
      trackUris: dragTrackUris,
      position: targetIndex,
    });
  } else {
    // Move to target at mouse position
    mutations.addTracks.mutate(
      {
        playlistId: targetPlaylistId,
        trackUris: dragTrackUris,
        position: targetIndex,
      },
      {
        onSuccess: () => {
          // Only remove from source if it's editable
          if (sourcePanel.isEditable) {
            // Build tracks with positions for precise removal (handles duplicate tracks)
            const tracksWithPositions = buildTracksWithPositions(dragTracks, orderedTracks);
            mutations.removeTracks.mutate({
              playlistId: sourcePlaylistId,
              tracks: tracksWithPositions,
            });
          }
        },
      }
    );
  }

  return true;
}
