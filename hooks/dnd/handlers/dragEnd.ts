/**
 * Drag End Handler
 *
 * Handles the completion of a drag operation, including:
 * - Validating the drop target
 * - Executing mutations (copy, move, reorder)
 * - Handling different source types (playlist, browse, Last.fm, player)
 */

import type { DragEndEvent } from '@dnd-kit/core';
import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { PanelConfig, PanelVirtualizerData, TrackPayload } from '../types';
import type { DropContext, MutationHandlers } from '../mutations';
import {
  handleLastfmDrop,
  handleSamePanelDrop,
  handleCrossPanelDrop,
} from '../mutations';
import { computeAdjustedTargetIndex, getBrowsePanelDragPayloads, getBrowsePanelDragUris } from '../helpers';
import {
  determineEffectiveMode,
  shouldAdjustTargetIndex,
  calculateEffectiveTargetIndex,
} from '../operations';
import { useBrowsePanelStore } from '../../useBrowsePanelStore';
import { apiFetch } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { logDebug } from '@/lib/utils/debug';

function resolvePanelProviderId(panel: PanelConfig): MusicProviderId {
  return panel.providerId ?? 'spotify';
}

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
  enqueuePendingFromBrowseDrop?: (params: {
    targetPlaylistId: string;
    targetProviderId: MusicProviderId;
    insertPosition: number;
    payloads: TrackPayload[];
  }) => boolean;
  getFinalDropPosition: () => number | null;
  getSelectedIndices: () => number[];
  getOrderedTracksSnapshot: () => Track[];
  endDrag: () => void;
}

type TrackSourceData = Record<string, unknown> & {
  type: 'track';
  panelId?: string;
  playlistId?: string;
  track: Track;
  position: number;
};

type LastfmTrackSourceData = Record<string, unknown> & {
  type: 'lastfm-track';
  matchedTrack: Track;
  selectedMatchedUris?: string[];
};

type DragSourceData = TrackSourceData | LastfmTrackSourceData;

type DragTargetData = Record<string, unknown> & {
  type: 'track' | 'panel';
  panelId?: string;
  playlistId?: string;
  position?: number;
};

function isDragSourceData(data: unknown): data is DragSourceData {
  return Boolean(
    data
      && typeof data === 'object'
      && 'type' in data
      && (((data as { type?: string }).type === 'track') || ((data as { type?: string }).type === 'lastfm-track'))
  );
}

function isDragTargetData(data: unknown): data is DragTargetData {
  return Boolean(
    data
      && typeof data === 'object'
      && 'type' in data
      && (((data as { type?: string }).type === 'track') || ((data as { type?: string }).type === 'panel'))
  );
}

function handleLastfmTrackDrop(
  sourceData: LastfmTrackSourceData,
  targetData: DragTargetData,
  finalDropPosition: number | null,
  ctx: DragEndContext
): void {
  const targetPanelId = targetData.panelId;
  const targetPlaylistId = targetData.playlistId;

  if (!targetPanelId || !targetPlaylistId) {
    console.error('Missing target panel or playlist context');
    return;
  }

  const targetIndex = finalDropPosition ?? (targetData.position ?? 0);
  const targetPanel = ctx.panels.find((panel) => panel.id === targetPanelId);
  if (!targetPanel) {
    console.error('Missing target panel context');
    return;
  }

  const targetProviderId = resolvePanelProviderId(targetPanel);
  const dropContext: DropContext = {
    panels: ctx.panels,
    mutations: ctx.mutations,
    selectedIndices: [],
    orderedTracks: [],
    clearSelection: useBrowsePanelStore.getState().clearLastfmSelection,
  };

  handleLastfmDrop(
    sourceData.matchedTrack,
    sourceData.selectedMatchedUris,
    targetPanelId,
    targetPlaylistId,
    targetProviderId,
    targetIndex,
    dropContext
  );
}

type PlaylistDropContextData = {
  sourcePanelId: string;
  targetPanelId: string;
  sourcePlaylistId: string;
  targetPlaylistId: string;
};

function isBrowseSourceDrop(sourceData: TrackSourceData, targetData: DragTargetData): boolean {
  return Boolean(sourceData.panelId && !sourceData.playlistId && targetData.playlistId && targetData.panelId);
}

function resolvePlaylistDropContext(sourceData: TrackSourceData, targetData: DragTargetData): PlaylistDropContextData | null {
  const sourcePanelId = sourceData.panelId;
  const targetPanelId = targetData.panelId;
  const sourcePlaylistId = sourceData.playlistId;
  const targetPlaylistId = targetData.playlistId;

  if (!sourcePanelId || !targetPanelId || !sourcePlaylistId || !targetPlaylistId) {
    console.error('Missing panel or playlist context in drag event');
    return null;
  }

  return {
    sourcePanelId,
    targetPanelId,
    sourcePlaylistId,
    targetPlaylistId,
  };
}

function resolveOrderedTracks(
  sourcePanelId: string,
  orderedTracksSnapshot: Track[],
  panelVirtualizersRef: DragEndContext['panelVirtualizersRef']
): Track[] {
  if (orderedTracksSnapshot.length > 0) {
    return orderedTracksSnapshot;
  }

  return panelVirtualizersRef.current?.get(sourcePanelId)?.filteredTracks ?? [];
}

function resolveDragTracks(
  sourceTrack: Track,
  selectedIndices: number[],
  orderedTracks: Track[]
): { dragTracks: Track[]; dragTrackUris: string[] } {
  const selectedTracks = selectedIndices
    .map((idx) => orderedTracks[idx])
    .filter((track): track is Track => track != null);

  const dragTracks = selectedTracks.length > 0 ? selectedTracks : [sourceTrack];
  return {
    dragTracks,
    dragTrackUris: dragTracks.map((track) => track.uri),
  };
}

function resolveSourceAndTargetPanels(
  panels: PanelConfig[],
  sourcePanelId: string,
  targetPanelId: string
): { sourcePanel: PanelConfig; targetPanel: PanelConfig } | null {
  const sourcePanel = panels.find((panel) => panel.id === sourcePanelId);
  const targetPanel = panels.find((panel) => panel.id === targetPanelId);

  if (!sourcePanel || !targetPanel) {
    console.error('Could not find source or target panel');
    return null;
  }

  return { sourcePanel, targetPanel };
}

function canDropToTarget(targetPanel: PanelConfig): boolean {
  if (targetPanel.isEditable) {
    return true;
  }

  toast.error('Target playlist is not editable');
  return false;
}

type PlaylistDropExecutionContext = {
  sourceProviderId: MusicProviderId;
  targetProviderId: MusicProviderId;
  effectiveMode: ReturnType<typeof determineEffectiveMode>;
  isSamePanelSamePlaylist: boolean;
  sourcePanel: PanelConfig;
  selectedIndices: number[];
  orderedTracks: Track[];
};

function preparePlaylistDropExecutionContext(
  ctx: DragEndContext,
  sourcePanelId: string,
  targetPanelId: string,
  sourcePlaylistId: string,
  targetPlaylistId: string,
  selectedIndices: number[],
  orderedTracks: Track[]
): PlaylistDropExecutionContext | null {
  const panelPair = resolveSourceAndTargetPanels(ctx.panels, sourcePanelId, targetPanelId);
  if (!panelPair) {
    return null;
  }

  if (!canDropToTarget(panelPair.targetPanel)) {
    return null;
  }

  const sourceProviderId = resolvePanelProviderId(panelPair.sourcePanel);
  const targetProviderId = resolvePanelProviderId(panelPair.targetPanel);
  if (sourceProviderId !== targetProviderId) {
    toast.error('Drag and drop is only supported within the same provider');
    return null;
  }

  const sourceDndMode = panelPair.sourcePanel.dndMode || 'copy';
  const { ctrlKey: isCtrlPressed } = ctx.pointerTracker.getModifiers();
  const isSamePanelSamePlaylist = sourcePanelId === targetPanelId && sourcePlaylistId === targetPlaylistId;
  const effectiveMode = determineEffectiveMode(
    isSamePanelSamePlaylist,
    sourceDndMode,
    isCtrlPressed,
    panelPair.sourcePanel.isEditable
  );

  return {
    sourceProviderId,
    targetProviderId,
    effectiveMode,
    isSamePanelSamePlaylist,
    sourcePanel: panelPair.sourcePanel,
    selectedIndices,
    orderedTracks,
  };
}

function handlePlaylistTrackDrop(
  sourceData: TrackSourceData,
  targetData: DragTargetData,
  finalDropPosition: number | null,
  selectedIndices: number[],
  orderedTracksSnapshot: Track[],
  ctx: DragEndContext
): void {
  if (isBrowseSourceDrop(sourceData, targetData)) {
    const targetPanelId = targetData.panelId!;
    const targetPlaylistId = targetData.playlistId!;
    const targetPanel = ctx.panels.find((panel) => panel.id === targetPanelId);
    const targetProviderId = targetPanel ? resolvePanelProviderId(targetPanel) : 'spotify';

    handleBrowsePanelCopyDrop(
      sourceData,
      targetData,
      sourceData.track,
      targetPlaylistId,
      targetProviderId,
      targetPanelId,
      targetPanel,
      finalDropPosition,
      ctx.mutations.addTracks,
      ctx.enqueuePendingFromBrowseDrop
    );
    return;
  }

  const dropContextData = resolvePlaylistDropContext(sourceData, targetData);
  if (!dropContextData) {
    return;
  }

  const { sourcePanelId, targetPanelId, sourcePlaylistId, targetPlaylistId } = dropContextData;
  const orderedTracks = resolveOrderedTracks(sourcePanelId, orderedTracksSnapshot, ctx.panelVirtualizersRef);
  const { dragTracks, dragTrackUris } = resolveDragTracks(sourceData.track, selectedIndices, orderedTracks);

  const sourceIndex = sourceData.position;
  const targetIndex = finalDropPosition ?? (targetData.position ?? 0);

  logDebug('🎯 DROP:', {
    from: selectedIndices.length > 0 ? selectedIndices : [sourceIndex],
    to: targetIndex,
    tracks: dragTracks.map((track) => `#${track?.position ?? '?'} ${track?.name ?? 'unknown'}`),
  });

  console.debug('[DND] end: selection', {
    selectedCount: selectedIndices.length,
    indices: selectedIndices.slice(0, 25),
    dragTracksCount: dragTracks.length,
  });

  const shouldAdjust = shouldAdjustTargetIndex(finalDropPosition, dragTracks.length);
  const effectiveTargetIndex = calculateEffectiveTargetIndex(
    targetIndex,
    shouldAdjust,
    () => computeAdjustedTargetIndex(targetIndex, dragTracks, orderedTracks, sourcePlaylistId, targetPlaylistId)
  );

  const executionContext = preparePlaylistDropExecutionContext(
    ctx,
    sourcePanelId,
    targetPanelId,
    sourcePlaylistId,
    targetPlaylistId,
    selectedIndices,
    orderedTracks
  );
  if (!executionContext) {
    return;
  }

  const dropContext: DropContext = {
    panels: ctx.panels,
    mutations: ctx.mutations,
    selectedIndices: executionContext.selectedIndices,
    orderedTracks: executionContext.orderedTracks,
  };

  if (executionContext.isSamePanelSamePlaylist) {
    handleSamePanelDrop(
      executionContext.effectiveMode,
      sourceIndex,
      targetIndex,
      effectiveTargetIndex,
      dragTracks,
      dragTrackUris,
      executionContext.sourceProviderId,
      sourcePlaylistId,
      targetPlaylistId,
      dropContext
    );
    return;
  }

  handleCrossPanelDrop(
    executionContext.effectiveMode,
    sourceIndex,
    targetIndex,
    effectiveTargetIndex,
    dragTracks,
    dragTrackUris,
    executionContext.sourceProviderId,
    executionContext.targetProviderId,
    sourcePlaylistId,
    targetPlaylistId,
    executionContext.sourcePanel,
    dropContext
  );
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
  targetProviderId: MusicProviderId,
  _targetPanelId: string, // Used for logging only
  targetPanel: PanelConfig | undefined,
  finalDropPosition: number | null,
  addTracks: DragEndContext['mutations']['addTracks'],
  enqueuePendingFromBrowseDrop: DragEndContext['enqueuePendingFromBrowseDrop']
): boolean {
  if (!targetPanel?.isEditable) {
    toast.error('Target playlist is not editable');
    return false;
  }

  const targetIndex = finalDropPosition ?? (targetData.position as number ?? 0);
  const payloads = getBrowsePanelDragPayloads(sourceData, sourceTrack);

  if (enqueuePendingFromBrowseDrop && payloads.length > 0) {
    const handled = enqueuePendingFromBrowseDrop({
      targetPlaylistId,
      targetProviderId,
      insertPosition: targetIndex,
      payloads,
    });

    if (handled) {
      return true;
    }
  }

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
    providerId: targetProviderId,
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

    if (!isDragSourceData(sourceData)) {
      return;
    }

    // Handle drop onto player
    if (targetData?.type === 'player') {
      const track = sourceData.type === 'track' ? sourceData.track : sourceData.matchedTrack;
      handlePlayerDrop(sourceData, track);
      return;
    }

    if (!isDragTargetData(targetData)) {
      return;
    }

    if (sourceData.type === 'lastfm-track') {
      handleLastfmTrackDrop(sourceData, targetData, finalDropPosition, ctx);
      return;
    }

    handlePlaylistTrackDrop(
      sourceData,
      targetData,
      finalDropPosition,
      selectedIndices,
      orderedTracksSnapshot,
      ctx
    );
  };
}
