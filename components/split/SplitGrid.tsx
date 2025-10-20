/**
 * SplitGrid container for managing multiple playlist panels.
 * Handles grid layout, DnD context, and panel orchestration.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { PlaylistPanel } from './PlaylistPanel';
import type { Track } from '@/lib/spotify/types';
import { useAddTracks, useRemoveTracks, useReorderTracks } from '@/lib/spotify/playlistMutations';
import { eventBus } from '@/lib/sync/eventBus';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

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

export function SplitGrid() {
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null); // Composite ID
  const [sourcePanelId, setSourcePanelId] = useState<string | null>(null); // Panel where drag originated
  const [computedDropPosition, setComputedDropPosition] = useState<number | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null); // Filtered index for drop indicator
  const [activePanelId, setActivePanelId] = useState<string | null>(null); // Track which panel is being dragged over
  const [ephemeralInsertion, setEphemeralInsertion] = useState<{
    activeId: string; // Composite ID
    sourcePanelId: string;
    targetPanelId: string;
    insertionIndex: number;
  } | null>(null);
  const pointerPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modifierKeysRef = useRef<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>({ 
    ctrlKey: false, 
    altKey: false, 
    shiftKey: false 
  });
  
  const panels = useSplitGridStore((state) => state.panels);

  // Registry of panel virtualizers for drop position calculation
  const panelVirtualizersRef = useRef<Map<string, {
    virtualizer: any;
    scrollRef: React.RefObject<HTMLDivElement>;
    filteredTracks: Track[];
  }>>(new Map());

  // Mutation hooks
  const addTracks = useAddTracks();
  const removeTracks = useRemoveTracks();
  const reorderTracks = useReorderTracks();

  // Register panel virtualizer for drop calculations
  const handleRegisterVirtualizer = useCallback((
    panelId: string,
    virtualizer: any,
    scrollRef: React.RefObject<HTMLDivElement>,
    filteredTracks: Track[]
  ) => {
    panelVirtualizersRef.current.set(panelId, { virtualizer, scrollRef, filteredTracks });
  }, []);

  const handleUnregisterVirtualizer = useCallback((panelId: string) => {
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

    // Calculate relative Y position within the scrollable container
    const containerRect = scrollContainer.getBoundingClientRect();
    const scrollTop = scrollContainer.scrollTop;
    const relativeY = pointerY - containerRect.top + scrollTop;

    // Find the insertion index in the filtered view
    const virtualItems = virtualizer.getVirtualItems();
    let insertionIndexFiltered = filteredTracks.length; // Default: append to end

    for (let i = 0; i < virtualItems.length; i++) {
      const item = virtualItems[i];
      const itemMiddle = item.start + item.size / 2;
      
      if (relativeY < itemMiddle) {
        insertionIndexFiltered = item.index;
        break;
      }
    }

    // Map filtered index to global playlist position
    if (filteredTracks.length === 0) return { filteredIndex: 0, globalPosition: 0 };
    
    if (insertionIndexFiltered >= filteredTracks.length) {
      // Dropping after last visible track
      const lastTrack = filteredTracks[filteredTracks.length - 1];
      const globalPosition = (lastTrack?.position ?? 0) + 1;
      return { filteredIndex: insertionIndexFiltered, globalPosition };
    }

    // Get the global position of the track at the insertion point
    const targetTrack = filteredTracks[insertionIndexFiltered];
    const globalPosition = targetTrack?.position ?? insertionIndexFiltered;
    return { filteredIndex: insertionIndexFiltered, globalPosition };
  }, []);

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

  const handleDragStart = (event: DragStartEvent) => {
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
    const handlePointerMove = (e: PointerEvent) => {
      pointerPositionRef.current = { x: e.clientX, y: e.clientY };
      modifierKeysRef.current = {
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      };
    };
    
    const handleKeyChange = (e: KeyboardEvent) => {
      modifierKeysRef.current = {
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      };
    };
    
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('keydown', handleKeyChange);
    document.addEventListener('keyup', handleKeyChange);
    
    // Clean up on drag end
    const cleanup = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('keydown', handleKeyChange);
      document.removeEventListener('keyup', handleKeyChange);
      document.removeEventListener('pointerup', cleanup);
    };
    document.addEventListener('pointerup', cleanup, { once: true });
  };

  /**
   * Helper: Find panel under pointer when over is null (fallback for virtualization gaps)
   */
  const findPanelUnderPointer = useCallback((): { panelId: string } | null => {
    const pointerX = pointerPositionRef.current.x;
    const pointerY = pointerPositionRef.current.y;
    
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
  }, []);

  const handleDragOver = (event: DragOverEvent) => {
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
    const pointerY = pointerPositionRef.current.y;

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
    
    // Manual auto-scroll for active panel
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const scrollThreshold = 80; // pixels from edge to trigger scroll
      const scrollSpeed = 10; // pixels per frame
      
      const distanceFromTop = pointerY - rect.top;
      const distanceFromBottom = rect.bottom - pointerY;
      
      if (distanceFromTop < scrollThreshold && distanceFromTop > 0) {
        // Near top edge - scroll up
        scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - scrollSpeed);
      } else if (distanceFromBottom < scrollThreshold && distanceFromBottom > 0) {
        // Near bottom edge - scroll down
        scrollContainer.scrollTop = Math.min(
          scrollContainer.scrollHeight - scrollContainer.clientHeight,
          scrollContainer.scrollTop + scrollSpeed
        );
      }
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
  };

  const handleDragEnd = (event: DragEndEvent) => {
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
    const isCtrlPressed = modifierKeysRef.current.ctrlKey;
    const canInvertMode = sourcePanel.isEditable; // Only editable playlists can use Ctrl to invert
    const effectiveMode = (isCtrlPressed && canInvertMode)
      ? (sourceDndMode === 'copy' ? 'move' : 'copy')
      : sourceDndMode;

    console.log('[DragEnd] Cross-panel operation:', {
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
  };

  if (panels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Click "Split Horizontal" or "Split Vertical" to add a panel</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={panelAwarePointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      autoScroll={{
        enabled: true,
        // Only auto-scroll when near edges of viewport or scrollable containers
        threshold: {
          x: 0.2,
          y: 0.2,
        },
        // Scroll acceleration
        acceleration: 10,
      }}
    >
      <div
        className="h-full w-full p-2"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
          gridAutoRows: 'minmax(240px, 1fr)',
          gap: '0.5rem',
        }}
      >
        {panels.map((panel) => (
          <div key={panel.id} className="min-h-0 min-w-0">
            <PlaylistPanel 
              panelId={panel.id}
              onRegisterVirtualizer={handleRegisterVirtualizer}
              onUnregisterVirtualizer={handleUnregisterVirtualizer}
              isActiveDropTarget={activePanelId === panel.id}
              dropIndicatorIndex={activePanelId === panel.id || sourcePanelId === panel.id ? dropIndicatorIndex : null}
              ephemeralInsertion={ephemeralInsertion} // Pass full state, panel will filter
            />
          </div>
        ))}
      </div>

      <DragOverlay 
        dropAnimation={null}
        style={{ cursor: 'inherit' }}
      >
        {activeTrack && (() => {
          // Determine cursor based on source panel's mode and Ctrl key
          const sourcePanel = panels.find(p => p.id === sourcePanelId);
          if (!sourcePanel) return null;
          
          const sourceDndMode = sourcePanel.dndMode || 'copy';
          const isCtrlPressed = modifierKeysRef.current.ctrlKey;
          const canInvertMode = sourcePanel.isEditable;
          const effectiveMode = (isCtrlPressed && canInvertMode)
            ? (sourceDndMode === 'copy' ? 'move' : 'copy')
            : sourceDndMode;
          
          // Check if hovering over a non-editable panel
          const targetPanel = activePanelId ? panels.find(p => p.id === activePanelId) : null;
          const isTargetEditable = targetPanel?.isEditable ?? true;
          
          const cursorStyle = !isTargetEditable 
            ? 'not-allowed' 
            : (effectiveMode === 'move' ? 'grabbing' : 'copy');
          
          return (
            <div 
              className="bg-card border-2 border-primary rounded px-4 py-2 shadow-2xl opacity-95"
              style={{ cursor: cursorStyle }}
            >
              <div className="font-medium">{activeTrack.name}</div>
              <div className="text-sm text-muted-foreground">
                {activeTrack.artists.join(', ')}
              </div>
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
