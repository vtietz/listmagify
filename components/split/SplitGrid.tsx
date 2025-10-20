/**
 * SplitGrid container for managing multiple playlist panels.
 * Handles grid layout, DnD context, and panel orchestration.
 * 
 * Refactored to use useDndOrchestrator hook for centralized DnD logic.
 */

'use client';

import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { useDndOrchestrator } from '@/hooks/useDndOrchestrator';
import { PlaylistPanel } from './PlaylistPanel';

export function SplitGrid() {
  const panels = useSplitGridStore((state) => state.panels);

  // Use the orchestrator hook to manage all DnD state and logic
  const {
    activeTrack,
    sourcePanelId,
    activePanelId,
    dropIndicatorIndex,
    ephemeralInsertion,
    sensors,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    registerVirtualizer,
    unregisterVirtualizer,
    getEffectiveDndMode,
    isTargetEditable,
  } = useDndOrchestrator(panels);

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
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      autoScroll={{
        enabled: true,
        threshold: {
          x: 0.2,
          y: 0.2,
        },
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
              onRegisterVirtualizer={registerVirtualizer}
              onUnregisterVirtualizer={unregisterVirtualizer}
              isActiveDropTarget={activePanelId === panel.id}
              dropIndicatorIndex={activePanelId === panel.id || sourcePanelId === panel.id ? dropIndicatorIndex : null}
              ephemeralInsertion={ephemeralInsertion}
            />
          </div>
        ))}
      </div>

      <DragOverlay 
        dropAnimation={null}
        style={{ cursor: 'inherit' }}
      >
        {activeTrack && (() => {
          const effectiveMode = getEffectiveDndMode();
          const targetEditable = isTargetEditable();
          
          const cursorStyle = !targetEditable 
            ? 'not-allowed' 
            : (effectiveMode === 'move' ? 'grabbing' : 'copy');
          
          return (
            <div 
              className="flex items-center gap-3 px-4 py-1.5 bg-card border-2 border-primary rounded shadow-2xl opacity-95 min-w-[600px]"
              style={{ cursor: cursorStyle, height: '48px' }}
            >
              {/* Position placeholder */}
              <div className="flex-shrink-0 w-10" />
              
              {/* Track title */}
              <div className="flex-shrink-0 w-[200px] min-w-0">
                <div className="text-sm truncate">{activeTrack.name}</div>
              </div>

              {/* Artist */}
              <div className="flex-shrink-0 w-[160px] min-w-0">
                <div className="text-sm text-muted-foreground truncate">
                  {activeTrack.artists.join(', ')}
                </div>
              </div>

              {/* Album */}
              {activeTrack.album?.name && (
                <div className="flex-shrink-0 w-[160px] min-w-0">
                  <div className="text-sm text-muted-foreground truncate">
                    {activeTrack.album.name}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
