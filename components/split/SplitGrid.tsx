/**
 * SplitGrid container for managing multiple playlist panels.
 * Handles grid layout, DnD context, and panel orchestration.
 */

'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
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
  
  const panels = useSplitGridStore((state) => state.panels);

  // Mutation hooks
  const addTracks = useAddTracks();
  const removeTracks = useRemoveTracks();
  const reorderTracks = useReorderTracks();

  // Set up DnD sensors
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
    if (track) {
      setActiveTrack(track);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTrack(null);

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
    const sourceIndex: number = sourceData.index;
    const targetIndex: number = targetData.index;

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

    // Same playlist reordering
    if (sourcePlaylistId === targetPlaylistId && sourcePanelId === targetPanelId) {
      if (sourceIndex === targetIndex) return;

      reorderTracks.mutate({
        playlistId: targetPlaylistId,
        fromIndex: sourceIndex,
        toIndex: targetIndex,
      });
      return;
    }

    // Cross-playlist operation
    const trackUri = sourceTrack.uri;
    const targetDndMode = targetPanel.dndMode || 'move';

    if (targetDndMode === 'copy') {
      // Copy: Add to target playlist
      addTracks.mutate({
        playlistId: targetPlaylistId,
        trackUris: [trackUri],
        position: targetIndex,
      });
    } else {
      // Move: Add to target, then remove from source (if source is editable)
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
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
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
            <PlaylistPanel panelId={panel.id} />
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
