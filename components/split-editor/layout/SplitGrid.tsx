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

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DndContext } from '@dnd-kit/core';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import type { PanelConfig } from '@/hooks/useSplitGridStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useDndOrchestrator } from '@/hooks/useDndOrchestrator';
import { useSplitUrlSync } from '@/hooks/useSplitUrlSync';
import { useSessionUser } from '@/hooks/useSessionUser';
import { useDeviceType, getOrientationClasses } from '@/hooks/useDeviceType';
import { usePanelFocusStore } from '@/hooks/usePanelFocusStore';
import { usePlayerStore } from '@/hooks/usePlayerStore';
import { useSmallViewportHeight } from '@/hooks/useSmallViewportHeight';
import { SplitNodeView } from './SplitNodeView';
import { BrowsePanel } from '../browse/BrowsePanel';
import { SearchPanel } from '../browse/SearchPanel';
import { RecommendationsPanel } from '../browse/RecommendationsPanel';
import { useMobileOverlayStore, MobileBottomNav } from '../mobile/MobileBottomNav';
import type { MobileOverlay } from '../mobile/MobileBottomNav';
import { DndDragOverlay } from '../DndDragOverlay';
import { SpotifyPlayer, MiniPlayer } from '@/components/player';
import { cn } from '@/lib/utils';
import {
  LoadingState,
  AuthPrompt,
  EmptySplitState,
  useRedirectToPlaylistsIfNeeded,
  useMiniPlayerVisibilityEffects,
  usePhonePanelAutoFocus,
  useTabletPerformanceWarning,
} from './splitGridStateHelpers';

function getGridRootClassName({
  orientationClasses,
  hasTouch,
}: {
  orientationClasses: string;
  hasTouch: boolean;
}) {
  return cn('h-full w-full flex flex-col', orientationClasses, hasTouch && 'has-touch');
}

function getMainAreaClassName({
  isPhone,
  showMobileOverlay,
}: {
  isPhone: boolean;
  showMobileOverlay: boolean;
}) {
  return cn(
    'flex-1 min-h-0 flex',
    isPhone && 'flex-col',
    isPhone && showMobileOverlay && 'mobile-split-active'
  );
}

function getPrimaryPanelClassName({
  isPhone,
  showMobileOverlay,
}: {
  isPhone: boolean;
  showMobileOverlay: boolean;
}) {
  return cn(
    !isPhone && 'flex-1 min-w-0 p-2',
    isPhone && 'flex-1 min-h-0 p-1',
    isPhone && showMobileOverlay && 'mobile-panel-primary'
  );
}

function renderDesktopBrowsePanel({
  isPhone,
  isBrowsePanelOpen,
}: {
  isPhone: boolean;
  isBrowsePanelOpen: boolean;
}) {
  if (!isPhone && isBrowsePanelOpen) {
    return <BrowsePanel />;
  }

  return null;
}

function renderMobileOverlaySection({
  isPhone,
  showMobileOverlay,
  activeOverlay,
  hasPanel2,
  panels,
  root,
  registerVirtualizer,
  unregisterVirtualizer,
}: {
  isPhone: boolean;
  showMobileOverlay: boolean;
  activeOverlay: MobileOverlay;
  hasPanel2: boolean;
  panels: PanelConfig[];
  root: import('@/hooks/useSplitGridStore').SplitNode;
  registerVirtualizer: ReturnType<typeof useDndOrchestrator>['registerVirtualizer'];
  unregisterVirtualizer: ReturnType<typeof useDndOrchestrator>['unregisterVirtualizer'];
}) {
  if (!(isPhone && showMobileOverlay)) {
    return null;
  }

  return (
    <MobileOverlayContent
      activeOverlay={activeOverlay}
      hasPanel2={hasPanel2}
      panels={panels}
      root={root}
      registerVirtualizer={registerVirtualizer}
      unregisterVirtualizer={unregisterVirtualizer}
    />
  );
}

function renderMobileBottomNavigation({
  isPhone,
  panels,
  activeOverlay,
  setActiveOverlay,
  hasPanel2,
  handleSplitFirstPanel,
}: {
  isPhone: boolean;
  panels: PanelConfig[];
  activeOverlay: MobileOverlay;
  setActiveOverlay: (overlay: MobileOverlay) => void;
  hasPanel2: boolean;
  handleSplitFirstPanel: () => void;
}) {
  if (!isPhone) {
    return null;
  }

  return (
    <MobileBottomNav
      panels={panels}
      activeOverlay={activeOverlay}
      setActiveOverlay={setActiveOverlay}
      hasPanel2={hasPanel2}
      onSplitFirstPanel={handleSplitFirstPanel}
    />
  );
}

function SplitGridContent({
  sensors,
  collisionDetection,
  onDragStart,
  onDragMove,
  onDragOver,
  onDragEnd,
  onDragCancel,
  orientationClasses,
  hasTouch,
  deviceType,
  orientation,
  isPhone,
  showMobileOverlay,
  root,
  registerVirtualizer,
  unregisterVirtualizer,
  isBrowsePanelOpen,
  activeOverlay,
  hasPanel2,
  panels,
  showMobilePlayer,
  hasTrack,
  isMiniPlayerHidden,
  isSmallHeight,
  setMiniPlayerHidden,
  scrollToTrack,
  setActiveOverlay,
  handleSplitFirstPanel,
  activeDragTracks,
  getEffectiveDndMode,
  isTargetEditable,
}: {
  sensors: ReturnType<typeof useDndOrchestrator>['sensors'];
  collisionDetection: ReturnType<typeof useDndOrchestrator>['collisionDetection'];
  onDragStart: ReturnType<typeof useDndOrchestrator>['onDragStart'];
  onDragMove: ReturnType<typeof useDndOrchestrator>['onDragMove'];
  onDragOver: ReturnType<typeof useDndOrchestrator>['onDragOver'];
  onDragEnd: ReturnType<typeof useDndOrchestrator>['onDragEnd'];
  onDragCancel: ReturnType<typeof useDndOrchestrator>['onDragCancel'];
  orientationClasses: string;
  hasTouch: boolean;
  deviceType: string;
  orientation: string;
  isPhone: boolean;
  showMobileOverlay: boolean;
  root: import('@/hooks/useSplitGridStore').SplitNode;
  registerVirtualizer: ReturnType<typeof useDndOrchestrator>['registerVirtualizer'];
  unregisterVirtualizer: ReturnType<typeof useDndOrchestrator>['unregisterVirtualizer'];
  isBrowsePanelOpen: boolean;
  activeOverlay: MobileOverlay;
  hasPanel2: boolean;
  panels: PanelConfig[];
  showMobilePlayer: boolean;
  hasTrack: boolean;
  isMiniPlayerHidden: boolean;
  isSmallHeight: boolean;
  setMiniPlayerHidden: (hidden: boolean) => void;
  scrollToTrack?: (trackId: string) => void;
  setActiveOverlay: (overlay: MobileOverlay) => void;
  handleSplitFirstPanel: () => void;
  activeDragTracks: ReturnType<typeof useDndOrchestrator>['activeDragTracks'];
  getEffectiveDndMode: ReturnType<typeof useDndOrchestrator>['getEffectiveDndMode'];
  isTargetEditable: ReturnType<typeof useDndOrchestrator>['isTargetEditable'];
}) {
  const rootClassName = getGridRootClassName({ orientationClasses, hasTouch });
  const mainAreaClassName = getMainAreaClassName({ isPhone, showMobileOverlay });
  const primaryPanelClassName = getPrimaryPanelClassName({ isPhone, showMobileOverlay });
  const desktopBrowsePanel = renderDesktopBrowsePanel({ isPhone, isBrowsePanelOpen });
  const mobileOverlaySection = renderMobileOverlaySection({
    isPhone,
    showMobileOverlay,
    activeOverlay,
    hasPanel2,
    panels,
    root,
    registerVirtualizer,
    unregisterVirtualizer,
  });
  const mobileBottomNav = renderMobileBottomNavigation({
    isPhone,
    panels,
    activeOverlay,
    setActiveOverlay,
    hasPanel2,
    handleSplitFirstPanel,
  });

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
      <div className={rootClassName} data-device={deviceType} data-orientation={orientation}>
        <div className={mainAreaClassName}>
          <div className={primaryPanelClassName}>
            <SplitNodeView
              node={root}
              onRegisterVirtualizer={registerVirtualizer}
              onUnregisterVirtualizer={unregisterVirtualizer}
              isRoot={true}
              mobileShowOnlyFirst={isPhone}
            />
          </div>

          {desktopBrowsePanel}
          {mobileOverlaySection}
        </div>

        <PlayerSection
          isPhone={isPhone}
          showMobilePlayer={showMobilePlayer}
          hasTrack={hasTrack}
          isMiniPlayerHidden={isMiniPlayerHidden}
          isSmallHeight={isSmallHeight}
          onHide={() => setMiniPlayerHidden(true)}
          {...(scrollToTrack ? { scrollToTrack } : {})}
        />

        {mobileBottomNav}
      </div>

      <DndDragOverlay
        draggedTracks={activeDragTracks}
        getEffectiveDndMode={getEffectiveDndMode}
        isTargetEditable={isTargetEditable}
      />
    </DndContext>
  );
}

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
  activeOverlay: MobileOverlay;
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

  useRedirectToPlaylistsIfNeeded({
    authenticated,
    loading,
    root,
    panelCount: panels.length,
    router,
    searchParams,
  });

  useMiniPlayerVisibilityEffects({
    isPlaying,
    isMiniPlayerHidden,
    setMiniPlayerHidden,
    isPhone,
    activeOverlay,
  });

  usePhonePanelAutoFocus({
    isPhone,
    panels,
    focusedPanelId,
    focusPanel,
  });

  useTabletPerformanceWarning({
    isTablet,
    panelCount: panels.length,
  });

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
    return <LoadingState />;
  }

  // Show auth prompt if not authenticated
  if (!authenticated) {
    return <AuthPrompt />;
  }

  if (!root || panels.length === 0) {
    return <EmptySplitState isBrowsePanelOpen={isBrowsePanelOpen} />;
  }

  // Derived state for mobile overlays
  const hasPanel2 = panels.length >= 2;
  const showMobileOverlay = isPhone && activeOverlay !== 'none' && activeOverlay !== 'player';
  const showMobilePlayer = isPhone && activeOverlay === 'player';

  return (
    <SplitGridContent
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      orientationClasses={orientationClasses}
      hasTouch={hasTouch}
      deviceType={deviceType}
      orientation={orientation}
      isPhone={isPhone}
      showMobileOverlay={showMobileOverlay}
      root={root}
      registerVirtualizer={registerVirtualizer}
      unregisterVirtualizer={unregisterVirtualizer}
      isBrowsePanelOpen={isBrowsePanelOpen}
      activeOverlay={activeOverlay}
      hasPanel2={hasPanel2}
      panels={panels}
      showMobilePlayer={showMobilePlayer}
      hasTrack={hasTrack}
      isMiniPlayerHidden={isMiniPlayerHidden}
      isSmallHeight={isSmallHeight}
      setMiniPlayerHidden={setMiniPlayerHidden}
      scrollToTrack={scrollToTrack}
      setActiveOverlay={setActiveOverlay}
      handleSplitFirstPanel={handleSplitFirstPanel}
      activeDragTracks={activeDragTracks}
      getEffectiveDndMode={getEffectiveDndMode}
      isTargetEditable={isTargetEditable}
    />
  );
}
