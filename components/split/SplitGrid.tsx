/**
 * SplitGrid container for managing multiple playlist panels.
 * Handles tree-based grid layout, DnD context, and panel orchestration.
 * 
 * Uses a recursive split tree model for nested horizontal/vertical splits.
 */

'use client';

import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { useDndOrchestrator } from '@/hooks/useDndOrchestrator';
import { SplitNodeView } from './SplitNodeView';

export function SplitGrid() {
  const root = useSplitGridStore((state) => state.root);
  const panels = useSplitGridStore((state) => state.panels);

  // Use the orchestrator hook to manage all DnD state and logic
  const {
    activeTrack,
    sourcePanelId,
    activePanelId,
    dropIndicatorIndex,
    ephemeralInsertion,
    activeSelectionCount,
    sensors,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    registerVirtualizer,
    unregisterVirtualizer,
    getEffectiveDndMode,
    isTargetEditable,
  } = useDndOrchestrator(panels);

  if (!root || panels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Click &quot;Split Horizontal&quot; or &quot;Split Vertical&quot; to add a panel</p>
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
      onDragCancel={onDragCancel}
      // Disable dnd-kit's built-in autoScroll to prevent it from scrolling
      // unrelated panels. We use our own autoScrollEdge in useDndOrchestrator
      // which correctly targets only the panel under the pointer.
      autoScroll={false}
    >
      <div className="h-full w-full p-2">
        <SplitNodeView
          node={root}
          onRegisterVirtualizer={registerVirtualizer}
          onUnregisterVirtualizer={unregisterVirtualizer}
          activePanelId={activePanelId}
          sourcePanelId={sourcePanelId}
          dropIndicatorIndex={dropIndicatorIndex}
          ephemeralInsertion={ephemeralInsertion}
        />
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

          const extraCount = Math.max(0, (activeSelectionCount || 1) - 1);
          
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

              {extraCount > 0 && (
                <div className="flex-shrink-0 text-xs font-medium text-muted-foreground">
                  +{extraCount} more
                </div>
              )}
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
