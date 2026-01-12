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
import { Search, Radio, X } from 'lucide-react';

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
    close,
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
  
  // For mobile overlay, always show (don't check isOpen)
  if (!isMobileOverlay && !isOpen) return null;
  
  // If defaultTab is 'recs', show only recommendations
  if (defaultTab === 'recs') {
    return (
      <div className={cn(
        "h-full flex flex-col bg-background",
        !isMobileOverlay && "border-l border-border"
      )}>
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
  
  const showRecs = selectedTrackIds.length > 0 && activeTab === 'spotify' && !isMobileOverlay;
  
  return (
    <div
      className={cn(
        "h-full flex flex-col bg-background relative",
        !isMobileOverlay && "border-l border-border"
      )}
      style={isMobileOverlay ? undefined : { width, maxWidth: '33vw' }}
    >
      {/* Resize handle for panel width - hide on mobile overlay */}
      {!isMobileOverlay && (
        <div
          ref={resizeRef}
          className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize z-20 group"
          onMouseDown={handleResizeStart}
        >
          <div className={cn(
            "absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 transition-colors",
            isResizing ? "bg-primary" : "bg-transparent group-hover:bg-primary/60"
          )} />
        </div>
      )}
      
      {/* Tab switcher - only show if Last.fm is enabled and NOT on mobile overlay */}
      {lastfmEnabled && !isMobileOverlay && (
        <TabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} />
      )}
      
      {/* Tab content - takes remaining space */}
      <div className={cn(
        "flex-1 min-h-0 flex flex-col",
        showRecs && recsExpanded && "overflow-hidden"
      )}>
        {activeTab === 'spotify' ? (
          <SearchPanel isActive={isOpen} inputRef={inputRef} />
        ) : (
          <LastfmBrowseTab isActive={isOpen} />
        )}
      </div>
      
      {/* Recommendations Panel with resizable split */}
      {showRecs && (
        <div 
          className="flex-shrink-0 flex flex-col relative"
          style={{ height: recsExpanded ? recsHeight : 'auto' }}
        >
          {/* Resize handle for recs height (only when expanded) */}
          {recsExpanded && (
            <div
              className="absolute left-0 right-0 top-0 h-2 -translate-y-1/2 cursor-ns-resize z-20 group"
              onMouseDown={handleRecsResizeStart}
            >
              <div className={cn(
                "absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 transition-colors",
                isResizingRecs ? "bg-primary" : "bg-transparent group-hover:bg-primary/60"
              )} />
            </div>
          )}
          
          <RecommendationsPanel
            selectedTrackIds={selectedTrackIds}
            excludeTrackIds={excludeTrackIds}
            {...(playlistId ? { playlistId } : {})}
            isExpanded={recsExpanded}
            onToggleExpand={toggleRecsExpanded}
            height={recsExpanded ? recsHeight : undefined}
          />
        </div>
      )}
    </div>
  );
}
