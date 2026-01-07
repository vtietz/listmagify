/**
 * MobileLayout - Layout component for phone devices in SplitGrid.
 * 
 * Features:
 * - Single panel main view with optional overlay (50/50 split)
 * - Panel 2 overlay mode for two-panel comparison
 * - Browse overlays (search, Last.fm, recommendations)
 * - Bottom navigation for overlay switching
 * 
 * Extracted from SplitGrid for better separation of concerns.
 */

'use client';

import type { SplitNode, PanelConfig } from '@/hooks/useSplitGridStore';
import type { EphemeralInsertion } from '@/hooks/dnd';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { Track } from '@/lib/spotify/types';
import type { MobileOverlay } from './MobileBottomNav';
import { SplitNodeView } from './SplitNodeView';
import { BrowsePanel } from './BrowsePanel';
import { MobileBottomNav } from './MobileBottomNav';
import { cn } from '@/lib/utils';

interface MobileLayoutProps {
  /** Root split node */
  root: SplitNode;
  /** Flat list of panels */
  panels: PanelConfig[];
  /** Currently active overlay */
  activeOverlay: MobileOverlay;
  /** Set the active overlay */
  setActiveOverlay: (overlay: MobileOverlay) => void;
  /** Whether Panel 2 exists */
  hasPanel2: boolean;
  /** Register virtualizer callback */
  onRegisterVirtualizer: (
    panelId: string,
    virtualizer: Virtualizer<HTMLDivElement, Element>,
    scrollRef: { current: HTMLDivElement | null },
    filteredTracks: Track[],
    canDrop: boolean
  ) => void;
  /** Unregister virtualizer callback */
  onUnregisterVirtualizer: (panelId: string) => void;
  /** Panel being dragged over */
  activePanelId: string | null;
  /** Source panel of drag operation */
  sourcePanelId: string | null;
  /** Drop indicator index */
  dropIndicatorIndex: number | null;
  /** Ephemeral insertion state */
  ephemeralInsertion: EphemeralInsertion | null;
}

export function MobileLayout({
  root,
  panels,
  activeOverlay,
  setActiveOverlay,
  hasPanel2,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
  activePanelId,
  sourcePanelId,
  dropIndicatorIndex,
  ephemeralInsertion,
}: MobileLayoutProps) {
  // Mobile layout logic:
  // - panel2 active: show 50/50 split (Panel 1 in main, Panel 2 in overlay)
  // - search/lastfm/recs/player active: show Panel 1 at 50% + overlay at 50%
  // - none: show only Panel 1 at 100%
  const showMobileOverlay = activeOverlay !== 'none';
  const isPanel2Mode = activeOverlay === 'panel2';

  return (
    <>
      {/* Main content area */}
      <div className={cn(
        'mobile-split-container flex-1 min-h-0',
        showMobileOverlay && 'has-overlay'
      )}>
        {/* Main panel (Panel 1) - takes full height or top half */}
        <div className="mobile-panel-main p-1">
          <SplitNodeView
            node={root}
            onRegisterVirtualizer={onRegisterVirtualizer}
            onUnregisterVirtualizer={onUnregisterVirtualizer}
            activePanelId={activePanelId}
            sourcePanelId={sourcePanelId}
            dropIndicatorIndex={dropIndicatorIndex}
            ephemeralInsertion={ephemeralInsertion}
            isRoot={true}
            // On mobile, always show only first panel in main area
            mobileShowOnlyFirst={true}
          />
        </div>
        
        {/* Overlay panel (bottom half when active) */}
        {showMobileOverlay && (
          <div className="mobile-panel-overlay">
            {/* Panel 2 mode: show second panel */}
            {isPanel2Mode && hasPanel2 && (
              <div className="h-full p-1">
                <SplitNodeView
                  node={root}
                  onRegisterVirtualizer={onRegisterVirtualizer}
                  onUnregisterVirtualizer={onUnregisterVirtualizer}
                  activePanelId={activePanelId}
                  sourcePanelId={sourcePanelId}
                  dropIndicatorIndex={dropIndicatorIndex}
                  ephemeralInsertion={ephemeralInsertion}
                  isRoot={true}
                  // On mobile, only show second panel in overlay
                  mobileShowOnlySecond={true}
                />
              </div>
            )}
            {/* Browse overlays */}
            {(activeOverlay === 'search' || activeOverlay === 'lastfm' || activeOverlay === 'recs') && (
              <BrowsePanel 
                defaultTab={
                  activeOverlay === 'search' ? 'spotify' :
                  activeOverlay === 'lastfm' ? 'lastfm' :
                  'recs'
                }
                isMobileOverlay={true}
              />
            )}
            {activeOverlay === 'player' && (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Player (coming soon)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav 
        panels={panels}
        activeOverlay={activeOverlay}
        setActiveOverlay={setActiveOverlay}
        hasPanel2={hasPanel2}
      />
    </>
  );
}
