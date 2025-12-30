/**
 * BrowsePanel - container component for the right-side browse/search panel.
 * 
 * Contains:
 * - SearchPanel: Spotify search with drag-to-playlist support
 * - RecommendationsPanel: AI-powered track suggestions based on selection
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
  const { isOpen, width, setWidth } = useBrowsePanelStore();
  const panels = useSplitGridStore((state) => state.panels);
  
  const resizeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Track resize dragging state for visual feedback
  const [isResizing, setIsResizing] = useState(false);
  
  // Recommendations panel expansion state
  const [recsExpanded, setRecsExpanded] = useState(false);
  
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
  
  // Handle resize drag
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
  
  if (!isOpen) return null;
  
  return (
    <div
      className="h-full flex flex-col border-l border-border bg-background relative"
      style={{ width }}
    >
      {/* Resize handle */}
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
      
      {/* Search Panel */}
      <SearchPanel isActive={isOpen} inputRef={inputRef} />
      
      {/* Recommendations Panel - shown when tracks are selected */}
      {selectedTrackIds.length > 0 && (
        <RecommendationsPanel
          selectedTrackIds={selectedTrackIds}
          excludeTrackIds={excludeTrackIds}
          {...(playlistId ? { playlistId } : {})}
          isExpanded={recsExpanded}
          onToggleExpand={() => setRecsExpanded(!recsExpanded)}
          height={250}
        />
      )}
    </div>
  );
}
