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
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { PlaylistPanel } from './PlaylistPanel';
import type { Track } from '@/lib/spotify/types';
import { useAddTracks, useRemoveTracks, useReorderTracks } from '@/lib/spotify/playlistMutations';
import { eventBus } from '@/lib/sync/eventBus';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

export function SplitGrid() {
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [computedDropPosition, setComputedDropPosition] = useState<number | null>(null);
  const [activePanelId, setActivePanelId] = useState<string | null>(null); // Track which panel is being dragged over
  const [ephemeralInsertion, setEphemeralInsertion] = useState<{
    panelId: string;
    activeId: string;
    insertionIndex: number;
  } | null>(null);
  const pointerPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
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

  // Compute global playlist position from pointer Y in target panel
  const computeDropPosition = useCallback((
    targetPanelId: string,
    pointerY: number
  ): number | null => {
    const panelData = panelVirtualizersRef.current.get(targetPanelId);
    if (!panelData) {
      console.log('[computeDropPosition] No panel data for', targetPanelId);
      return null;
    }

    const { virtualizer, scrollRef, filteredTracks } = panelData;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) {
      console.log('[computeDropPosition] No scroll container');
      return null;
    }

    // Calculate relative Y position within the scrollable container
    const containerRect = scrollContainer.getBoundingClientRect();
    const scrollTop = scrollContainer.scrollTop;
    const relativeY = pointerY - containerRect.top + scrollTop;

    console.log('[computeDropPosition]', {
      panelId: targetPanelId,
      pointerY,
      containerTop: containerRect.top,
      scrollTop,
      relativeY,
      filteredTracksCount: filteredTracks.length,
    });

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

    console.log('[computeDropPosition] insertionIndexFiltered:', insertionIndexFiltered);

    // Map filtered index to global playlist position
    if (filteredTracks.length === 0) return 0;
    
    if (insertionIndexFiltered >= filteredTracks.length) {
      // Dropping after last visible track
      const lastTrack = filteredTracks[filteredTracks.length - 1];
      const result = (lastTrack?.position ?? 0) + 1;
      console.log('[computeDropPosition] After last track, position:', result);
      return result;
    }

    // Get the global position of the track at the insertion point
    const targetTrack = filteredTracks[insertionIndexFiltered];
    const result = targetTrack?.position ?? insertionIndexFiltered;
    console.log('[computeDropPosition] Target track position:', result, 'track:', targetTrack?.name);
    return result;
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
    const trackId = active.id as string;
    
    if (track) {
      setActiveTrack(track);
    }
    setActiveId(trackId);
    
    // Start tracking pointer position
    const handlePointerMove = (e: PointerEvent) => {
      pointerPositionRef.current = { x: e.clientX, y: e.clientY };
    };
    
    document.addEventListener('pointermove', handlePointerMove);
    
    // Clean up on drag end
    const cleanup = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', cleanup);
    };
    document.addEventListener('pointerup', cleanup, { once: true });
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    
    if (!over || !activeId) {
      setComputedDropPosition(null);
      setActivePanelId(null);
      setEphemeralInsertion(null);
      return;
    }

    const targetData = over.data.current;
    if (!targetData || targetData.type !== 'track') {
      setComputedDropPosition(null);
      setActivePanelId(null);
      setEphemeralInsertion(null);
      return;
    }

    const targetPanelId = targetData.panelId;
    if (!targetPanelId) {
      setComputedDropPosition(null);
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

      // Set ephemeral insertion for target panel to trigger "make room"
      setEphemeralInsertion({
        panelId: targetPanelId,
        activeId,
        insertionIndex: insertionIndexFiltered,
      });
    }

    // Compute the global playlist position for handleDragEnd
    const globalPosition = computeDropPosition(targetPanelId, pointerY);
    
    console.log('[DragOver]', {
      targetPanelId,
      targetType: targetData.type,
      pointerY,
      computedPosition: globalPosition,
      ephemeralInsertion: ephemeralInsertion?.insertionIndex,
      over: over.id,
    });
    
    setComputedDropPosition(globalPosition);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTrack(null);
    setActiveId(null);
    const finalDropPosition = computedDropPosition;
    setComputedDropPosition(null);
    setActivePanelId(null); // Clear active panel
    setEphemeralInsertion(null); // Clear ephemeral insertion

    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }

    // Extract source and target data
    const sourceData = active.data.current;
    const targetData = over.data.current;

    if (!sourceData || !targetData || sourceData.type !== 'track' || targetData.type !== 'track') {
      return;
    }

    const sourcePanelId = sourceData.panelId;
    const targetPanelId = targetData.panelId;
    const sourcePlaylistId = sourceData.playlistId;
    const targetPlaylistId = targetData.playlistId;
    const sourceTrack: Track = sourceData.track;
    const sourceIndex: number = sourceData.index; // This is track.position (global)
    
    // Use computed drop position from onDragOver (pointer-based)
    const targetIndex: number = finalDropPosition ?? targetData.index;

    console.log('[DragEnd]', {
      sourcePanelId,
      targetPanelId,
      sourceIndex,
      targetIndex,
      finalDropPosition,
      fallbackIndex: targetData.index,
      samePlaylist: sourcePlaylistId === targetPlaylistId,
    });

    if (!sourcePanelId || !targetPanelId || !sourcePlaylistId || !targetPlaylistId) {
      console.error('Missing panel or playlist context in drag event');
      return;
    }

    // Find the panels
    const sourcePanel = panels.find((p) => p.id === sourcePanelId);
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
    if (sourcePanelId === targetPanelId) {
      if (sourceIndex === targetIndex) return;

      reorderTracks.mutate({
        playlistId: targetPlaylistId,
        fromIndex: sourceIndex,
        toIndex: targetIndex,
      });
      return;
    }

    // Cross-panel operation (different panels, possibly same or different playlists)
    // targetIndex is now the computed global position from pointer location
    const trackUri = sourceTrack.uri;
    const targetDndMode = targetPanel.dndMode || 'move';

    if (sourcePlaylistId === targetPlaylistId) {
      // Same playlist, different panels: reorder to target position
      // Use case: Two views of same playlist, one scrolled to top, one to bottom
      reorderTracks.mutate({
        playlistId: targetPlaylistId,
        fromIndex: sourceIndex,
        toIndex: targetIndex,
      });
    } else if (targetDndMode === 'copy') {
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
      collisionDetection={pointerWithin}
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
              dropIndicatorPosition={activePanelId === panel.id ? computedDropPosition : null}
              ephemeralInsertion={
                ephemeralInsertion?.panelId === panel.id 
                  ? { activeId: ephemeralInsertion.activeId, insertionIndex: ephemeralInsertion.insertionIndex }
                  : null
              }
            />
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeTrack && (
          <div className="bg-card border border-border rounded px-4 py-2 shadow-lg">
            <div className="font-medium">{activeTrack.name}</div>
            <div className="text-sm text-muted-foreground">
              {activeTrack.artists.join(', ')}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
