/**
 * Drag Start Handler
 *
 * Handles the initialization of a drag operation, including:
 * - Extracting track data from the drag event
 * - Determining which tracks are being dragged (single or multi-select)
 * - Setting up pointer tracking and auto-scroll
 */

import type { DragStartEvent } from '@dnd-kit/core';
import type { Track } from '@/lib/music-provider/types';
import type { PanelConfig, PanelVirtualizerData } from '../types';
import { getTrackSelectionKey } from '@/lib/dnd/selection';
import { determineDragTracks } from '../operations';
import { logDebug } from '@/lib/utils/debug';

/**
 * Context required for drag start handling
 */
export interface DragStartContext {
  panels: PanelConfig[];
  panelVirtualizersRef: React.RefObject<Map<string, PanelVirtualizerData>>;
  pointerTracker: {
    startTracking: () => void;
    stopTracking: () => void;
    getPosition: () => { x: number; y: number };
    getModifiers: () => { ctrlKey: boolean; shiftKey: boolean; altKey: boolean };
  };
  autoScroller: {
    start: (
      getPosition: () => { x: number; y: number },
      getPanels: () => Map<string, PanelVirtualizerData>
    ) => void;
    stop: () => void;
  };
  startDrag: (params: {
    track: Track;
    id: string;
    sourcePanelId: string | null;
    selectionCount: number;
    dragTracks: Track[];
    selectedIndices: number[];
    orderedTracks: Track[];
  }) => void;
}

/**
 * Result of processing a drag start event
 */
export interface DragStartResult {
  handled: boolean;
  cleanup?: () => void;
}

function resolveLastfmDragTracks(
  selectedTracksFromData: Track[] | undefined,
  selectedMatchedUris: string[] | undefined,
  overlayTrack: Track
): { dragTracks: Track[]; selectionCount: number } {
  if (selectedTracksFromData && selectedTracksFromData.length > 0) {
    return {
      dragTracks: selectedTracksFromData,
      selectionCount: selectedTracksFromData.length,
    };
  }

  if (selectedMatchedUris && selectedMatchedUris.length > 0) {
    return {
      dragTracks: [overlayTrack],
      selectionCount: selectedMatchedUris.length,
    };
  }

  return {
    dragTracks: [overlayTrack],
    selectionCount: 1,
  };
}

function buildLastfmOverlayTrack(
  track: { trackName: string; artistName: string },
  matchedTrack: {
    id: string;
    uri: string;
    name: string;
    artists?: string[];
    artist?: string;
    durationMs?: number;
  } | undefined
): Track {
  if (matchedTrack) {
    return {
      id: matchedTrack.id,
      uri: matchedTrack.uri,
      name: matchedTrack.name,
      artists: matchedTrack.artists && matchedTrack.artists.length > 0
        ? matchedTrack.artists
        : matchedTrack.artist
          ? [matchedTrack.artist]
          : [],
      artistObjects: matchedTrack.artists && matchedTrack.artists.length > 0
        ? matchedTrack.artists.map((name) => ({ id: null, name }))
        : matchedTrack.artist
          ? [{ id: null, name: matchedTrack.artist }]
          : [],
      durationMs: matchedTrack.durationMs ?? 0,
    };
  }

  return {
    id: `lastfm-${track.trackName}`,
    uri: '',
    name: track.trackName,
    artists: [track.artistName],
    artistObjects: [{ id: null, name: track.artistName }],
    durationMs: 0,
  };
}

function startPointerTracking(ctx: DragStartContext): () => void {
  ctx.pointerTracker.startTracking();
  ctx.autoScroller.start(
    () => ctx.pointerTracker.getPosition(),
    () => ctx.panelVirtualizersRef.current ?? new Map()
  );

  return () => {
    ctx.pointerTracker.stopTracking();
    ctx.autoScroller.stop();
  };
}

/**
 * Handle Last.fm track drag start
 */
function handleLastfmDragStart(
  event: DragStartEvent,
  ctx: DragStartContext
): DragStartResult {
  const { active } = event;
  const track = active.data.current?.track as { trackName: string; artistName: string } | undefined;
  if (!track) {
    return { handled: false };
  }
  const compositeId = active.id as string;
  const matchedTrack = active.data.current?.matchedTrack as {
    id: string;
    uri: string;
    name: string;
    artists?: string[];
    artist?: string;
    durationMs?: number;
  } | undefined;
  const selectedTracksFromData = active.data.current?.selectedTracks as Track[] | undefined;
  const selectedMatchedUris = active.data.current?.selectedMatchedUris as string[] | undefined;
  const overlayTrack = buildLastfmOverlayTrack(track, matchedTrack);
  const { dragTracks, selectionCount } = resolveLastfmDragTracks(
    selectedTracksFromData,
    selectedMatchedUris,
    overlayTrack
  );

  ctx.startDrag({
    track: overlayTrack,
    id: compositeId,
    sourcePanelId: null, // No source panel for Last.fm tracks
    selectionCount,
    dragTracks,
    selectedIndices: [],
    orderedTracks: dragTracks,
  });

  logDebug('🎵 DRAG START (Last.fm):', {
    track: track.trackName,
    artist: track.artistName,
    hasMatch: !!matchedTrack,
    selectionCount,
  });

  const cleanup = startPointerTracking(ctx);

  return { handled: true, cleanup };
}

/**
 * Handle browse panel drag start (Search, Recommendations)
 */
function handleBrowsePanelDragStart(
  event: DragStartEvent,
  track: Track,
  selectedTracks: Track[],
  sourcePanel: string,
  ctx: DragStartContext
): DragStartResult {
  const compositeId = event.active.id as string;

  ctx.startDrag({
    track,
    id: compositeId,
    sourcePanelId: sourcePanel,
    selectionCount: selectedTracks.length,
    dragTracks: selectedTracks,
    selectedIndices: selectedTracks.map((_, idx) => idx),
    orderedTracks: selectedTracks,
  });

  logDebug('🎵 DRAG START (Browse):', {
    panelId: sourcePanel,
    selectedCount: selectedTracks.length,
    dragging: selectedTracks.map(t => `${t.name ?? 'unknown'}`).join(', ')
  });

  return { handled: true };
}

/**
 * Handle playlist panel drag start (with selection logic)
 */
function handlePlaylistDragStart(
  event: DragStartEvent,
  track: Track,
  sourcePanel: string,
  ctx: DragStartContext
): DragStartResult {
  const compositeId = event.active.id as string;
  const panelConfig = ctx.panels.find((p) => p.id === sourcePanel);
  const panelSelection = panelConfig?.selection ?? new Set<string>();
  const panelData = ctx.panelVirtualizersRef.current?.get(sourcePanel);
  const orderedTracks = panelData?.filteredTracks ?? [];

  // Find the index of the dragged track
  const draggedTrackIndex = orderedTracks.findIndex(
    t => t.uri === track.uri && t.position === track.position
  );
  const draggedTrackKey = getTrackSelectionKey(track, draggedTrackIndex);
  const isDraggedTrackSelected = panelSelection.has(draggedTrackKey);

  // Determine which tracks to drag using pure function
  const { dragTracks, selectedIndices } = determineDragTracks(
    track,
    draggedTrackIndex,
    panelSelection,
    orderedTracks
  );

  // Store drag state using centralized store
  ctx.startDrag({
    track,
    id: compositeId,
    sourcePanelId: sourcePanel,
    selectionCount: dragTracks.length,
    dragTracks,
    selectedIndices,
    orderedTracks,
  });

  // Simple readable log
  logDebug('🎵 DRAG START:', {
    isDraggedTrackSelected,
    selected: selectedIndices,
    selectedPositions: dragTracks.map(t => t?.position).filter(p => p != null),
    dragging: dragTracks.map(t => `#${t?.position ?? '?'} ${t?.name ?? 'unknown'}`).join(', ')
  });

  console.debug('[DND] start', {
    panelId: sourcePanel,
    selectionSize: panelSelection.size,
    selectionKeys: Array.from(panelSelection).slice(0, 10),
    orderedLen: orderedTracks.length,
    selectedCount: selectedIndices.length,
    selectedIndices: selectedIndices.slice(0, 25),
    draggedTrack: track.name,
    draggedTrackKey,
    isDraggedTrackSelected,
    firstFewKeys: orderedTracks.slice(0, 5).map((t, idx) => ({
      name: t.name,
      position: t.position,
      key: getTrackSelectionKey(t, idx)
    }))
  });

  return { handled: true };
}

/**
 * Main drag start handler
 */
export function createDragStartHandler(ctx: DragStartContext) {
  return (event: DragStartEvent): void => {
    const { active } = event;
    const track = active.data.current?.track;
    const trackType = active.data.current?.type;
    const sourcePanel = active.data.current?.panelId;
    const selectedTracksFromData = active.data.current?.selectedTracks as Track[] | undefined;

    let result: DragStartResult = { handled: false };

    // Handle Last.fm track drag start
    if (trackType === 'lastfm-track') {
      result = handleLastfmDragStart(event, ctx);
      if (result.cleanup) {
        document.addEventListener('pointerup', result.cleanup, { once: true });
      }
      return;
    }

    // Handle track drags
    if (track) {
      // Check if selectedTracks is provided (from browse panels)
      if (selectedTracksFromData && selectedTracksFromData.length > 0) {
        result = handleBrowsePanelDragStart(event, track, selectedTracksFromData, sourcePanel, ctx);
      } else {
        result = handlePlaylistDragStart(event, track, sourcePanel, ctx);
      }
    }

    // Start tracking pointer position and modifier keys
    ctx.pointerTracker.startTracking();

    // Start continuous auto-scroll loop
    ctx.autoScroller.start(
      () => ctx.pointerTracker.getPosition(),
      () => ctx.panelVirtualizersRef.current ?? new Map()
    );

    // Clean up on drag end
    const cleanup = () => {
      ctx.pointerTracker.stopTracking();
      ctx.autoScroller.stop();
      document.removeEventListener('pointerup', cleanup);
    };
    document.addEventListener('pointerup', cleanup, { once: true });
  };
}
