/**
 * BrowsePanel - container component for the right-side browse/search panel.
 * 
 * Contains:
 * - SearchPanel: Spotify search with drag-to-playlist support
 * - RecommendationsPanel: AI-powered track suggestions based on selection
 * 
 * Features a resizable split between search and recommendations.
 */

'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { parseSelectionKey } from '@/lib/dnd/selection';
import { cn } from '@/lib/utils';
import { SearchPanel } from './SearchPanel';
import { RecommendationsPanel } from './RecommendationsPanel';

/** Re-export panel ID for backwards compatibility */
export { SEARCH_PANEL_ID as BROWSE_PANEL_ID } from './SearchPanel';

export function BrowsePanel() {
  const { 
    isOpen, 
    width, 
    setWidth,
    recsExpanded,
    toggleRecsExpanded,
    recsHeight,
    setRecsHeight,
  } = useBrowsePanelStore();
  const panels = useSplitGridStore((state) => state.panels);
  
  const resizeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Track resize dragging state for visual feedback
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingRecs, setIsResizingRecs] = useState(false);
  
  // Get selected track IDs from all panels for recommendations
  const { selectedTrackIds, excludeTrackIds, playlistId } = useMemo(() => {
    const selectedIds: string[] = [];
    const allPlaylistTrackIds: string[] = [];
    let contextPlaylistId: string | undefined;
    
    for (const panel of panels) {
      // Collect selected track IDs from selection keys
      // Handle both Set and Array (in case of serialization issues)
      const selectionItems = panel.selection instanceof Set 
        ? Array.from(panel.selection) 
        : Array.isArray(panel.selection) 
          ? panel.selection 
          : [];
      
      for (const selectionKey of selectionItems) {
        // Selection keys are in format "trackId::position"
        const parsed = parseSelectionKey(selectionKey);
        if (parsed) {
          selectedIds.push(parsed.trackId);
        }
      }
      
      // Use first panel's playlist ID as context
      if (panel.playlistId && !contextPlaylistId) {
        contextPlaylistId = panel.playlistId;
      }
    }
    
    return {
      selectedTrackIds: [...new Set(selectedIds)],
      excludeTrackIds: allPlaylistTrackIds,
      playlistId: contextPlaylistId,
    };
  }, [panels]);
  
  // Handle panel width resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    
    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      setWidth(startWidth + delta);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, setWidth]);
  
  // Handle recommendations panel height resize
  const handleRecsResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingRecs(true);
    const startY = e.clientY;
    const startHeight = recsHeight;
    
    const handleMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      setRecsHeight(startHeight + delta);
    };
    
    const handleMouseUp = () => {
      setIsResizingRecs(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [recsHeight, setRecsHeight]);
  
  if (!isOpen) return null;
  
  const showRecs = selectedTrackIds.length > 0;
  
  return (
    <div
      className="h-full flex flex-col border-l border-border bg-background relative"
      style={{ width }}
    >
      {/* Resize handle for panel width */}
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
      
      {/* Search Panel - takes remaining space */}
      <div className={cn(
        "flex-1 min-h-0 flex flex-col",
        showRecs && recsExpanded && "overflow-hidden"
      )}>
        <SearchPanel isActive={isOpen} inputRef={inputRef} />
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
