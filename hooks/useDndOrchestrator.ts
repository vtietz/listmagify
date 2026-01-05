/**
 * DnD Orchestrator Hook
 * 
 * Centralizes all drag-and-drop state management, event handling, and business logic.
 * This is the main interface for components to manage DnD operations.
 * 
 * Responsibilities:
 * - Drag state management (active item, source/target panels, drop position)
 * - Pointer tracking and modifier key detection
 * - Drop position calculation using virtualizers
 * - Event handlers (onDragStart, onDragOver, onDragEnd)
 * - Business logic for copy/move operations
 * - Collision detection strategy
 * - Sensors configuration
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { usePointerTracker } from './usePointerTracker';
import { useContinuousAutoScroll } from './useAutoScrollEdge';
import { calculateDropPosition } from './useDropPosition';
import { useHydratedCompactMode } from './useCompactModeStore';
import { TABLE_HEADER_HEIGHT, TABLE_HEADER_HEIGHT_COMPACT } from '@/components/split/constants';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useAddTracks, useRemoveTracks, useReorderTracks } from '@/lib/spotify/playlistMutations';
import { logDebug } from '@/lib/utils/debug';
import { getTrackSelectionKey } from '@/lib/dnd/selection';
import {
  computeAdjustedTargetIndex,
  handleLastfmDrop,
  handleSamePanelDrop,
  handleCrossPanelDrop,
  type PanelConfig,
  type PanelVirtualizerData,
  type EphemeralInsertion,
  type MutationHandlers,
  type DropContext,
} from './dnd';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';
import type { Track } from '@/lib/spotify/types';
import type { Virtualizer } from '@tanstack/react-virtual';

/**
 * Hook return type
 */
interface UseDndOrchestratorReturn {
  // Drag state
  activeTrack: Track | null;
  activeId: string | null;
  sourcePanelId: string | null;
  activePanelId: string | null;
  dropIndicatorIndex: number | null;
  ephemeralInsertion: EphemeralInsertion | null;
  activeSelectionCount: number;
  
  // DnD context props
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: CollisionDetection;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
  
  // Panel virtualizer registry
  registerVirtualizer: (
    panelId: string,
    virtualizer: Virtualizer<HTMLDivElement, Element>,
    scrollRef: { current: HTMLDivElement | null },
    filteredTracks: Track[],
    canDrop: boolean
  ) => void;
  unregisterVirtualizer: (panelId: string) => void;
  
  // Utility for cursor determination
  getEffectiveDndMode: () => 'copy' | 'move' | null;
  isTargetEditable: () => boolean;
}

/**
 * DnD Orchestrator Hook
 */
export function useDndOrchestrator(panels: PanelConfig[]): UseDndOrchestratorReturn {
  // Drag state
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null); // Composite ID
  const [sourcePanelId, setSourcePanelId] = useState<string | null>(null); // Panel where drag originated
  const [activeSelectionCount, setActiveSelectionCount] = useState<number>(0);
  const [computedDropPosition, setComputedDropPosition] = useState<number | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null); // Filtered index for drop indicator
  const [activePanelId, setActivePanelId] = useState<string | null>(null); // Track which panel is being dragged over
  const [ephemeralInsertion, setEphemeralInsertion] = useState<EphemeralInsertion | null>(null);

  const activeDragTracksRef = useRef<Track[]>([]);
  const selectedIndicesRef = useRef<number[]>([]);
  const orderedTracksSnapshotRef = useRef<Track[]>([]);
  
  // Track pointer position and modifier keys during drag
  const pointerTracker = usePointerTracker();
  
  // Continuous auto-scroll during drag operations
  const autoScroller = useContinuousAutoScroll({ threshold: 80, maxSpeed: 15, minSpeed: 2 });
  
  // Registry of panel virtualizers for drop position calculation
  const panelVirtualizersRef = useRef<Map<string, PanelVirtualizerData>>(new Map());

  // Mutation hooks
  const addTracks = useAddTracks();
  const removeTracks = useRemoveTracks();
  const reorderTracks = useReorderTracks();

  // Register panel virtualizer for drop calculations
  const registerVirtualizer = useCallback((
    panelId: string,
    virtualizer: Virtualizer<HTMLDivElement, Element>,
    scrollRef: { current: HTMLDivElement | null },
    filteredTracks: Track[],
    canDrop: boolean
  ) => {
    panelVirtualizersRef.current.set(panelId, { virtualizer, scrollRef, filteredTracks, canDrop });
  }, []);

  const unregisterVirtualizer = useCallback((panelId: string) => {
    panelVirtualizersRef.current.delete(panelId);
  }, []);

  // Get compact mode state for header offset calculation
  const isCompact = useHydratedCompactMode();
  const headerOffset = isCompact ? TABLE_HEADER_HEIGHT_COMPACT : TABLE_HEADER_HEIGHT;

  // Compute global playlist position and filtered index from pointer Y in target panel
  const computeDropPosition = useCallback((
    targetPanelId: string,
    pointerY: number
  ): { filteredIndex: number; globalPosition: number } | null => {
    const panelData = panelVirtualizersRef.current.get(targetPanelId);
    if (!panelData) {
      return null;
    }

    const { virtualizer, scrollRef, filteredTracks } = panelData;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) {
      return null;
    }

    return calculateDropPosition(scrollContainer, virtualizer, filteredTracks, pointerY, headerOffset);
  }, [headerOffset]);

  /**
   * Helper: Find panel under pointer that accepts drops
   * Only returns panels where canDrop is true (not sorted)
   */
  const findPanelUnderPointer = useCallback((): { panelId: string } | null => {
    const { x: pointerX, y: pointerY } = pointerTracker.getPosition();
    
    for (const [panelId, panelData] of panelVirtualizersRef.current.entries()) {
      const { scrollRef, canDrop } = panelData;
      // Skip panels that don't accept drops (sorted panels)
      if (!canDrop) continue;
      
      const container = scrollRef.current;
      if (!container) continue;
      
      const rect = container.getBoundingClientRect();
      if (
        pointerX >= rect.left &&
        pointerX <= rect.right &&
        pointerY >= rect.top &&
        pointerY <= rect.bottom
      ) {
        return { panelId };
      }
    }
    
    return null;
  }, [pointerTracker]);

  /**
   * Custom collision detection that prioritizes track droppables over panel droppables.
   * 
   * For tracks: Use pointerWithin but validate against panel scroll bounds
   * For panels: Use our own findPanelUnderPointer() for precise bounds-based detection
   * 
   * This ensures all collision detection is based solely on scroll container bounds,
   * not on dnd-kit's collision detection which may be affected by DOM structure.
   */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    
    // First, determine which panel the pointer is actually in using our bounds check
    const panelUnderPointer = findPanelUnderPointer();
    
    // Get track collisions from pointerWithin
    const trackCollisions = pointerCollisions.filter(
      (collision) => collision.data?.droppableContainer?.data?.current?.type === 'track'
    );
    
    // If we have track collisions, validate they belong to a panel that accepts drops
    if (trackCollisions.length > 0) {
      if (panelUnderPointer) {
        // Check if the target panel accepts drops
        const targetPanelData = panelVirtualizersRef.current.get(panelUnderPointer.panelId);
        if (!targetPanelData?.canDrop) {
          // Panel is sorted - don't accept any drops
          return [];
        }
        
        // Filter to only tracks from the panel that actually contains the pointer
        const validTrackCollisions = trackCollisions.filter((collision) => {
          const trackPanelId = collision.data?.droppableContainer?.data?.current?.panelId;
          return trackPanelId === panelUnderPointer.panelId;
        });
        
        if (validTrackCollisions.length > 0) {
          return validTrackCollisions;
        }
        // If no valid track collisions, fall through to panel detection
      } else {
        // No panel under pointer that accepts drops - filter track collisions to only those from droppable panels
        const validTrackCollisions = trackCollisions.filter((collision) => {
          const trackPanelId = collision.data?.droppableContainer?.data?.current?.panelId;
          if (!trackPanelId) return false;
          const panelData = panelVirtualizersRef.current.get(trackPanelId);
          return panelData?.canDrop === true;
        });
        
        if (validTrackCollisions.length > 0) {
          return validTrackCollisions;
        }
      }
    }
    
    // For panel detection (gaps between tracks), use our bounds-based findPanelUnderPointer
    if (panelUnderPointer) {
      // Find the matching panel droppable from the collision args
      const droppableContainers = args.droppableContainers;
      const panelDroppableId = `panel-${panelUnderPointer.panelId}`;
      const panelContainer = droppableContainers.find(
        (container) => container.id === panelDroppableId
      );
      
      if (panelContainer) {
        // Return only the panel that actually contains the pointer
        return [{
          id: panelDroppableId,
          data: {
            droppableContainer: panelContainer,
            value: 0, // Distance value (0 = direct hit)
          },
        }];
      }
    }
    
    // No collisions found
    return [];
  }, [findPanelUnderPointer]);

  // Set up DnD sensors (disable auto-scroll to prevent source panel scrolling)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    // Extract track data for the overlay
    const { active } = event;
    const track = active.data.current?.track;
    const trackType = active.data.current?.type;
    const compositeId = active.id as string; // e.g., "panel-1:track-abc123"
    const sourcePanel = active.data.current?.panelId;
    
    // Handle Last.fm track drag start
    if (trackType === 'lastfm-track') {
      const matchedTrack = active.data.current?.matchedTrack;
      const selectedMatchedUris = active.data.current?.selectedMatchedUris as string[] | undefined;
      
      // Selection count is based on matched URIs (the actual tracks that will be dropped)
      const selectionCount = selectedMatchedUris && selectedMatchedUris.length > 0 
        ? selectedMatchedUris.length 
        : 1;
      
      // Create a minimal Track object for the overlay
      // Use matched Spotify track if available, otherwise use Last.fm track info
      const overlayTrack: Track = matchedTrack 
        ? {
            id: matchedTrack.id,
            uri: matchedTrack.uri,
            name: matchedTrack.name,
            artists: matchedTrack.artist ? [matchedTrack.artist] : [],
            artistObjects: matchedTrack.artist ? [{ id: null, name: matchedTrack.artist }] : [],
            durationMs: matchedTrack.durationMs ?? 0,
          }
        : {
            id: `lastfm-${track.trackName}`,
            uri: '',
            name: track.trackName,
            artists: [track.artistName],
            artistObjects: [{ id: null, name: track.artistName }],
            durationMs: 0,
          };
      
      setActiveTrack(overlayTrack);
      setActiveSelectionCount(selectionCount);
      setActiveId(compositeId);
      setSourcePanelId(null); // No source panel for Last.fm tracks
      
      logDebug('🎵 DRAG START (Last.fm):', {
        track: track.trackName,
        artist: track.artistName,
        hasMatch: !!matchedTrack,
        selectionCount,
      });
      
      // Start tracking pointer
      pointerTracker.startTracking();
      autoScroller.start(
        () => pointerTracker.getPosition(),
        () => panelVirtualizersRef.current
      );
      
      const cleanup = () => {
        pointerTracker.stopTracking();
        autoScroller.stop();
        document.removeEventListener('pointerup', cleanup);
      };
      document.addEventListener('pointerup', cleanup, { once: true });
      
      return;
    }
    
    if (track) {
      // Resolve ordered selection from the source panel; fall back to the active track
      const panelSelection = panels.find((p) => p.id === sourcePanel)?.selection ?? new Set<string>();
      const panelData = sourcePanel ? panelVirtualizersRef.current.get(sourcePanel) : null;
      const orderedTracks = panelData?.filteredTracks ?? [];

      // Find the index of the dragged track
      const draggedTrackIndex = orderedTracks.findIndex(t => t.uri === track.uri && t.position === track.position);
      const draggedTrackKey = getTrackSelectionKey(track, draggedTrackIndex);
      
      // Check if the dragged track is part of the current selection
      const isDraggedTrackSelected = panelSelection.has(draggedTrackKey);

      // Snapshot tracks and selected indices for stable reference during drag
      orderedTracksSnapshotRef.current = orderedTracks;
      
      let dragTracks: Track[];
      
      if (isDraggedTrackSelected && panelSelection.size > 0) {
        // Dragged track is in selection - use all selected tracks
        const selectedWithIndices = orderedTracks
          .map((t, idx) => ({ t, idx }))
          .filter(({ t, idx }) => panelSelection.has(getTrackSelectionKey(t, idx)));
        selectedIndicesRef.current = selectedWithIndices.map(({ idx }) => idx);
        dragTracks = selectedWithIndices.map(({ t }) => t);
      } else {
        // Dragged track is NOT in selection - just drag this single track
        selectedIndicesRef.current = draggedTrackIndex >= 0 ? [draggedTrackIndex] : [];
        dragTracks = [track];
      }

      activeDragTracksRef.current = dragTracks;
      // Always show the track that was actually clicked/dragged in the overlay
      // (not the first selected track which may be different)
      setActiveTrack(track);
      setActiveSelectionCount(dragTracks.length);
      
      // Simple readable log - server side
      logDebug('🎵 DRAG START:', {
        isDraggedTrackSelected,
        selected: selectedIndicesRef.current,
        selectedPositions: dragTracks.map(t => t?.position).filter(p => p != null),
        dragging: dragTracks.map(t => `#${t?.position ?? '?'} ${t?.name ?? 'unknown'}`).join(', ')
      });
      
      console.debug('[DND] start', {
        panelId: sourcePanel,
        selectionSize: panelSelection.size,
        selectionKeys: Array.from(panelSelection).slice(0, 10),
        orderedLen: orderedTracks.length,
        selectedCount: selectedIndicesRef.current.length,
        selectedIndices: selectedIndicesRef.current.slice(0, 25),
        draggedTrack: track.name,
        draggedTrackKey,
        isDraggedTrackSelected,
        firstFewKeys: orderedTracks.slice(0, 5).map((t, idx) => ({
          name: t.name,
          position: t.position,
          key: getTrackSelectionKey(t, idx)
        }))
      });
    }
    setActiveId(compositeId);
    setSourcePanelId(sourcePanel || null);
    
    // Clear any stale drop indicator state from previous drag
    setDropIndicatorIndex(null);
    setEphemeralInsertion(null);
    setActivePanelId(null);
    // Note: Don't clear computedDropPosition here - it's set during dragOver and read in dragEnd
    
    // Start tracking pointer position and modifier keys
    pointerTracker.startTracking();
    
    // Start continuous auto-scroll loop
    autoScroller.start(
      () => pointerTracker.getPosition(),
      () => panelVirtualizersRef.current
    );
    
    // Clean up on drag end
    const cleanup = () => {
      pointerTracker.stopTracking();
      autoScroller.stop();
      document.removeEventListener('pointerup', cleanup);
    };
    document.addEventListener('pointerup', cleanup, { once: true });
  }, [pointerTracker, autoScroller, panels]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    
    if (!activeId) {
      setComputedDropPosition(null);
      setDropIndicatorIndex(null);
      setActivePanelId(null);
      setEphemeralInsertion(null);
      return;
    }

    // Get target panel ID from either track or panel droppable
    // The collision detection already validates that collisions are within correct panel bounds
    let targetPanelId: string | null = null;
    
    if (over) {
      const targetData = over.data.current;
      
      if (targetData?.type === 'track') {
        // Hovering over a track droppable (already validated by collision detection)
        targetPanelId = targetData.panelId;
      } else if (targetData?.type === 'panel') {
        // Hovering over panel background/gaps (already validated by collision detection)
        targetPanelId = targetData.panelId as string;
      }
    } else {
      // No collision detected - find panel under pointer as fallback
      const panelUnderPointer = findPanelUnderPointer();
      if (panelUnderPointer) {
        targetPanelId = panelUnderPointer.panelId;
      }
    }
    
    if (!targetPanelId) {
      setComputedDropPosition(null);
      setDropIndicatorIndex(null);
      setActivePanelId(null);
      setEphemeralInsertion(null);
      return;
    }

    // Check if target panel is editable - if not, don't show drop indicator
    const targetPanel = panels.find(p => p.id === targetPanelId);
    if (!targetPanel || !targetPanel.isEditable) {
      setComputedDropPosition(null);
      setDropIndicatorIndex(null);
      setActivePanelId(null);
      setEphemeralInsertion(null);
      return;
    }

    // Track which panel the mouse is currently over
    setActivePanelId(targetPanelId);

    // Use actual pointer Y position
    const { y: pointerY } = pointerTracker.getPosition();

    // Get panel data for insertion index calculation
    const panelData = panelVirtualizersRef.current.get(targetPanelId);
    if (!panelData) {
      setComputedDropPosition(null);
      setDropIndicatorIndex(null);
      setEphemeralInsertion(null);
      return;
    }

    const { virtualizer, scrollRef, filteredTracks } = panelData;
    const scrollContainer = scrollRef.current;
    
    // Note: Auto-scroll is handled by the continuous autoScroller loop started in handleDragStart.
    // This ensures smooth scrolling even when the pointer is stationary near panel edges.

    // Compute insertion index in filtered view for "make room" animation
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const scrollTop = scrollContainer.scrollTop;
      const relativeY = pointerY - containerRect.top + scrollTop;

      const virtualItems = virtualizer.getVirtualItems();
      const rowSize = virtualItems.length > 0 && virtualItems[0] ? virtualItems[0].size : 48;
      const adjustedY = relativeY - (rowSize / 2);
      let insertionIndexFiltered = filteredTracks.length;

      for (let i = 0; i < virtualItems.length; i++) {
        const item = virtualItems[i];
        if (!item) continue;
        const itemMiddle = item.start + item.size / 2;
        
        if (adjustedY < itemMiddle) {
          insertionIndexFiltered = item.index;
          break;
        }
      }

      // Set ephemeral insertion for multi-container "make room" animation
      if (sourcePanelId) {
        setEphemeralInsertion({
          activeId,
          sourcePanelId,
          targetPanelId,
          insertionIndex: insertionIndexFiltered,
        });
      }
    }

    // Compute the global playlist position and filtered index
    const dropData = computeDropPosition(targetPanelId, pointerY);
    
    if (dropData) {
      setComputedDropPosition(dropData.globalPosition);
      setDropIndicatorIndex(dropData.filteredIndex);
      
      console.debug('[DND] over', {
        targetPanelId,
        insertionIdxFiltered: dropData.filteredIndex,
        dropIndicatorIndex: dropData.filteredIndex,
        computedDropPosition: dropData.globalPosition
      });
    } else {
      setComputedDropPosition(null);
      setDropIndicatorIndex(null);
    }
  }, [activeId, sourcePanelId, panels, pointerTracker, findPanelUnderPointer, computeDropPosition]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    // Reset drag state
    setActiveId(null);
    setActiveTrack(null);
    setActiveSelectionCount(0);
    setSourcePanelId(null);
    const finalDropPosition = computedDropPosition;
    setComputedDropPosition(null);
    setDropIndicatorIndex(null);
    setActivePanelId(null);
    setEphemeralInsertion(null);
    
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

    // Target can be either a track or a panel
    if (!targetData || (targetData.type !== 'track' && targetData.type !== 'panel')) {
      return;
    }
    
    // Handle Last.fm track drops (copy only - no source playlist)
    if (sourceData.type === 'lastfm-track') {
      const targetPanelId = targetData.panelId;
      const targetPlaylistId = targetData.playlistId;
      
      if (!targetPanelId || !targetPlaylistId) {
        console.error('Missing target panel or playlist context');
        return;
      }
      
      const targetIndex = finalDropPosition ?? (targetData.position ?? 0);
      const dropContext: DropContext = {
        panels,
        mutations: { addTracks, removeTracks, reorderTracks },
        selectedIndices: [],
        orderedTracks: [],
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
    const sourceIndex: number = sourceData.position; // Use position from data payload (global index)

    // Use snapshot from drag start to avoid mid-drag list changes
    const orderedTracks = orderedTracksSnapshotRef.current.length > 0 
      ? orderedTracksSnapshotRef.current 
      : (panelVirtualizersRef.current.get(sourcePanelIdFromData)?.filteredTracks ?? []);
    const selectedTracks = selectedIndicesRef.current.map(idx => orderedTracks[idx]).filter((t): t is Track => t != null);
    const dragTracks = (selectedTracks.length ? selectedTracks : [sourceTrack]);
    const dragTrackUris = dragTracks.map((t) => t.uri);

    // Use computed drop position from handleDragOver (pointer-based, already global)
    const targetIndex: number = finalDropPosition ?? (targetData.position ?? 0);
    
    // Simple readable log - server side
    logDebug('🎯 DROP:', {
      from: selectedIndicesRef.current.length > 0 ? selectedIndicesRef.current : [sourceIndex],
      to: targetIndex,
      tracks: dragTracks.map(t => `#${t?.position ?? '?'} ${t?.name ?? 'unknown'}`)
    });
    
    console.debug('[DND] end: selection', {
      selectedCount: selectedIndicesRef.current.length,
      indices: selectedIndicesRef.current.slice(0, 25),
      dragTracksCount: dragTracks.length
    });

    // Adjustment logic:
    // - Single track: pointer position is correct as-is (insert_before semantics work)
    // - Multiple tracks same-panel: need adjustment because we remove N tracks before inserting
    // - Cross-panel: no adjustment needed (different playlists)
    const effectiveTargetIndex = finalDropPosition !== null && dragTracks.length === 1
      ? targetIndex  // Single track: use pointer position as-is
      : computeAdjustedTargetIndex(  // Multi-track or clicked: adjust for removals
          targetIndex,
          dragTracks,
          orderedTracks,
          sourcePlaylistId,
          targetPlaylistId,
        );

    if (!sourcePanelIdFromData || !targetPanelId || !sourcePlaylistId || !targetPlaylistId) {
      console.error('Missing panel or playlist context in drag event');
      return;
    }

    // Find the panels
    const sourcePanel = panels.find((p) => p.id === sourcePanelIdFromData);
    const targetPanel = panels.find((p) => p.id === targetPanelId);

    if (!sourcePanel || !targetPanel) {
      console.error('Could not find source or target panel');
      return;
    }

    // Check if target panel is editable
    if (!targetPanel.isEditable) {
      toast.error('Target playlist is not editable');
      return;
    }

    const sourceDndMode = sourcePanel.dndMode || 'copy';
    const { ctrlKey: isCtrlPressed } = pointerTracker.getModifiers();
    const canInvertMode = sourcePanel.isEditable; // Only editable playlists can use Ctrl to invert
    const isSamePanelSamePlaylist = sourcePanelIdFromData === targetPanelId && sourcePlaylistId === targetPlaylistId;
    
    // Determine effective mode:
    // - Same panel, same playlist: 
    //   - If source panel is in copy mode OR Ctrl is pressed (inverting from move to copy): copy (add duplicate)
    //   - Otherwise: move (reorder)
    // - Different panels: respect panel's dndMode setting with Ctrl inversion
    const effectiveMode = isSamePanelSamePlaylist
      ? (sourceDndMode === 'copy' || (isCtrlPressed && canInvertMode))
        ? 'copy'  // Copy mode or Ctrl pressed: add duplicate
        : 'move'  // Move mode: reorder
      : (isCtrlPressed && canInvertMode)
        ? (sourceDndMode === 'copy' ? 'move' : 'copy')  // Ctrl inverts mode
        : sourceDndMode;  // Cross-panel: use source panel setting

    // Build context for mutation handlers
    const dropContext: DropContext = {
      panels,
      mutations: { addTracks, removeTracks, reorderTracks },
      selectedIndices: selectedIndicesRef.current,
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

    // Cross-panel operations (same or different playlist)
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
  }, [
    computedDropPosition,
    panels,
    pointerTracker,
    addTracks,
    removeTracks,
    reorderTracks,
  ]);

  /**
   * Get the effective DnD mode for the current drag operation
   */
  const getEffectiveDndMode = useCallback((): 'copy' | 'move' | null => {
    if (!sourcePanelId) return null;
    
    if (activePanelId && activePanelId === sourcePanelId) {
      return 'move'; // Intra-panel interactions are always move
    }

    const sourcePanel = panels.find(p => p.id === sourcePanelId);
    if (!sourcePanel) return null;
    
    const sourceDndMode = sourcePanel.dndMode || 'copy';
    const { ctrlKey: isCtrlPressed } = pointerTracker.getModifiers();
    const canInvertMode = sourcePanel.isEditable;
    
    return (isCtrlPressed && canInvertMode)
      ? (sourceDndMode === 'copy' ? 'move' : 'copy')
      : sourceDndMode;
  }, [sourcePanelId, panels, pointerTracker]);

  /**
   * Handle drag cancel (ESC key pressed)
   * Resets all drag state without performing any mutations
   */
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setActiveTrack(null);
    setActiveSelectionCount(0);
    setSourcePanelId(null);
    setComputedDropPosition(null);
    setDropIndicatorIndex(null);
    setActivePanelId(null);
    setEphemeralInsertion(null);
    pointerTracker.stopTracking();
    autoScroller.stop();
  }, [pointerTracker, autoScroller]);

  /**
   * Check if the current target panel is editable
   */
  const isTargetEditable = useCallback((): boolean => {
    if (!activePanelId) return true;
    
    const targetPanel = panels.find(p => p.id === activePanelId);
    return targetPanel?.isEditable ?? true;
  }, [activePanelId, panels]);

  return {
    // Drag state
    activeTrack,
    activeId,
    sourcePanelId,
    activePanelId,
    dropIndicatorIndex,
    ephemeralInsertion,
    activeSelectionCount,
    
    // DnD context props
    sensors,
    collisionDetection,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
    
    // Panel virtualizer registry
    registerVirtualizer,
    unregisterVirtualizer,
    
    // Utility functions
    getEffectiveDndMode,
    isTargetEditable,
  };
}
