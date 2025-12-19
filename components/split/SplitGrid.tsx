/**
 * SplitGrid container for managing multiple playlist panels.
 * Handles tree-based grid layout, DnD context, and panel orchestration.
 * 
 * Uses a recursive split tree model for nested horizontal/vertical splits.
 */

'use client';

import { DndContext, DragOverlay } from '@dnd-kit/core';
import { LogIn, Loader2 } from 'lucide-react';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useDndOrchestrator } from '@/hooks/useDndOrchestrator';
import { useSplitUrlSync } from '@/hooks/useSplitUrlSync';
import { useSessionUser } from '@/hooks/useSessionUser';
import { SplitNodeView } from './SplitNodeView';
import { BrowsePanel } from './BrowsePanel';
import { SignInButton } from '@/components/auth/SignInButton';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from './constants';

export function SplitGrid() {
  // Sync split grid state with URL for sharing/bookmarking
  useSplitUrlSync();

  const root = useSplitGridStore((state) => state.root);
  const panels = useSplitGridStore((state) => state.panels);
  const isBrowsePanelOpen = useBrowsePanelStore((state) => state.isOpen);
  const isCompact = useCompactModeStore((state) => state.isCompact);
  const { authenticated, loading } = useSessionUser();

  // IMPORTANT: All hooks must be called before any conditional returns (Rules of Hooks)
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

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show auth prompt if not authenticated
  if (!authenticated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Sign in to continue</h2>
          <p className="text-muted-foreground">
            You need to be signed in with your Spotify account to use the playlist editor.
          </p>
          <SignInButton callbackUrl="/split-editor" />
        </div>
      </div>
    );
  }

  if (!root || panels.length === 0) {
    return (
      <div className="flex h-full">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Click &quot;Split Horizontal&quot; or &quot;Split Vertical&quot; to add a panel</p>
        </div>
        {/* Browse panel outside DnD context when no panels */}
        {isBrowsePanelOpen && (
          <BrowsePanel />
        )}
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
      <div className="h-full w-full flex">
        {/* Main split panel area */}
        <div className="flex-1 min-w-0 p-2">
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
        
        {/* Browse panel (Spotify search) */}
        {isBrowsePanelOpen && (
          <BrowsePanel />
        )}
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
          const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
          
          return (
            <div 
              className={`flex items-center bg-card border-2 border-primary rounded shadow-2xl opacity-95 ${isCompact ? 'gap-1 px-1.5 text-xs' : 'gap-2 px-3 text-sm'}`}
              style={{ cursor: cursorStyle, height: `${rowHeight}px`, minWidth: isCompact ? '400px' : '500px' }}
            >
              {/* Track title */}
              <div className={`flex-shrink-0 min-w-0 ${isCompact ? 'w-[140px]' : 'w-[180px]'}`}>
                <div className="truncate">
                  {activeTrack.name}
                </div>
              </div>

              {/* Artist */}
              <div className={`flex-shrink-0 min-w-0 ${isCompact ? 'w-[100px]' : 'w-[140px]'}`}>
                <div className="text-muted-foreground truncate">
                  {activeTrack.artistObjects && activeTrack.artistObjects.length > 0
                    ? activeTrack.artistObjects.map(a => a.name).join(', ')
                    : activeTrack.artists.join(', ')}
                </div>
              </div>

              {/* Album */}
              {activeTrack.album?.name && (
                <div className={`flex-shrink-0 min-w-0 ${isCompact ? 'w-[100px]' : 'w-[140px]'}`}>
                  <div className="text-muted-foreground truncate">
                    {activeTrack.album.name}
                  </div>
                </div>
              )}

              {extraCount > 0 && (
                <div className="flex-shrink-0 text-xs font-medium text-muted-foreground">
                  +{extraCount}
                </div>
              )}
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
