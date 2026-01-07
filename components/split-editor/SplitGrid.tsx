/**
 * SplitGrid container for managing multiple playlist panels.
 * Handles tree-based grid layout, DnD context, and panel orchestration.
 * 
 * Uses a recursive split tree model for nested horizontal/vertical splits.
 * 
 * Responsive behavior:
 * - Phone (<600px): max 2 panels, orientation-aware (portrait=top/bottom, landscape=left/right)
 * - Tablet (≥600px, <1024px): user-configurable panels, orientation-aware grid
 * - Desktop (≥1024px): current multi-panel behavior
 */

'use client';

import { useEffect, useMemo } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { LogIn, Loader2 } from 'lucide-react';
import { useSplitGridStore, flattenPanels } from '@/hooks/useSplitGridStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useDndOrchestrator } from '@/hooks/useDndOrchestrator';
import { useSplitUrlSync } from '@/hooks/useSplitUrlSync';
import { useSessionUser } from '@/hooks/useSessionUser';
import { useDeviceType, getOrientationClasses, TABLET_PERFORMANCE_WARNING_THRESHOLD } from '@/hooks/useDeviceType';
import { usePanelFocusStore } from '@/hooks/usePanelFocusStore';
import { SplitNodeView } from './SplitNodeView';
import { BrowsePanel } from './BrowsePanel';
import { MobilePanelSwitcher } from './MobilePanelSwitcher';
import { SignInButton } from '@/components/auth/SignInButton';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from './constants';
import { toast } from '@/lib/ui/toast';
import { cn } from '@/lib/utils';

export function SplitGrid() {
  // Sync split grid state with URL for sharing/bookmarking
  useSplitUrlSync();

  const root = useSplitGridStore((state) => state.root);
  const panels = useSplitGridStore((state) => state.panels);
  const isBrowsePanelOpen = useBrowsePanelStore((state) => state.isOpen);
  const isCompact = useHydratedCompactMode();
  const { authenticated, loading } = useSessionUser();
  
  // Device and orientation detection
  const deviceInfo = useDeviceType();
  const { isPhone, isTablet, deviceType, orientation, hasTouch } = deviceInfo;
  const orientationClasses = getOrientationClasses(deviceInfo);
  
  // Panel focus state (for phone layout)
  const { focusedPanelId, focusPanel } = usePanelFocusStore();
  
  // Auto-focus first panel on phones when panels change
  useEffect(() => {
    if (isPhone && panels.length > 0 && !focusedPanelId) {
      focusPanel(panels[0]!.id);
    }
  }, [isPhone, panels, focusedPanelId, focusPanel]);
  
  // Performance warning for tablets with many panels
  useEffect(() => {
    if (isTablet && panels.length > TABLET_PERFORMANCE_WARNING_THRESHOLD) {
      toast.info(
        `You have ${panels.length} panels open. Consider closing some for better performance.`,
        { duration: 5000 }
      );
    }
  }, [isTablet, panels.length]);
  
  // Build playlist names map for mobile switcher
  const playlistNames = useMemo(() => {
    const map = new Map<string, string>();
    // Note: actual playlist names would come from the panels' loaded playlist data
    // This is a placeholder - the PlaylistPanel would need to provide names
    return map;
  }, []);

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
      <div 
        className={cn(
          'h-full w-full flex flex-col',
          orientationClasses,
          hasTouch && 'has-touch'
        )}
        data-device={deviceType}
        data-orientation={orientation}
      >
        {/* Main content area */}
        <div className={cn(
          'flex-1 min-h-0 flex',
          // On phones, add bottom padding for the panel switcher
          isPhone && panels.length >= 2 && 'pb-14'
        )}>
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
              isRoot={true}
            />
          </div>
          
          {/* Browse panel (Spotify search) - hide on phones when using bottom sheet */}
          {isBrowsePanelOpen && !isPhone && (
            <BrowsePanel />
          )}
        </div>
        
        {/* Mobile panel switcher (phones only) */}
        <MobilePanelSwitcher panels={panels} playlistNames={playlistNames} />
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
