/**
 * BrowsePanel - container component for the right-side browse/search panel.
 * 
 * Contains:
 * - Tab switcher: Spotify | Last.fm
 * - SearchPanel: Spotify search with drag-to-playlist support
 * - LastfmBrowseTab: Last.fm profile browsing with lazy matching
 * - RecommendationsPanel: AI-powered track suggestions based on selection
 * 
 * Features a resizable split between search and recommendations.
 */

'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBrowsePanelStore, type BrowseTab } from '@/hooks/useBrowsePanelStore';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { parseSelectionKey } from '@/lib/dnd/selection';
import { cn } from '@/lib/utils';
import { SearchPanel } from './SearchPanel';
import { LastfmBrowseTab } from './LastfmBrowseTab';
import { RecommendationsPanel } from './RecommendationsPanel';
import { Button } from '@/components/ui/button';
import { Search, Radio } from 'lucide-react';

/** Re-export panel ID for backwards compatibility */
export { SEARCH_PANEL_ID as BROWSE_PANEL_ID } from './SearchPanel';

interface BrowsePanelProps {
  /** Default tab to show (for mobile overlay) */
  defaultTab?: BrowseTab | 'recs';
  /** Whether this is displayed as a mobile overlay (affects styling) */
  isMobileOverlay?: boolean;
}

/** Extract selected track IDs from panels for recommendations */
function useSelectedTrackIds(panels: ReturnType<typeof useSplitGridStore.getState>['panels']) {
  return useMemo(() => {
    const selectedIds: string[] = [];
    let contextPlaylistId: string | undefined;
    
    for (const panel of panels) {
      const selectionItems = panel.selection instanceof Set 
        ? Array.from(panel.selection) 
        : Array.isArray(panel.selection) ? panel.selection : [];
      
      for (const selectionKey of selectionItems) {
        const parsed = parseSelectionKey(selectionKey);
        if (parsed) selectedIds.push(parsed.trackId);
      }
      
      if (panel.playlistId && !contextPlaylistId) {
        contextPlaylistId = panel.playlistId;
      }
    }
    
    return {
      selectedTrackIds: [...new Set(selectedIds)],
      excludeTrackIds: [] as string[],
      playlistId: contextPlaylistId,
    };
  }, [panels]);
}

/** Hook to check if Last.fm is enabled */
function useLastfmEnabled() {
  const { data } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: async () => {
      const response = await fetch('/api/lastfm/status');
      if (!response.ok) return { enabled: false };
      return response.json() as Promise<{ enabled: boolean }>;
    },
    staleTime: Infinity,
  });
  return data?.enabled ?? false;
}

/** Hook for horizontal resize drag behavior */
function useHorizontalResize(initialWidth: number, setWidth: (w: number) => void) {
  const [isResizing, setIsResizing] = useState(false);
  
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = initialWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      setWidth(startWidth + (startX - e.clientX));
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [initialWidth, setWidth]);
  
  return { isResizing, handleResizeStart };
}

/** Hook for vertical resize drag behavior */
function useVerticalResize(initialHeight: number, setHeight: (h: number) => void) {
  const [isResizing, setIsResizing] = useState(false);
  
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = initialHeight;
    
    const handleMouseMove = (e: MouseEvent) => {
      setHeight(startHeight + (startY - e.clientY));
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [initialHeight, setHeight]);
  
  return { isResizing, handleResizeStart };
}

/** Tab switcher component */
function TabSwitcher({ activeTab, setActiveTab }: { 
  activeTab: BrowseTab; 
  setActiveTab: (tab: BrowseTab) => void;
}) {
  return (
    <div className="flex border-b border-border">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setActiveTab('spotify')}
        className={cn(
          'flex-1 rounded-none h-9 gap-1.5',
          activeTab === 'spotify' 
            ? 'bg-accent text-accent-foreground' 
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Search className="h-3.5 w-3.5" />
        Spotify
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setActiveTab('lastfm')}
        className={cn(
          'flex-1 rounded-none h-9 gap-1.5',
          activeTab === 'lastfm' 
            ? 'bg-accent text-accent-foreground' 
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Radio className="h-3.5 w-3.5" />
        Last.fm
      </Button>
    </div>
  );
}

function shouldHideBrowsePanel(isMobileOverlay: boolean, isOpen: boolean): boolean {
  return !isMobileOverlay && !isOpen;
}

function shouldShowRecommendations(
  selectedTrackIds: string[],
  activeTab: BrowseTab,
  isMobileOverlay: boolean
): boolean {
  return selectedTrackIds.length > 0 && activeTab === 'spotify' && !isMobileOverlay;
}

function BrowseRecommendationsOnly({
  isMobileOverlay,
  selectedTrackIds,
  excludeTrackIds,
  playlistId,
}: {
  isMobileOverlay: boolean;
  selectedTrackIds: string[];
  excludeTrackIds: string[];
  playlistId?: string;
}) {
  return (
    <div
      className={cn(
        'h-full flex flex-col bg-background',
        !isMobileOverlay && 'border-l border-border'
      )}
    >
      <RecommendationsPanel
        selectedTrackIds={selectedTrackIds}
        excludeTrackIds={excludeTrackIds}
        {...(playlistId ? { playlistId } : {})}
        isExpanded={true}
        onToggleExpand={() => {}}
        height={undefined}
      />
    </div>
  );
}

function BrowsePanelTabContent({
  activeTab,
  isOpen,
  isMobileOverlay,
  inputRef,
}: {
  activeTab: BrowseTab;
  isOpen: boolean;
  isMobileOverlay: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const isActive = isMobileOverlay || isOpen;

  if (activeTab === 'spotify') {
    return <SearchPanel isActive={isActive} inputRef={inputRef} />;
  }

  return <LastfmBrowseTab isActive={isActive} />;
}

function PanelWidthResizeHandle({
  resizeRef,
  isResizing,
  onMouseDown,
}: {
  resizeRef: React.RefObject<HTMLDivElement | null>;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      ref={resizeRef}
      className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize z-20 group"
      onMouseDown={onMouseDown}
    >
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 transition-colors',
          isResizing ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/60'
        )}
      />
    </div>
  );
}

function RecommendationsResizeHandle({
  isResizing,
  onMouseDown,
}: {
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="absolute left-0 right-0 top-0 h-2 -translate-y-1/2 cursor-ns-resize z-20 group"
      onMouseDown={onMouseDown}
    >
      <div
        className={cn(
          'absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 transition-colors',
          isResizing ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/60'
        )}
      />
    </div>
  );
}

function BrowsePanelLayout({
  isMobileOverlay,
  width,
  showWidthResize,
  isResizing,
  resizeRef,
  onResizeStart,
  showTabs,
  activeTab,
  setActiveTab,
  showRecs,
  recsExpanded,
  recsHeight,
  isResizingRecs,
  onRecsResizeStart,
  onToggleRecsExpanded,
  selectedTrackIds,
  excludeTrackIds,
  playlistId,
  isOpen,
  inputRef,
}: {
  isMobileOverlay: boolean;
  width: number;
  showWidthResize: boolean;
  isResizing: boolean;
  resizeRef: React.RefObject<HTMLDivElement | null>;
  onResizeStart: (e: React.MouseEvent) => void;
  showTabs: boolean;
  activeTab: BrowseTab;
  setActiveTab: (tab: BrowseTab) => void;
  showRecs: boolean;
  recsExpanded: boolean;
  recsHeight: number;
  isResizingRecs: boolean;
  onRecsResizeStart: (e: React.MouseEvent) => void;
  onToggleRecsExpanded: () => void;
  selectedTrackIds: string[];
  excludeTrackIds: string[];
  playlistId?: string;
  isOpen: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className={cn(
        'h-full flex flex-col bg-background relative',
        !isMobileOverlay && 'border-l border-border'
      )}
      style={isMobileOverlay ? undefined : { width, maxWidth: '33vw' }}
    >
      {showWidthResize ? (
        <PanelWidthResizeHandle
          resizeRef={resizeRef}
          isResizing={isResizing}
          onMouseDown={onResizeStart}
        />
      ) : null}

      {showTabs ? <TabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} /> : null}

      <div className={cn('flex-1 min-h-0 flex flex-col', showRecs && recsExpanded && 'overflow-hidden')}>
        <BrowsePanelTabContent
          activeTab={activeTab}
          isOpen={isOpen}
          isMobileOverlay={isMobileOverlay}
          inputRef={inputRef}
        />
      </div>

      {showRecs ? (
        <div className="flex-shrink-0 flex flex-col relative" style={{ height: recsExpanded ? recsHeight : 'auto' }}>
          {recsExpanded ? (
            <RecommendationsResizeHandle isResizing={isResizingRecs} onMouseDown={onRecsResizeStart} />
          ) : null}
          <RecommendationsPanel
            selectedTrackIds={selectedTrackIds}
            excludeTrackIds={excludeTrackIds}
            {...(playlistId ? { playlistId } : {})}
            isExpanded={recsExpanded}
            onToggleExpand={onToggleRecsExpanded}
            height={recsExpanded ? recsHeight : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}

export function BrowsePanel({ defaultTab, isMobileOverlay = false }: BrowsePanelProps = {}) {
  const { 
    isOpen, 
    width, 
    setWidth,
    activeTab,
    setActiveTab,
    recsExpanded,
    toggleRecsExpanded,
    recsHeight,
    setRecsHeight,
    close: _close,
  } = useBrowsePanelStore();
  const panels = useSplitGridStore((state) => state.panels);
  
  const resizeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const lastfmEnabled = useLastfmEnabled();
  const { selectedTrackIds, excludeTrackIds, playlistId } = useSelectedTrackIds(panels);
  const { isResizing, handleResizeStart } = useHorizontalResize(width, setWidth);
  const { isResizing: isResizingRecs, handleResizeStart: handleRecsResizeStart } = useVerticalResize(recsHeight, setRecsHeight);
  
  // Set initial tab from prop (for mobile overlay)
  useEffect(() => {
    if (defaultTab && defaultTab !== 'recs') {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, setActiveTab]);

  if (shouldHideBrowsePanel(isMobileOverlay, isOpen)) {
    return null;
  }

  if (defaultTab === 'recs') {
    return (
      <BrowseRecommendationsOnly
        isMobileOverlay={isMobileOverlay}
        selectedTrackIds={selectedTrackIds}
        excludeTrackIds={excludeTrackIds}
        {...(playlistId ? { playlistId } : {})}
      />
    );
  }

  const showRecs = shouldShowRecommendations(selectedTrackIds, activeTab, isMobileOverlay);

  return (
    <BrowsePanelLayout
      isMobileOverlay={isMobileOverlay}
      width={width}
      showWidthResize={!isMobileOverlay}
      isResizing={isResizing}
      resizeRef={resizeRef}
      onResizeStart={handleResizeStart}
      showTabs={lastfmEnabled && !isMobileOverlay}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      showRecs={showRecs}
      recsExpanded={recsExpanded}
      recsHeight={recsHeight}
      isResizingRecs={isResizingRecs}
      onRecsResizeStart={handleRecsResizeStart}
      onToggleRecsExpanded={toggleRecsExpanded}
      selectedTrackIds={selectedTrackIds}
      excludeTrackIds={excludeTrackIds}
      {...(playlistId ? { playlistId } : {})}
      isOpen={isOpen}
      inputRef={inputRef}
    />
  );
}
