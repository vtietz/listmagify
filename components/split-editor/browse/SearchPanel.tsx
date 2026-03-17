/**
 * SearchPanel component for searching Spotify tracks.
 * Displays search results in a virtualized list with drag-to-playlist support.
 */

'use client';
'use no memo';

import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Search, X, Loader2 } from 'lucide-react';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useCompareModeStore, getTrackCompareColor } from '@/hooks/useCompareModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { usePlaylistSort, type SortKey, type SortDirection } from '@/hooks/usePlaylistSort';
import { apiFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrackRow } from '../TrackRow';
import { TrackContextMenu } from '../TrackContextMenu';
import { TableHeader } from '../TableHeader';
import { AddSelectedToMarkersButton } from '../playlist/AddSelectedToMarkersButton';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from '../constants';
import { makeCompositeId } from '@/lib/dnd/id';
import type { Track } from '@/lib/music-provider/types';

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

function useSearchQueryState(
  searchQuery: string,
  setSearchQuery: (query: string) => void,
  clearSpotifySelection: () => void
) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debouncedQuery = useDebouncedValue(localQuery, 300);

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setSearchQuery(debouncedQuery);
    clearSpotifySelection();
  }, [debouncedQuery, setSearchQuery, clearSpotifySelection]);

  return {
    localQuery,
    setLocalQuery,
    debouncedQuery,
  };
}

function useFocusWhenActive(isActive: boolean, inputRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (!isActive || !inputRef.current) {
      return;
    }

    const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeoutId);
  }, [isActive, inputRef]);
}

function useSearchSortState() {
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection('asc');
  }, [sortKey]);

  return {
    sortKey,
    sortDirection,
    handleSort,
  };
}

function useLoadNextSearchPageOnScroll({
  scrollRef,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}) {
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const scrollBottom = scrollHeight - scrollTop - clientHeight;

      if (scrollBottom < 200 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, scrollRef]);
}

function SearchInputBar({
  inputRef,
  localQuery,
  onChange,
  onClear,
  hasAnyMarkers,
  selectedCount,
  getTrackUris,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  localQuery: string;
  onChange: (value: string) => void;
  onClear: () => void;
  hasAnyMarkers: boolean;
  selectedCount: number;
  getTrackUris: () => string[];
}) {
  return (
    <div className="px-3 py-2 border-b border-border">
      <div className="relative flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search tracks, artists, albums..."
            value={localQuery}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 pl-9 pr-8 text-sm"
          />
          {localQuery ? (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={onClear}
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </Button>
          ) : null}
        </div>

        {hasAnyMarkers ? (
          <AddSelectedToMarkersButton
            selectedCount={selectedCount}
            getTrackUris={getTrackUris}
            className="h-9 w-9 shrink-0"
          />
        ) : null}
      </div>
    </div>
  );
}

function SearchResultsState({
  isLoading,
  isError,
  debouncedQuery,
  hasTracks,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  debouncedQuery: string;
  hasTracks: boolean;
  children: React.ReactNode;
}) {
  if (isLoading && debouncedQuery) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <div className="flex items-center justify-center h-32 text-sm text-destructive">Failed to search. Please try again.</div>;
  }

  if (!debouncedQuery) {
    return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Enter a search term to find tracks</div>;
  }

  if (!hasTracks) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No tracks found for &quot;{debouncedQuery}&quot;
      </div>
    );
  }

  return <>{children}</>;
}

function SearchTracksVirtualList({
  sortableIds,
  scrollRef,
  sortKey,
  sortDirection,
  onSort,
  virtualizer,
  sortedTracks,
  spotifySelection,
  getSelectedTracks,
  isLiked,
  onToggleLiked,
  isTrackPlaying,
  isTrackLoading,
  playTrack,
  pausePlayback,
  getCompareColorForTrack,
  onSelect,
  onClick,
  isFetchingNextPage,
}: {
  sortableIds: string[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
  sortedTracks: Track[];
  spotifySelection: number[];
  getSelectedTracks: () => Track[];
  isLiked: (trackId: string) => boolean;
  onToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  isTrackPlaying: (trackId: string) => boolean;
  isTrackLoading: (uri: string) => boolean;
  playTrack: (trackUri: string) => void;
  pausePlayback: () => void;
  getCompareColorForTrack: (trackUri: string) => string;
  onSelect: (_selectionKey: string, index: number, event: React.MouseEvent) => void;
  onClick: (_selectionKey: string, index: number) => void;
  isFetchingNextPage: boolean;
}) {
  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      <div ref={scrollRef} className="h-full overflow-auto">
        <div className="relative w-full">
          <TableHeader
            isEditable={false}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={onSort}
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
              if (!track) {
                return null;
              }

              const trackId = track.id || track.uri;
              const position = track.position ?? virtualRow.index;
              const compositeId = makeCompositeId(SEARCH_PANEL_ID, trackId, position);
              const liked = track.id ? isLiked(track.id) : false;
              const isCurrentSelected = spotifySelection.includes(virtualRow.index);
              const selectedTracksForDrag = isCurrentSelected && spotifySelection.length > 0
                ? getSelectedTracks()
                : undefined;

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
                    isSelected={isCurrentSelected}
                    isEditable={false}
                    locked={false}
                    onSelect={onSelect}
                    onClick={onClick}
                    panelId={SEARCH_PANEL_ID}
                    dndMode="copy"
                    isDragSourceSelected={false}
                    showLikedColumn={true}
                    isLiked={liked}
                    onToggleLiked={onToggleLiked}
                    isPlaying={track.id ? isTrackPlaying(track.id) : false}
                    isPlaybackLoading={isTrackLoading(track.uri)}
                    onPlay={playTrack}
                    onPause={pausePlayback}
                    compareColor={getCompareColorForTrack(track.uri)}
                    isMultiSelect={spotifySelection.length > 1}
                    selectedCount={spotifySelection.length}
                    selectedTracks={selectedTracksForDrag}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {isFetchingNextPage ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
    </SortableContext>
  );
}

function SearchPanelContextMenu({
  shouldShow,
  contextMenu,
  onClose,
}: {
  shouldShow: boolean;
  contextMenu: ReturnType<typeof useContextMenuStore.getState>;
  onClose: () => void;
}) {
  if (!shouldShow || !contextMenu.track) {
    return null;
  }

  return (
    <TrackContextMenu
      track={contextMenu.track}
      isOpen={true}
      onClose={onClose}
      {...(contextMenu.position ? { position: contextMenu.position } : {})}
      {...(contextMenu.markerActions ? { markerActions: contextMenu.markerActions } : {})}
      {...(contextMenu.trackActions ? { trackActions: contextMenu.trackActions } : {})}
      isMultiSelect={contextMenu.isMultiSelect}
      selectedCount={contextMenu.selectedCount}
      isEditable={false}
    />
  );
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
  
  // Compare mode: get distribution for coloring (browse panel not included in calculation)
  const isCompareEnabled = useCompareModeStore((s) => s.isEnabled);
  const compareDistribution = useCompareModeStore((s) => s.distribution);
  const getCompareColorForTrack = useCallback((trackUri: string) => {
    return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled);
  }, [compareDistribution, isCompareEnabled]);
  
  // Check if any markers exist (for showing add to markers button)
  const allPlaylists = useInsertionPointsStore((s) => s.playlists);
  const hasAnyMarkers = Object.values(allPlaylists).some((p) => p.markers.length > 0);
  
  // Context menu store
  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);
  const shouldShowContextMenu = contextMenu.isOpen && contextMenu.panelId === SEARCH_PANEL_ID;
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  const { sortKey, sortDirection, handleSort } = useSearchSortState();
  const { localQuery, setLocalQuery, debouncedQuery } = useSearchQueryState(
    searchQuery,
    setSearchQuery,
    clearSpotifySelection
  );

  useFocusWhenActive(isActive, inputRef);
  
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

  // Playback integration - pass 'search' as sourceId to maintain playback context
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
    sourceId: SEARCH_PANEL_ID,
  });

  // Dynamic row height based on compact mode
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;

  // Defer the count to avoid flushSync during render in React 19
  const deferredCount = useDeferredValue(sortedTracks.length);
  
  // Virtualizer for efficient rendering
  // eslint-disable-next-line react-hooks/incompatible-library
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
  
  useLoadNextSearchPageOnScroll({
    scrollRef,
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage: () => {
      void fetchNextPage();
    },
  });
  
  // Handle liked toggle
  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);
  
  // Handle track selection with modifier keys
  const handleSelect = useCallback((_selectionKey: string, index: number, event: React.MouseEvent) => {
    // Toggle selection based on modifier keys
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      toggleSpotifySelection(index);
    } else {
      clearSpotifySelection();
      toggleSpotifySelection(index);
    }
  }, [toggleSpotifySelection, clearSpotifySelection]);
  
  // Handle click (single select)
  const handleClick = useCallback((_selectionKey: string, index: number) => {
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
  
  // Get selected tracks for drag operations
  const getSelectedTracks = useCallback((): Track[] => {
    return Array.from(spotifySelection)
      .sort((a, b) => a - b)
      .map((idx) => sortedTracks[idx])
      .filter((t): t is Track => t !== undefined);
  }, [spotifySelection, sortedTracks]);
  
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <SearchInputBar
        inputRef={inputRef}
        localQuery={localQuery}
        onChange={setLocalQuery}
        onClear={() => setLocalQuery('')}
        hasAnyMarkers={hasAnyMarkers}
        selectedCount={spotifySelection.length}
        getTrackUris={getSelectedTrackUris}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <SearchResultsState
          isLoading={isLoading}
          isError={isError}
          debouncedQuery={debouncedQuery}
          hasTracks={sortedTracks.length > 0}
        >
          <SearchTracksVirtualList
            sortableIds={sortableIds}
            scrollRef={scrollRef}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            virtualizer={virtualizer}
            sortedTracks={sortedTracks}
            spotifySelection={spotifySelection}
            getSelectedTracks={getSelectedTracks}
            isLiked={isLiked}
            onToggleLiked={handleToggleLiked}
            isTrackPlaying={isTrackPlaying}
            isTrackLoading={isTrackLoading}
            playTrack={playTrack}
            pausePlayback={pausePlayback}
            getCompareColorForTrack={getCompareColorForTrack}
            onSelect={handleSelect}
            onClick={handleClick}
            isFetchingNextPage={isFetchingNextPage}
          />
        </SearchResultsState>

        <SearchPanelContextMenu
          shouldShow={shouldShowContextMenu}
          contextMenu={contextMenu}
          onClose={closeContextMenu}
        />
      </div>
    </div>
  );
}
