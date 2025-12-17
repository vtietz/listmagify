/**
 * BrowsePanel component for searching Spotify and dragging tracks to playlists.
 * A slide-out panel on the right side of the app.
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Search, X, Loader2 } from 'lucide-react';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { apiFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrackRow } from './TrackRow';
import { TRACK_ROW_HEIGHT, VIRTUALIZATION_OVERSCAN } from './constants';
import { makeCompositeId } from '@/lib/dnd/id';
import { cn } from '@/lib/utils';
import type { Track } from '@/lib/spotify/types';

/** Virtual panel ID for the browse panel (used in DnD composite IDs) */
export const BROWSE_PANEL_ID = 'browse-panel';

interface SearchResponse {
  tracks: Track[];
  total: number;
  nextOffset: number | null;
}

export function BrowsePanel() {
  const { isOpen, searchQuery, width, close, setSearchQuery, setWidth } = useBrowsePanelStore();
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  
  // Track resize dragging state for visual feedback
  const [isResizing, setIsResizing] = useState(false);
  
  // Local input state for immediate feedback
  const [localQuery, setLocalQuery] = useState(searchQuery);
  
  // Debounce the search query to avoid too many API calls
  const debouncedQuery = useDebouncedValue(localQuery, 300);
  
  // Sync local state when store changes
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);
  
  // Update store when debounced value changes
  useEffect(() => {
    setSearchQuery(debouncedQuery);
  }, [debouncedQuery, setSearchQuery]);
  
  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Delay focus to ensure panel is visible
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);
  
  // Search query for API
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['spotify-search', debouncedQuery],
    queryFn: async ({ pageParam }: { pageParam: number }): Promise<SearchResponse> => {
      if (!debouncedQuery.trim()) {
        return { tracks: [], total: 0, nextOffset: null };
      }
      return apiFetch<SearchResponse>(
        `/api/search/tracks?q=${encodeURIComponent(debouncedQuery)}&limit=50&offset=${pageParam}`
      );
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage: SearchResponse) => lastPage.nextOffset,
    enabled: isOpen && debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000, // Cache search results for 5 minutes
  });
  
  // Flatten all pages into a single track list with stable positions
  const allTracks = useMemo(() => {
    if (!data?.pages) return [] as (Track & { position: number })[];
    return data.pages.flatMap((page: SearchResponse, pageIdx: number) =>
      page.tracks.map((track: Track, idx: number) => ({
        ...track,
        position: pageIdx * 50 + idx, // Stable position for DnD
      }))
    );
  }, [data?.pages]);
  
  const totalResults = data?.pages[0]?.total ?? 0;
  
  // Create composite IDs for sortable context
  const sortableIds = useMemo(() => {
    return allTracks.map((track: Track & { position: number }, idx: number) =>
      makeCompositeId(BROWSE_PANEL_ID, track.id || track.uri, track.position ?? idx)
    );
  }, [allTracks]);

  // Track URIs for playback
  const trackUris = useMemo(() => 
    allTracks.map((t: Track) => t.uri),
    [allTracks]
  );

  // Playback integration
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
  });
  
  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: allTracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TRACK_ROW_HEIGHT,
    overscan: VIRTUALIZATION_OVERSCAN,
  });
  
  // Auto-load more when scrolling near the bottom
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const scrollBottom = scrollHeight - scrollTop - clientHeight;
      
      // Load more when within 200px of bottom
      if (scrollBottom < 200 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };
    
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  
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
  
  // Handle liked toggle
  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);
  
  // Dummy selection handler (browse panel doesn't support multi-select)
  const handleSelect = useCallback(() => {}, []);
  const handleClick = useCallback(() => {}, []);
  
  if (!isOpen) return null;
  
  return (
    <div
      className="h-full flex flex-col border-l border-border bg-background relative"
      style={{ width }}
    >
      {/* Resize handle - wider hit area with visible line on hover/drag */}
      <div
        ref={resizeRef}
        className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize z-20 group"
        onMouseDown={handleResizeStart}
      >
        {/* Visible resize line */}
        <div className={cn(
          "absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 transition-colors",
          isResizing ? "bg-primary" : "bg-transparent group-hover:bg-primary/60"
        )} />
      </div>
      
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <h2 className="font-semibold text-sm flex-1">Browse Spotify</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={close}
          aria-label="Close browse panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Search input */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="search"
            placeholder="Search tracks, artists, albums..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            className="pl-9 pr-8"
          />
          {localQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setLocalQuery('')}
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        {debouncedQuery && totalResults > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {totalResults.toLocaleString()} results
          </p>
        )}
      </div>
      
      {/* Results */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading && debouncedQuery ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-32 text-sm text-destructive">
            Failed to search. Please try again.
          </div>
        ) : !debouncedQuery ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            Enter a search term to find tracks
          </div>
        ) : allTracks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No tracks found for &quot;{debouncedQuery}&quot;
          </div>
        ) : (
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div
              ref={scrollRef}
              className="h-full overflow-auto"
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const track = allTracks[virtualRow.index];
                  if (!track) return null; // Guard for noUncheckedIndexedAccess
                  const trackId = track.id || track.uri;
                  const position = track.position ?? virtualRow.index;
                  const compositeId = makeCompositeId(BROWSE_PANEL_ID, trackId, position);
                  const liked = track.id ? isLiked(track.id) : false;
                  
                  return (
                    <div
                      key={compositeId}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <TrackRow
                        track={track}
                        index={virtualRow.index}
                        selectionKey={compositeId}
                        isSelected={false}
                        isEditable={false}
                        locked={false}
                        onSelect={handleSelect}
                        onClick={handleClick}
                        panelId={BROWSE_PANEL_ID}
                        dndMode="copy"
                        isDragSourceSelected={false}
                        showLikedColumn={true}
                        isLiked={liked}
                        onToggleLiked={handleToggleLiked}
                        isPlaying={track.id ? isTrackPlaying(track.id) : false}
                        isPlaybackLoading={isTrackLoading(track.uri)}
                        onPlay={playTrack}
                        onPause={pausePlayback}
                      />
                    </div>
                  );
                })}
              </div>
              
              {/* Loading more indicator */}
              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
