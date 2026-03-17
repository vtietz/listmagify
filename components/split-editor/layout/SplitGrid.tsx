/**
 * SplitGrid container for managing multiple playlist panels.
 * Handles tree-based grid layout, DnD context, and panel orchestration.
 * 
 * Uses a recursive split tree model for nested horizontal/vertical splits.
 * 
 * Unified responsive layout:
 * - Phone (<600px): Panels stack vertically, bottom nav for overlays
 * - Tablet/Desktop (≥600px): Side-by-side panels with optional browse panel
 * 
 * All breakpoint adaptations use CSS/Tailwind, not separate layout components.
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DndContext } from '@dnd-kit/core';
import { LogIn, Loader2 } from 'lucide-react';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import type { PanelConfig } from '@/hooks/useSplitGridStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useDndOrchestrator } from '@/hooks/useDndOrchestrator';
import { useSplitUrlSync } from '@/hooks/useSplitUrlSync';
import { useSessionUser } from '@/hooks/useSessionUser';
import { useDeviceType, getOrientationClasses, TABLET_PERFORMANCE_WARNING_THRESHOLD } from '@/hooks/useDeviceType';
import { usePanelFocusStore } from '@/hooks/usePanelFocusStore';
import { usePlayerStore } from '@/hooks/usePlayerStore';
import { useSmallViewportHeight } from '@/hooks/useSmallViewportHeight';
import { SplitNodeView } from './SplitNodeView';
import { BrowsePanel } from '../browse/BrowsePanel';
import { SearchPanel } from '../browse/SearchPanel';
import { RecommendationsPanel } from '../browse/RecommendationsPanel';
import { useMobileOverlayStore, MobileBottomNav } from '../mobile/MobileBottomNav';
import { DndDragOverlay } from '../DndDragOverlay';
import { SpotifyPlayer, MiniPlayer } from '@/components/player';
import { SignInButton } from '@/components/auth/SignInButton';
import { toast } from '@/lib/ui/toast';
import { cn } from '@/lib/utils';

function PlayerSection({
  isPhone,
  showMobilePlayer,
  hasTrack,
  isMiniPlayerHidden,
  isSmallHeight,
  onHide,
  scrollToTrack,
}: {
  isPhone: boolean;
  showMobilePlayer: boolean;
  hasTrack: boolean;
  isMiniPlayerHidden: boolean;
  isSmallHeight: boolean;
  onHide: () => void;
  scrollToTrack?: (trackId: string) => void;
}) {
  if (isPhone) {
    if (showMobilePlayer) {
      return <SpotifyPlayer forceShow={true} {...(scrollToTrack ? { onTrackClick: scrollToTrack } : {})} />;
    }
    if (hasTrack && !isMiniPlayerHidden) {
      return <MiniPlayer isVisible={true} onHide={onHide} {...(scrollToTrack ? { onTrackClick: scrollToTrack } : {})} />;
    }
    return null;
  }

  if (isSmallHeight) {
    if (hasTrack && !isMiniPlayerHidden) {
      return <MiniPlayer isVisible={true} onHide={onHide} {...(scrollToTrack ? { onTrackClick: scrollToTrack } : {})} />;
    }
    return null;
  }

  return <SpotifyPlayer {...(scrollToTrack ? { onTrackClick: scrollToTrack } : {})} />;
}

function MobileOverlayContent({
  activeOverlay,
  hasPanel2,
  panels,
  root,
  registerVirtualizer,
  unregisterVirtualizer,
}: {
  activeOverlay: string;
  hasPanel2: boolean;
  panels: PanelConfig[];
  root: import('@/hooks/useSplitGridStore').SplitNode;
  registerVirtualizer: Parameters<typeof SplitNodeView>[0]['onRegisterVirtualizer'];
  unregisterVirtualizer: Parameters<typeof SplitNodeView>[0]['onUnregisterVirtualizer'];
}) {
  return (
    <div className="mobile-panel-secondary border-t border-border">
      {activeOverlay === 'panel2' && hasPanel2 && (
        <div className="h-full p-1">
          <SplitNodeView
            node={root}
            onRegisterVirtualizer={registerVirtualizer}
            onUnregisterVirtualizer={unregisterVirtualizer}
            isRoot={true}
            mobileShowOnlySecond={true}
          />
        </div>
      )}
      {activeOverlay === 'search' && (
        <div className="h-full flex flex-col bg-background">
          <SearchPanel isActive={true} />
        </div>
      )}
      {activeOverlay === 'recs' && (
        <div className="h-full flex flex-col bg-background">
          <RecommendationsPanel
            selectedTrackIds={panels.flatMap(p =>
              Array.from(p.selection instanceof Set ? p.selection : [])
                .map(key => key.split('::')[0])
                .filter((id): id is string => !!id)
            )}
            excludeTrackIds={[]}
            {...(panels.find(p => p.playlistId)?.playlistId ? { playlistId: panels.find(p => p.playlistId)!.playlistId! } : {})}
            isExpanded={true}
            onToggleExpand={() => {}}
            height={undefined}
          />
        </div>
      )}
      {activeOverlay === 'lastfm' && (
        <BrowsePanel defaultTab="lastfm" isMobileOverlay={true} />
      )}
    </div>
  );
}

export function SplitGrid() {
  // Sync split grid state with URL for sharing/bookmarking
  useSplitUrlSync();

  const router = useRouter();
  const searchParams = useSearchParams();
  const root = useSplitGridStore((state) => state.root);
  const panels = useSplitGridStore((state) => state.panels);
  const splitPanel = useSplitGridStore((state) => state.splitPanel);
  const isBrowsePanelOpen = useBrowsePanelStore((state) => state.isOpen);
  const { authenticated, loading } = useSessionUser();
  
  // Device and orientation detection
  const deviceInfo = useDeviceType();
  const { isPhone, isTablet, deviceType, orientation, hasTouch } = deviceInfo;
  const orientationClasses = getOrientationClasses(deviceInfo);
  
  // Panel focus state (for phone layout)
  const { focusedPanelId, focusPanel } = usePanelFocusStore();
  
  // Mobile overlay state (for phones only)
  const activeOverlay = useMobileOverlayStore((s) => s.activeOverlay);
  const setActiveOverlay = useMobileOverlayStore((s) => s.setActiveOverlay);
  
  // Player state for mini player
  const playbackState = usePlayerStore((s) => s.playbackState);
  const isMiniPlayerHidden = usePlayerStore((s) => s.isMiniPlayerHidden);
  const setMiniPlayerHidden = usePlayerStore((s) => s.setMiniPlayerHidden);
  const isPlaying = playbackState?.isPlaying ?? false;
  const hasTrack = !!playbackState?.track;
  
  // Small viewport height detection (for desktop mini player)
  const isSmallHeight = useSmallViewportHeight();
  
  // Redirect to playlists page if authenticated but no panels active
  useEffect(() => {
    const hasLayoutParam = searchParams.has('layout');
    if (authenticated && !loading && !hasLayoutParam && (!root || panels.length === 0)) {
      router.replace('/playlists');
    }
  }, [authenticated, loading, root, panels.length, router, searchParams]);
  
  // Auto-show mini player when playback starts (after user dismissed it)
  useEffect(() => {
    if (isPlaying && isMiniPlayerHidden) {
      setMiniPlayerHidden(false);
    }
  }, [isPlaying, isMiniPlayerHidden, setMiniPlayerHidden]);
  
  // Reopen mini player when user clicks Player tab (on mobile)
  useEffect(() => {
    if (isPhone && activeOverlay === 'player' && isMiniPlayerHidden) {
      setMiniPlayerHidden(false);
    }
  }, [isPhone, activeOverlay, isMiniPlayerHidden, setMiniPlayerHidden]);
  
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

  // Callback to split the first panel (creates Panel 2)
  const handleSplitFirstPanel = useCallback(() => {
    if (panels.length > 0 && panels[0]) {
      splitPanel(panels[0].id, 'horizontal');
    }
  }, [panels, splitPanel]);

  // IMPORTANT: All hooks must be called before any conditional returns (Rules of Hooks)
  const {
    activeDragTracks,
    sensors,
    collisionDetection,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
    registerVirtualizer,
    unregisterVirtualizer,
    getEffectiveDndMode,
    isTargetEditable,
    scrollToTrack,
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
        {isBrowsePanelOpen && <BrowsePanel />}
      </div>
    );
  }

  // Derived state for mobile overlays
  const hasPanel2 = panels.length >= 2;
  const showMobileOverlay = isPhone && activeOverlay !== 'none' && activeOverlay !== 'player';
  const showMobilePlayer = isPhone && activeOverlay === 'player';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
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
        {/* Main content area - unified layout */}
        <div className={cn(
          'flex-1 min-h-0 flex',
          // Phone: column layout for stacking
          isPhone && 'flex-col',
          // Phone with overlay: apply split
          isPhone && showMobileOverlay && 'mobile-split-active'
        )}>
          {/* Primary panel area */}
          <div className={cn(
            // Desktop/Tablet: takes remaining space, side by side with browse
            !isPhone && 'flex-1 min-w-0 p-2',
            // Phone: full height or top portion when overlay active
            isPhone && 'flex-1 min-h-0 p-1',
            isPhone && showMobileOverlay && 'mobile-panel-primary'
          )}>
            <SplitNodeView
              node={root}
              onRegisterVirtualizer={registerVirtualizer}
              onUnregisterVirtualizer={unregisterVirtualizer}
              isRoot={true}
              // Phone: show only first panel in primary area
              mobileShowOnlyFirst={isPhone}
            />
          </div>

          {/* Desktop/Tablet: Browse panel (inline) */}
          {!isPhone && isBrowsePanelOpen && <BrowsePanel />}

          {/* Phone: Overlay area (Panel 2 or Browse) */}
          {isPhone && showMobileOverlay && (
            <MobileOverlayContent
              activeOverlay={activeOverlay}
              hasPanel2={hasPanel2}
              panels={panels}
              root={root}
              registerVirtualizer={registerVirtualizer}
              unregisterVirtualizer={unregisterVirtualizer}
            />
          )}
        </div>

        {/* Player section */}
        <PlayerSection
          isPhone={isPhone}
          showMobilePlayer={showMobilePlayer}
          hasTrack={hasTrack}
          isMiniPlayerHidden={isMiniPlayerHidden}
          isSmallHeight={isSmallHeight}
          onHide={() => setMiniPlayerHidden(true)}
          scrollToTrack={scrollToTrack}
        />

        {/* Phone: Bottom navigation */}
        {isPhone && (
          <MobileBottomNav
            panels={panels}
            activeOverlay={activeOverlay}
            setActiveOverlay={setActiveOverlay}
            hasPanel2={hasPanel2}
            onSplitFirstPanel={handleSplitFirstPanel}
          />
        )}
      </div>

      {/* Drag overlay - visual feedback during drag */}
      <DndDragOverlay
        draggedTracks={activeDragTracks}
        getEffectiveDndMode={getEffectiveDndMode}
        isTargetEditable={isTargetEditable}
      />
    </DndContext>
  );
}
