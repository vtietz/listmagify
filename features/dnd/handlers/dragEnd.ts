/**
 * Drag End Handler
 *
 * Handles the completion of a drag operation, including:
 * - Validating the drop target
 * - Executing mutations (copy, move, reorder)
 * - Handling different source types (playlist, browse, player)
 */

import type { DragEndEvent } from '@dnd-kit/core';
import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { PanelConfig, PanelVirtualizerData, TrackPayload } from '../model/types';
import type { DropContext, MutationHandlers } from '../services/mutations';
import {
  handleSamePanelDrop,
  handleCrossPanelDrop,
} from '../services/mutations';
import { computeAdjustedTargetIndex } from '../helpers';
import {
  determineEffectiveMode,
  shouldAdjustTargetIndex,
  calculateEffectiveTargetIndex,
} from '../services/operations';
import { useBrowsePanelStore } from '@features/split-editor/browse/hooks/useBrowsePanelStore';
import { toast } from '@/lib/ui/toast';
import { logDebug } from '@/lib/utils/debug';
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';
import {
  handleBrowsePanelCopyDrop,
  handlePlayerDrop,
  inferProviderIdFromPlaylistId,
  resolveCrossProviderPayloads,
  resolvePanelProviderId,
} from './dragEndShared';

/** Virtual panel ID for Last.fm browse (used to detect LastFM drops) */
const LASTFM_PANEL_ID = 'lastfm-panel';

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
  trackPayload?: TrackPayload;
  selectedTrackPayloads?: TrackPayload[];
};

type DragTargetData = Record<string, unknown> & {
  type: 'track' | 'panel';
  panelId?: string;
  playlistId?: string;
  position?: number;
};

function isDragSourceData(data: unknown): data is TrackSourceData {
  return Boolean(
    data
      && typeof data === 'object'
      && 'type' in data
      && (data as { type?: string }).type === 'track'
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

  const sourceProviderId = resolvePanelProviderId(panelPair.sourcePanel, sourcePlaylistId);
  const targetProviderId = resolvePanelProviderId(panelPair.targetPanel, targetPlaylistId);

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

function handleBrowseTrackSourceDrop(
  sourceData: TrackSourceData,
  targetData: DragTargetData,
  finalDropPosition: number | null,
  ctx: DragEndContext,
): void {
  const targetPanelId = targetData.panelId!;
  const targetPlaylistId = targetData.playlistId!;
  const targetPanel = ctx.panels.find((panel) => panel.id === targetPanelId);
  const targetProviderId = targetPanel
    ? resolvePanelProviderId(targetPanel, targetPlaylistId)
    : (inferProviderIdFromPlaylistId(targetPlaylistId) ?? DEFAULT_MUSIC_PROVIDER_ID);

  handleBrowsePanelCopyDrop(
    sourceData,
    targetData,
    sourceData.track,
    targetPlaylistId,
    targetProviderId,
    ctx.panels,
    targetPanel,
    finalDropPosition,
    (input) => ctx.mutations.addTracks.mutate(input),
    ctx.enqueuePendingFromBrowseDrop
  );

  // Clear LastFM selection after drop if the source was the LastFM panel
  if (sourceData.panelId === LASTFM_PANEL_ID) {
    useBrowsePanelStore.getState().clearLastfmSelection();
  }
}

function handleCrossProviderPlaylistDrop(
  sourceData: TrackSourceData,
  dragTracks: Track[],
  targetPlaylistId: string,
  targetIndex: number,
  sourceProviderId: MusicProviderId,
  targetProviderId: MusicProviderId,
  enqueuePendingFromBrowseDrop: DragEndContext['enqueuePendingFromBrowseDrop'],
): boolean {
  if (!enqueuePendingFromBrowseDrop) {
    toast.error('Cross-provider drop is currently unavailable');
    return true;
  }

  const payloads = resolveCrossProviderPayloads(sourceData, dragTracks, sourceProviderId);
  if (payloads.length === 0) {
    toast.error('No tracks available for cross-provider drop');
    return true;
  }

  const handled = enqueuePendingFromBrowseDrop({
    targetPlaylistId,
    targetProviderId,
    insertPosition: targetIndex,
    payloads,
  });

  if (!handled) {
    toast.error('Cross-provider drop could not be queued');
  }

  return true;
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
    handleBrowseTrackSourceDrop(sourceData, targetData, finalDropPosition, ctx);
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

  if (executionContext.sourceProviderId !== executionContext.targetProviderId) {
    handleCrossProviderPlaylistDrop(
      sourceData,
      dragTracks,
      targetPlaylistId,
      targetIndex,
      executionContext.sourceProviderId,
      executionContext.targetProviderId,
      ctx.enqueuePendingFromBrowseDrop,
    );
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
      handlePlayerDrop(sourceData, sourceData.track);
      return;
    }

    if (!isDragTargetData(targetData)) {
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
