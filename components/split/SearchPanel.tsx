/**
 * SearchPanel component for searching Spotify tracks.
 * Displays search results in a virtualized list with drag-to-playlist support.
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Search, X, Loader2 } from 'lucide-react';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { usePlaylistSort, type SortKey, type SortDirection } from '@/hooks/usePlaylistSort';
import { apiFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrackRow } from './TrackRow';
import { TableHeader } from './TableHeader';
import { AddSelectedToMarkersButton } from './AddSelectedToMarkersButton';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from './constants';
import { makeCompositeId } from '@/lib/dnd/id';
import type { Track } from '@/lib/spotify/types';

/** Virtual panel ID for the search panel (used in DnD composite IDs) */
export const SEARCH_PANEL_ID = 'search-panel';

interface SearchResponse {
  tracks: Track[];
  total: number;
  nextOffset: number | null;
}

interface SearchPanelProps {
  /** Whether this panel is active/visible */
  isActive?: boolean;
  /** Ref to focus the input */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SearchPanel({ isActive = true, inputRef: externalInputRef }: SearchPanelProps) {
  const { 
    searchQuery, 
    setSearchQuery,
    spotifySelection,
    toggleSpotifySelection,
    clearSpotifySelection,
  } = useBrowsePanelStore();
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const isCompact = useHydratedCompactMode();
  
  // Check if any markers exist (for showing add to markers button)
  const allPlaylists = useInsertionPointsStore((s) => s.playlists);
  const hasAnyMarkers = Object.values(allPlaylists).some((p) => p.markers.length > 0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  
  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
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
    // Clear selection when search query changes
    clearSpotifySelection();
  }, [debouncedQuery, setSearchQuery, clearSpotifySelection]);
  
  // Focus input when panel becomes active
  useEffect(() => {
    if (isActive && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isActive, inputRef]);
  
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
    enabled: isActive && debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });
  
  // Flatten all pages into a single track list with stable positions
  const allTracks = useMemo(() => {
    if (!data?.pages) return [] as (Track & { position: number })[];
    return data.pages.flatMap((page: SearchResponse, pageIdx: number) =>
      page.tracks.map((track: Track, idx: number) => ({
        ...track,
        position: pageIdx * 50 + idx,
      }))
    );
  }, [data?.pages]);
  
  // Sort tracks
  const sortedTracks = usePlaylistSort({
    tracks: allTracks,
    sortKey,
    sortDirection,
  });
  
  // Handle sort column click
  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }, [sortKey]);
  
  const totalResults = data?.pages[0]?.total ?? 0;
  
  // Create composite IDs for sortable context
  const sortableIds = useMemo(() => {
    return sortedTracks.map((track, idx) =>
      makeCompositeId(SEARCH_PANEL_ID, track.id || track.uri, track.position ?? idx)
    );
  }, [sortedTracks]);

  // Track URIs for playback
  const trackUris = useMemo(() => 
    sortedTracks.map((t: Track) => t.uri),
    [sortedTracks]
  );

  // Playback integration
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
  });

  // Dynamic row height based on compact mode
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;

  // Defer the count to avoid flushSync during render in React 19
  const deferredCount = useDeferredValue(sortedTracks.length);
  
  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: deferredCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: VIRTUALIZATION_OVERSCAN,
  });

  // Store virtualizer in ref to avoid effect dependency issues
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  // Track previous compact mode to detect changes
  const prevCompactRef = useRef(isCompact);

  // Re-measure when compact mode changes
  // Use setTimeout to defer measure() out of React's render cycle entirely
  useEffect(() => {
    if (prevCompactRef.current !== isCompact) {
      prevCompactRef.current = isCompact;
      const timeoutId = setTimeout(() => {
        virtualizerRef.current.measure();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isCompact]);
  
  // Auto-load more when scrolling near the bottom
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const scrollBottom = scrollHeight - scrollTop - clientHeight;
      
      if (scrollBottom < 200 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };
    
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  
  // Handle liked toggle
  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);
  
  // Handle track selection with modifier keys
  const handleSelect = useCallback((selectionKey: string, index: number, event: React.MouseEvent) => {
    // Toggle selection based on modifier keys
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      toggleSpotifySelection(index);
    } else {
      clearSpotifySelection();
      toggleSpotifySelection(index);
    }
  }, [toggleSpotifySelection, clearSpotifySelection]);
  
  // Handle click (single select)
  const handleClick = useCallback((selectionKey: string, index: number) => {
    clearSpotifySelection();
    toggleSpotifySelection(index);
  }, [clearSpotifySelection, toggleSpotifySelection]);
  
  // Get selected track URIs for adding to markers
  const getSelectedTrackUris = useCallback((): string[] => {
    return Array.from(spotifySelection)
      .sort((a, b) => a - b)
      .map((idx) => sortedTracks[idx])
      .filter((t): t is Track => t !== undefined && !!t.uri)
      .map((t) => t.uri);
  }, [spotifySelection, sortedTracks]);
  
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Search input */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search tracks, artists, albums..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            className="h-9 pl-9 pr-8 text-sm"
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
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-muted-foreground">
              {totalResults.toLocaleString()} results
              <span className={spotifySelection.size > 0 ? 'ml-2 text-primary' : 'ml-2 invisible'}>
                ({spotifySelection.size} selected)
              </span>
            </p>
            
            {/* Add selected to markers button - always show when markers exist, disabled when nothing selected */}
            {hasAnyMarkers && (
              <AddSelectedToMarkersButton
                selectedCount={spotifySelection.size}
                getTrackUris={getSelectedTrackUris}
                className="h-7 w-7"
              />
            )}
          </div>
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
        ) : sortedTracks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No tracks found for &quot;{debouncedQuery}&quot;
          </div>
        ) : (
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div
              ref={scrollRef}
              className="h-full overflow-auto"
            >
              <div className="relative w-full">
                <TableHeader
                  isEditable={false}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  showLikedColumn={true}
                />
                <div
                  style={{
                    height: virtualizer.getTotalSize(),
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const track = sortedTracks[virtualRow.index];
                    if (!track) return null;
                    const trackId = track.id || track.uri;
                    const position = track.position ?? virtualRow.index;
                    const compositeId = makeCompositeId(SEARCH_PANEL_ID, trackId, position);
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
                          isSelected={spotifySelection.has(virtualRow.index)}
                          isEditable={false}
                          locked={false}
                          onSelect={handleSelect}
                          onClick={handleClick}
                          panelId={SEARCH_PANEL_ID}
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
