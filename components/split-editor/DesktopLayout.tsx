/**
 * DesktopLayout - Layout component for desktop/tablet devices in SplitGrid.
 * 
 * Features:
 * - Full split panel tree rendering
 * - Optional browse panel (Spotify search, Last.fm, recommendations)
 * 
 * Extracted from SplitGrid for better separation of concerns.
 */

'use client';

import type { SplitNode } from '@/hooks/useSplitGridStore';
import type { EphemeralInsertion } from '@/hooks/dnd';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { Track } from '@/lib/spotify/types';
import { SplitNodeView } from './SplitNodeView';
import { BrowsePanel } from './BrowsePanel';

interface DesktopLayoutProps {
  /** Root split node */
  root: SplitNode;
  /** Whether browse panel is open */
  isBrowsePanelOpen: boolean;
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

export function DesktopLayout({
  root,
  isBrowsePanelOpen,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
  activePanelId,
  sourcePanelId,
  dropIndicatorIndex,
  ephemeralInsertion,
}: DesktopLayoutProps) {
  return (
    <div className="flex-1 min-h-0 flex">
      {/* Main split panel area */}
      <div className="flex-1 min-w-0 p-2">
        <SplitNodeView
          node={root}
          onRegisterVirtualizer={onRegisterVirtualizer}
          onUnregisterVirtualizer={onUnregisterVirtualizer}
          activePanelId={activePanelId}
          sourcePanelId={sourcePanelId}
          dropIndicatorIndex={dropIndicatorIndex}
          ephemeralInsertion={ephemeralInsertion}
          isRoot={true}
        />
      </div>
      
      {/* Browse panel (Spotify search) */}
      {isBrowsePanelOpen && (
        <BrowsePanel />
      )}
    </div>
  );
}
