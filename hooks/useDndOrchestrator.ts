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
import { autoScrollEdge } from './useAutoScrollEdge';
import { calculateDropPosition } from './useDropPosition';
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
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';
import type { Track } from '@/lib/spotify/types';

/**
 * Panel data stored in virtualizer registry
 */
interface PanelVirtualizerData {
  virtualizer: any;
  scrollRef: React.RefObject<HTMLDivElement>;
  filteredTracks: Track[];
}

/**
 * Panel configuration for DnD operations
 */
interface PanelConfig {
  id: string;
  isEditable: boolean;
  dndMode?: 'copy' | 'move';
  playlistId?: string;
  selection?: Set<string>;
}

/**
 * Ephemeral insertion state for "make room" animation
 */
interface EphemeralInsertion {
  activeId: string; // Composite ID
  sourcePanelId: string;
  targetPanelId: string;
  insertionIndex: number;
}

/**
 * Builds tracks array with positions for precise removal (handles duplicate tracks).
 * Groups tracks by URI and collects their positions.
 */
function buildTracksWithPositions(
  dragTracks: Track[],
  orderedTracks: Track[]
): Array<{ uri: string; positions: number[] }> {
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

  const result: Array<{ uri: string; positions: number[] }> = [];
  uriToPositions.forEach((positions, uri) => {
    result.push({ uri, positions });
  });

  return result;
}

/**
 * Custom collision detection that prioritizes track droppables over panel droppables.
 * 
 * Strategy:
 * 1. Use pointerWithin for accurate collision detection
 * 2. If track collisions exist, return only tracks (sorted by distance)
 * 3. Otherwise, return panel collisions
 * 4. This ensures tracks take priority for "make room" animation,
 *    while panels provide reliable hover detection in gaps/background
 */
const panelAwarePointerWithin: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  
  if (pointerCollisions.length === 0) {
    return [];
  }
  
  // Partition collisions by type
  const trackCollisions = pointerCollisions.filter(
    (collision) => collision.data?.droppableContainer?.data?.current?.type === 'track'
  );
  const panelCollisions = pointerCollisions.filter(
    (collision) => collision.data?.droppableContainer?.data?.current?.type === 'panel'
  );
  
  // Prefer track collisions (for precise drop positioning and "make room")
  if (trackCollisions.length > 0) {
    return trackCollisions;
  }
  
  // Fallback to panel collisions (for highlight and gap detection)
  return panelCollisions;
};

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
  
  // Panel virtualizer registry
  registerVirtualizer: (
    panelId: string,
    virtualizer: any,
    scrollRef: React.RefObject<HTMLDivElement>,
    filteredTracks: Track[]
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
  
  // Registry of panel virtualizers for drop position calculation
  const panelVirtualizersRef = useRef<Map<string, PanelVirtualizerData>>(new Map());

  // Mutation hooks
  const addTracks = useAddTracks();
  const removeTracks = useRemoveTracks();
  const reorderTracks = useReorderTracks();

  // Register panel virtualizer for drop calculations
  const registerVirtualizer = useCallback((
    panelId: string,
    virtualizer: any,
    scrollRef: React.RefObject<HTMLDivElement>,
    filteredTracks: Track[]
  ) => {
    panelVirtualizersRef.current.set(panelId, { virtualizer, scrollRef, filteredTracks });
  }, []);

  const unregisterVirtualizer = useCallback((panelId: string) => {
    panelVirtualizersRef.current.delete(panelId);
  }, []);

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

    return calculateDropPosition(scrollContainer, virtualizer, filteredTracks, pointerY);
  }, []);

  /**
   * Helper: Find panel under pointer when over is null (fallback for virtualization gaps)
   */
  const findPanelUnderPointer = useCallback((): { panelId: string } | null => {
    const { x: pointerX, y: pointerY } = pointerTracker.getPosition();
    
    for (const [panelId, panelData] of panelVirtualizersRef.current.entries()) {
      const { scrollRef } = panelData;
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
    const compositeId = active.id as string; // e.g., "panel-1:track-abc123"
    const sourcePanel = active.data.current?.panelId;
    
    if (track) {
      // Resolve ordered selection from the source panel; fall back to the active track
      const panelSelection = panels.find((p) => p.id === sourcePanel)?.selection ?? new Set<string>();
      const panelData = sourcePanel ? panelVirtualizersRef.current.get(sourcePanel) : null;
      const orderedTracks = panelData?.filteredTracks ?? [];

      // Snapshot tracks and selected indices for stable reference during drag
      orderedTracksSnapshotRef.current = orderedTracks;
      const selectedWithIndices = orderedTracks
        .map((t, idx) => ({ t, idx }))
        .filter(({ t, idx }) => panelSelection.has(getTrackSelectionKey(t, idx)));
      selectedIndicesRef.current = selectedWithIndices.map(({ idx }) => idx);
      const selectedTracks = selectedWithIndices.map(({ t }) => t);
      const dragTracks = selectedTracks.length > 0 ? selectedTracks : [track];

      activeDragTracksRef.current = dragTracks;
      // Always show the track that was actually clicked/dragged in the overlay
      // (not the first selected track which may be different)
      setActiveTrack(track);
      setActiveSelectionCount(dragTracks.length);
      
      // Simple readable log - server side
      logDebug('🎵 DRAG START:', {
        selected: selectedIndicesRef.current,
        selectedPositions: selectedTracks.map(t => t?.position).filter(p => p != null),
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
        draggedTrackKey: getTrackSelectionKey(track, orderedTracks.findIndex(t => t.uri === track.uri)),
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
    
    // Clean up on drag end
    const cleanup = () => {
      pointerTracker.stopTracking();
      document.removeEventListener('pointerup', cleanup);
    };
    document.addEventListener('pointerup', cleanup, { once: true });
  }, [pointerTracker, panels]);

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
    let targetPanelId: string | null = null;
    
    if (over) {
      const targetData = over.data.current;
      
      if (targetData?.type === 'track') {
        // Hovering over a track droppable
        targetPanelId = targetData.panelId;
      } else if (targetData?.type === 'panel') {
        // Hovering over panel background/gaps
        targetPanelId = targetData.panelId;
      }
    } else {
      // Fallback: No collision detected (virtualization gap), find panel under pointer
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
    
    // Auto-scroll when pointer is near the edges of the current target panel
    // Note: targetPanelId is determined by pointer position, so we always scroll 
    // whichever panel the pointer is currently over. This is the expected behavior.
    if (scrollContainer) {
      autoScrollEdge(scrollContainer, pointerY);
    }

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

    // Source must be a track
    if (!sourceData || sourceData.type !== 'track') {
      return;
    }

    // Target can be either a track or a panel
    if (!targetData || (targetData.type !== 'track' && targetData.type !== 'panel')) {
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

    // Helper to compute adjusted target index when moving within the same playlist
    const computeAdjustedTargetIndex = (
      targetIdx: number,
      dragList: Track[],
      ordered: Track[],
      sourcePlId?: string,
      targetPlId?: string,
    ) => {
      if (!sourcePlId || !targetPlId) return targetIdx;
      if (sourcePlId !== targetPlId) return targetIdx;
      if (!dragList.length) return targetIdx;
      const indices = dragList
        .map((t) => ordered.findIndex((ot) => (ot.id || ot.uri) === (t.id || t.uri)))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      const removedBefore = indices.filter((i) => i < targetIdx).length;
      return Math.max(0, targetIdx - removedBefore);
    };

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

    const isContiguousSelection = (() => {
      if (dragTracks.length <= 1) return true;
      const indices = dragTracks
        .map((t) => orderedTracks.findIndex((ot) => (ot?.id || ot?.uri) === (t?.id || t?.uri)))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      const first = indices[0];
      const last = indices[indices.length - 1];
      if (indices.length !== dragTracks.length || first === undefined || last === undefined) return false;
      return last - first + 1 === indices.length;
    })();

    // Same panel, same playlist operations
    if (isSamePanelSamePlaylist) {
      // Check if we're in copy mode (adding duplicates)
      if (effectiveMode === 'copy') {
        logDebug('✅ COPY (add duplicate):', dragTrackUris.length, 'tracks →', targetIndex);
        addTracks.mutate({
          playlistId: targetPlaylistId,
          trackUris: dragTrackUris,
          position: targetIndex,  // Use raw targetIndex for copy
        });
        return;
      }
      
      // Move mode: reorder operations
      if (dragTracks.length === 1) {
        logDebug('✅ REORDER single:', sourceIndex, '→', effectiveTargetIndex);
        console.debug('[DND] end: branch = single-item', {
          sourceIndex,
          targetIndex: effectiveTargetIndex
        });
        if (sourceIndex === targetIndex) return;
        reorderTracks.mutate({
          playlistId: targetPlaylistId,
          fromIndex: sourceIndex,
          toIndex: effectiveTargetIndex,
        });
        return;
      }

      if (isContiguousSelection) {
        const indices = selectedIndicesRef.current.length > 0
          ? selectedIndicesRef.current.slice().sort((a, b) => a - b)
          : dragTracks
              .map((t) => orderedTracks.findIndex((ot) => (ot.id || ot.uri) === (t.id || t.uri)))
              .filter((i) => i >= 0)
              .sort((a, b) => a - b);
        
        // Use track positions (global playlist positions) not filtered indices
        const trackPositions = indices.map(idx => orderedTracks[idx]?.position ?? idx).filter((p): p is number => p != null).sort((a, b) => a - b);
        const fromIndex = trackPositions[0] ?? sourceIndex;
        const rangeLength = trackPositions.length || 1;
        
        logDebug('✅ REORDER contiguous:', trackPositions, '→', effectiveTargetIndex, `(${rangeLength} tracks)`);
        console.debug('[DND] end: branch = contiguous', {
          fromIndex,
          toIndex: effectiveTargetIndex,
          rangeLength,
          indices: trackPositions.slice(0, 25)
        });
        
        reorderTracks.mutate({
          playlistId: targetPlaylistId,
          fromIndex,
          toIndex: effectiveTargetIndex,
          rangeLength,
        });
        return;
      }

      // Non-contiguous move within same playlist: fall back to remove + add
      logDebug('✅ REORDER non-contiguous:', selectedIndicesRef.current, '→', effectiveTargetIndex, '(add+remove)');
      console.debug('[DND] end: branch = non-contiguous', {
        toIndex: effectiveTargetIndex,
        trackCount: dragTrackUris.length
      });

      // Build tracks with positions for precise removal (handles duplicate tracks)
      const tracksWithPositions = buildTracksWithPositions(dragTracks, orderedTracks);

      addTracks.mutate({
        playlistId: targetPlaylistId,
        trackUris: dragTrackUris,
        position: effectiveTargetIndex,
      }, {
        onSuccess: () => {
          removeTracks.mutate({
            playlistId: sourcePlaylistId,
            tracks: tracksWithPositions,
          });
        },
      });
      return;
    }

    logDebug('[DragEnd] Cross-panel operation:', {
      sourcePanelId: sourcePanelIdFromData,
      targetPanelId,
      sourcePlaylistId,
      targetPlaylistId,
      sourceIsEditable: sourcePanel.isEditable,
      sourceDndMode,
      isCtrlPressed,
      canInvertMode,
      effectiveMode,
      samePlaylist: sourcePlaylistId === targetPlaylistId,
    });

    if (sourcePlaylistId === targetPlaylistId) {
      // Same playlist, different panels
      if (effectiveMode === 'copy') {
        logDebug('✅ COPY same playlist, cross-panel:', dragTrackUris.length, 'tracks →', targetIndex);
        addTracks.mutate({
          playlistId: targetPlaylistId,
          trackUris: dragTrackUris,
          position: targetIndex,  // Use raw targetIndex for copy (no adjustment needed)
        });
      } else {
        // Move within same playlist across panels
        // IMPORTANT: Must use reorder API, not add+remove, because remove by URI
        // would remove ALL occurrences including the newly added tracks
        
        if (isContiguousSelection && dragTracks.length > 1) {
          // Contiguous multi-track: use rangeLength reorder
          const indices = selectedIndicesRef.current.length > 0
            ? selectedIndicesRef.current.slice().sort((a, b) => a - b)
            : dragTracks
                .map((t) => orderedTracks.findIndex((ot) => (ot?.id || ot?.uri) === (t?.id || t?.uri)))
                .filter((i) => i >= 0)
                .sort((a, b) => a - b);
          
          const trackPositions = indices.map(idx => orderedTracks[idx]?.position ?? idx).filter((p): p is number => p != null).sort((a, b) => a - b);
          const fromIndex = trackPositions[0] ?? sourceIndex;
          const rangeLength = trackPositions.length || 1;
          
          logDebug('✅ REORDER cross-panel (contiguous):', trackPositions, '→', effectiveTargetIndex, `(${rangeLength} tracks)`);
          reorderTracks.mutate({
            playlistId: targetPlaylistId,
            fromIndex,
            toIndex: effectiveTargetIndex,
            rangeLength,
          });
        } else {
          // Non-contiguous or single track: use reorder API for each track
          logDebug('✅ REORDER cross-panel (single/non-contiguous):', dragTracks.map(t => t.position), '→', effectiveTargetIndex);
          reorderTracks.mutate({
            playlistId: targetPlaylistId,
            fromIndex: sourceIndex,
            toIndex: effectiveTargetIndex,
            rangeLength: 1,
          });
        }
      }
    } else if (effectiveMode === 'copy') {
      // Different playlists: Copy to target at mouse position
      addTracks.mutate({
        playlistId: targetPlaylistId,
        trackUris: dragTrackUris,
        position: targetIndex,
      });
    } else {
      // Different playlists: Move to target at mouse position
      addTracks.mutate(
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
              removeTracks.mutate({
                playlistId: sourcePlaylistId,
                tracks: tracksWithPositions,
              });
            }
          },
        }
      );
    }
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
    collisionDetection: panelAwarePointerWithin,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    
    // Panel virtualizer registry
    registerVirtualizer,
    unregisterVirtualizer,
    
    // Utility functions
    getEffectiveDndMode,
    isTargetEditable,
  };
}
