/**
 * SplitGrid container for managing multiple playlist panels.
 * Handles grid layout, DnD context, and panel orchestration.
 */

'use client';

import { useEffect, useRef } from 'react';
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
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { Track } from '@/lib/spotify/types';

export function SplitGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  
  const panels = useSplitGridStore((state) => state.panels);
  const getLayout = useSplitGridStore((state) => state.getLayout);
  const setContainerSize = useSplitGridStore((state) => state.setContainerSize);

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

  // Measure container and update layout
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setContainerSize(clientWidth, clientHeight);
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [setContainerSize]);

  const layout = getLayout();

  const handleDragStart = (event: DragStartEvent) => {
    // Track what's being dragged for the overlay
    // In a full implementation, we'd extract track data from the active element
    setActiveTrack(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTrack(null);

    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }

    // In a full implementation, this would:
    // 1. Determine source and target panels
    // 2. Check permissions
    // 3. Execute move/copy based on globalDnDMode
    // 4. Update via mutation hooks
    
    console.log('Drag ended:', { active: active.id, over: over.id });
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
        ref={containerRef}
        className="h-full w-full p-2"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
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
