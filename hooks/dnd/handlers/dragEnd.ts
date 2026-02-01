/**
 * Drag End Handler
 *
 * Handles the completion of a drag operation, including:
 * - Validating the drop target
 * - Executing mutations (copy, move, reorder)
 * - Handling different source types (playlist, browse, Last.fm, player)
 */

import type { DragEndEvent } from '@dnd-kit/core';
import type { Track } from '@/lib/spotify/types';
import type { PanelConfig, PanelVirtualizerData } from '../types';
import type { DropContext, MutationHandlers } from '../mutations';
import {
  handleLastfmDrop,
  handleSamePanelDrop,
  handleCrossPanelDrop,
} from '../mutations';
import { computeAdjustedTargetIndex, getBrowsePanelDragUris } from '../helpers';
import {
  determineEffectiveMode,
  shouldAdjustTargetIndex,
  calculateEffectiveTargetIndex,
} from '../operations';
import { useBrowsePanelStore } from '../../useBrowsePanelStore';
import { apiFetch } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { logDebug } from '@/lib/utils/debug';

/**
 * Context required for drag end handling
 */
export interface DragEndContext {
  panels: PanelConfig[];
  panelVirtualizersRef: React.RefObject<Map<string, PanelVirtualizerData>>;
  pointerTracker: {
    getModifiers: () => { ctrlKey: boolean; shiftKey: boolean; altKey: boolean };
  };
  mutations: MutationHandlers;
  getFinalDropPosition: () => number | null;
  getSelectedIndices: () => number[];
  getOrderedTracksSnapshot: () => Track[];
  endDrag: () => void;
}

/**
 * Handle drop onto player (play tracks)
 */
async function handlePlayerDrop(
  sourceData: Record<string, unknown>,
  sourceTrack: Track
): Promise<void> {
  const trackUris = getBrowsePanelDragUris(sourceData, sourceTrack);

  if (trackUris.length > 0) {
    try {
      await apiFetch<{ success?: boolean }>('/api/player/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'play',
          uris: trackUris,
        }),
      });

      const message = trackUris.length > 1
        ? `Playing ${trackUris.length} tracks`
        : `Playing "${sourceTrack?.name ?? 'tracks'}"`;
      toast.success(message);
    } catch (error) {
      console.error('[DND] Failed to play track:', error);
    }
  }
}

/**
 * Handle browse panel drop (Search, Recommendations)
 */
function handleBrowsePanelCopyDrop(
  sourceData: Record<string, unknown>,
  targetData: Record<string, unknown>,
  sourceTrack: Track,
  targetPlaylistId: string,
  _targetPanelId: string, // Used for logging only
  targetPanel: PanelConfig | undefined,
  finalDropPosition: number | null,
  addTracks: DragEndContext['mutations']['addTracks']
): boolean {
  if (!targetPanel?.isEditable) {
    toast.error('Target playlist is not editable');
    return false;
  }

  const targetIndex = finalDropPosition ?? (targetData.position as number ?? 0);
  const trackUris = getBrowsePanelDragUris(sourceData, sourceTrack);

  if (trackUris.length === 0) {
    console.error('[DND] No track URIs to add');
    return false;
  }

  console.debug('[DND] Adding tracks from search/player to playlist:', {
    playlistId: targetPlaylistId,
    trackUris,
    trackCount: trackUris.length,
    targetIndex
  });

  addTracks.mutate({
    playlistId: targetPlaylistId,
    trackUris,
    position: targetIndex,
  });

  return true;
}

/**
 * Create drag end handler
 */
export function createDragEndHandler(ctx: DragEndContext) {
  return (event: DragEndEvent): void => {
    const { active, over } = event;

    // Capture final drop position before resetting state
    const finalDropPosition = ctx.getFinalDropPosition();
    const selectedIndices = ctx.getSelectedIndices();
    const orderedTracksSnapshot = ctx.getOrderedTracksSnapshot();

    // Reset drag state
    ctx.endDrag();

    if (!over || active.id === over.id) {
      return;
    }

    // Extract source and target data
    const sourceData = active.data.current;
    const targetData = over.data.current;

    // Source must be a track or lastfm-track
    if (!sourceData || (sourceData.type !== 'track' && sourceData.type !== 'lastfm-track')) {
      return;
    }

    // Handle drop onto player
    if (targetData?.type === 'player') {
      handlePlayerDrop(sourceData, sourceData?.track as Track);
      return;
    }

    // Target can be either a track or a panel
    if (!targetData || (targetData.type !== 'track' && targetData.type !== 'panel')) {
      return;
    }

    // Handle Last.fm track drops
    if (sourceData.type === 'lastfm-track') {
      const targetPanelId = targetData.panelId;
      const targetPlaylistId = targetData.playlistId;

      if (!targetPanelId || !targetPlaylistId) {
        console.error('Missing target panel or playlist context');
        return;
      }

      const targetIndex = finalDropPosition ?? (targetData.position ?? 0);
      const dropContext: DropContext = {
        panels: ctx.panels,
        mutations: ctx.mutations,
        selectedIndices: [],
        orderedTracks: [],
        clearSelection: useBrowsePanelStore.getState().clearLastfmSelection,
      };

      handleLastfmDrop(
        sourceData.matchedTrack,
        sourceData.selectedMatchedUris as string[] | undefined,
        targetPanelId,
        targetPlaylistId,
        targetIndex,
        dropContext
      );
      return;
    }

    const sourcePanelIdFromData = sourceData.panelId;
    const targetPanelId = targetData.panelId;
    const sourcePlaylistId = sourceData.playlistId;
    const targetPlaylistId = targetData.playlistId;
    const sourceTrack: Track = sourceData.track;
    const sourceIndex: number = sourceData.position;

    // Handle Spotify search results and player (copy only - no source playlist)
    if (!sourcePlaylistId && sourcePanelIdFromData && targetPlaylistId && targetPanelId) {
      const targetPanel = ctx.panels.find((p) => p.id === targetPanelId);
      handleBrowsePanelCopyDrop(
        sourceData,
        targetData,
        sourceTrack,
        targetPlaylistId,
        targetPanelId,
        targetPanel,
        finalDropPosition,
        ctx.mutations.addTracks
      );
      return;
    }

    // Use snapshot from drag start
    const orderedTracks = orderedTracksSnapshot.length > 0
      ? orderedTracksSnapshot
      : (ctx.panelVirtualizersRef.current?.get(sourcePanelIdFromData)?.filteredTracks ?? []);
    const selectedTracks = selectedIndices.map(idx => orderedTracks[idx]).filter((t): t is Track => t != null);
    const dragTracks = (selectedTracks.length ? selectedTracks : [sourceTrack]);
    const dragTrackUris = dragTracks.map((t) => t.uri);

    const targetIndex: number = finalDropPosition ?? (targetData.position ?? 0);

    logDebug('🎯 DROP:', {
      from: selectedIndices.length > 0 ? selectedIndices : [sourceIndex],
      to: targetIndex,
      tracks: dragTracks.map(t => `#${t?.position ?? '?'} ${t?.name ?? 'unknown'}`)
    });

    console.debug('[DND] end: selection', {
      selectedCount: selectedIndices.length,
      indices: selectedIndices.slice(0, 25),
      dragTracksCount: dragTracks.length
    });

    // Adjustment logic using pure functions
    const shouldAdjust = shouldAdjustTargetIndex(finalDropPosition, dragTracks.length);
    const effectiveTargetIndex = calculateEffectiveTargetIndex(
      targetIndex,
      shouldAdjust,
      () => computeAdjustedTargetIndex(targetIndex, dragTracks, orderedTracks, sourcePlaylistId, targetPlaylistId)
    );

    if (!sourcePanelIdFromData || !targetPanelId || !sourcePlaylistId || !targetPlaylistId) {
      console.error('Missing panel or playlist context in drag event');
      return;
    }

    // Find the panels
    const sourcePanel = ctx.panels.find((p) => p.id === sourcePanelIdFromData);
    const targetPanel = ctx.panels.find((p) => p.id === targetPanelId);

    if (!sourcePanel || !targetPanel) {
      console.error('Could not find source or target panel');
      return;
    }

    if (!targetPanel.isEditable) {
      toast.error('Target playlist is not editable');
      return;
    }

    const sourceDndMode = sourcePanel.dndMode || 'copy';
    const { ctrlKey: isCtrlPressed } = ctx.pointerTracker.getModifiers();
    const canInvertMode = sourcePanel.isEditable;
    const isSamePanelSamePlaylist = sourcePanelIdFromData === targetPanelId && sourcePlaylistId === targetPlaylistId;

    const effectiveMode = determineEffectiveMode(
      isSamePanelSamePlaylist,
      sourceDndMode,
      isCtrlPressed,
      canInvertMode
    );

    const dropContext: DropContext = {
      panels: ctx.panels,
      mutations: ctx.mutations,
      selectedIndices,
      orderedTracks,
    };

    // Same panel, same playlist operations
    if (isSamePanelSamePlaylist) {
      handleSamePanelDrop(
        effectiveMode,
        sourceIndex,
        targetIndex,
        effectiveTargetIndex,
        dragTracks,
        dragTrackUris,
        sourcePlaylistId,
        targetPlaylistId,
        dropContext
      );
      return;
    }

    // Cross-panel operations
    handleCrossPanelDrop(
      effectiveMode,
      sourceIndex,
      targetIndex,
      effectiveTargetIndex,
      dragTracks,
      dragTrackUris,
      sourcePlaylistId,
      targetPlaylistId,
      sourcePanel,
      dropContext
    );
  };
}
