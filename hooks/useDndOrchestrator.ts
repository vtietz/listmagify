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
  const [computedDropPosition, setComputedDropPosition] = useState<number | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null); // Filtered index for drop indicator
  const [activePanelId, setActivePanelId] = useState<string | null>(null); // Track which panel is being dragged over
  const [ephemeralInsertion, setEphemeralInsertion] = useState<EphemeralInsertion | null>(null);
  
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
      setActiveTrack(track);
    }
    setActiveId(compositeId);
    setSourcePanelId(sourcePanel || null);
    
    // Start tracking pointer position and modifier keys
    pointerTracker.startTracking();
    
    // Clean up on drag end
    const cleanup = () => {
      pointerTracker.stopTracking();
      document.removeEventListener('pointerup', cleanup);
    };
    document.addEventListener('pointerup', cleanup, { once: true });
  }, [pointerTracker]);

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
      let insertionIndexFiltered = filteredTracks.length;

      for (let i = 0; i < virtualItems.length; i++) {
        const item = virtualItems[i];
        const itemMiddle = item.start + item.size / 2;
        
        if (relativeY < itemMiddle) {
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
    
    // Use computed drop position from handleDragOver (pointer-based, already global)
    const targetIndex: number = finalDropPosition ?? (targetData.position ?? 0);

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

    // Same panel reordering (traditional drag-and-drop within one view)
    if (sourcePanelIdFromData === targetPanelId) {
      if (sourceIndex === targetIndex) return;

      reorderTracks.mutate({
        playlistId: targetPlaylistId,
        fromIndex: sourceIndex,
        toIndex: targetIndex,
      });
      return;
    }

    // Cross-panel operation (different panels, possibly same or different playlists)
    const trackUri = sourceTrack.uri;
    const sourceDndMode = sourcePanel.dndMode || 'copy';
    
    // Determine effective mode: Ctrl key inverts the panel's mode (only for editable source playlists)
    const { ctrlKey: isCtrlPressed } = pointerTracker.getModifiers();
    const canInvertMode = sourcePanel.isEditable; // Only editable playlists can use Ctrl to invert
    const effectiveMode = (isCtrlPressed && canInvertMode)
      ? (sourceDndMode === 'copy' ? 'move' : 'copy')
      : sourceDndMode;

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
        // Copy mode: Duplicate the track at new position (same playlist)
        // This creates a duplicate of the track at the target position
        addTracks.mutate({
          playlistId: targetPlaylistId,
          trackUris: [trackUri],
          position: targetIndex,
        });
      } else {
        // Move mode: Reorder within playlist
        reorderTracks.mutate({
          playlistId: targetPlaylistId,
          fromIndex: sourceIndex,
          toIndex: targetIndex,
        });
      }
    } else if (effectiveMode === 'copy') {
      // Different playlists: Copy to target at mouse position
      addTracks.mutate({
        playlistId: targetPlaylistId,
        trackUris: [trackUri],
        position: targetIndex,
      });
    } else {
      // Different playlists: Move to target at mouse position
      addTracks.mutate(
        {
          playlistId: targetPlaylistId,
          trackUris: [trackUri],
          position: targetIndex,
        },
        {
          onSuccess: () => {
            // Only remove from source if it's editable
            if (sourcePanel.isEditable) {
              removeTracks.mutate({
                playlistId: sourcePlaylistId,
                trackUris: [trackUri],
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
