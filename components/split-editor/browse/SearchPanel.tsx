'use client';
'use no memo';

import { useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useCompareModeStore, getTrackCompareColor } from '@/hooks/useCompareModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { usePlaylistSort } from '@/hooks/usePlaylistSort';
import { apiFetch } from '@/lib/api/client';
import {
  SearchInputBar,
  SearchResultsState,
  SearchTracksVirtualList,
  SearchPanelContextMenu,
  useSearchQueryState,
  useFocusWhenActive,
  useSearchSortState,
  useLoadNextSearchPageOnScroll,
} from './searchPanelHelpers';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from '../constants';
import { makeCompositeId } from '@/lib/dnd/id';
import type { Track, MusicProviderId } from '@/lib/music-provider/types';

export const SEARCH_PANEL_ID = 'search-panel';

interface SearchResponse {
  tracks: Track[];
  total: number;
  nextOffset: number | null;
}

interface SearchPanelProps {
  isActive?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  providerId?: MusicProviderId;
}

export function SearchPanel({ isActive = true, inputRef: externalInputRef, providerId }: SearchPanelProps) {
  const {
    searchQuery,
    setSearchQuery,
    spotifySelection,
    toggleSpotifySelection,
    clearSpotifySelection,
    providerId: storeProviderId,
    setProviderId,
  } = useBrowsePanelStore();

  const effectiveProviderId = providerId ?? storeProviderId;
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const isCompact = useHydratedCompactMode();

  const isCompareEnabled = useCompareModeStore((state) => state.isEnabled);
  const compareDistribution = useCompareModeStore((state) => state.distribution);
  const getCompareColorForTrack = useCallback((trackUri: string) => {
    return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled);
  }, [compareDistribution, isCompareEnabled]);

  const allPlaylists = useInsertionPointsStore((state) => state.playlists);
  const hasAnyMarkers = Object.values(allPlaylists).some((playlist) => playlist.markers.length > 0);

  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((state) => state.closeMenu);
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

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['browse-search', effectiveProviderId, debouncedQuery],
    queryFn: async ({ pageParam }: { pageParam: number }): Promise<SearchResponse> => {
      if (!debouncedQuery.trim()) {
        return { tracks: [], total: 0, nextOffset: null };
      }
      return apiFetch<SearchResponse>(
        `/api/search/tracks?q=${encodeURIComponent(debouncedQuery)}&limit=50&offset=${pageParam}&provider=${effectiveProviderId}`
      );
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage: SearchResponse) => lastPage.nextOffset,
    enabled: isActive && debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const allTracks = useMemo(() => {
    if (!data?.pages) {
      return [] as (Track & { position: number })[];
    }

    return data.pages.flatMap((page: SearchResponse, pageIdx: number) =>
      page.tracks.map((track: Track, idx: number) => ({
        ...track,
        position: pageIdx * 50 + idx,
      }))
    );
  }, [data?.pages]);

  const sortedTracks = usePlaylistSort({
    tracks: allTracks,
    sortKey,
    sortDirection,
  });

  const sortableIds = useMemo(() => {
    return sortedTracks.map((track, idx) =>
      makeCompositeId(SEARCH_PANEL_ID, track.id || track.uri, track.position ?? idx)
    );
  }, [sortedTracks]);

  const trackUris = useMemo(() => sortedTracks.map((track: Track) => track.uri), [sortedTracks]);
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
    sourceId: SEARCH_PANEL_ID,
  });

  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
  const deferredCount = useDeferredValue(sortedTracks.length);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: deferredCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: VIRTUALIZATION_OVERSCAN,
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const prevCompactRef = useRef(isCompact);
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

  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);

  const handleSelect = useCallback((_selectionKey: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      toggleSpotifySelection(index);
      return;
    }

    clearSpotifySelection();
    toggleSpotifySelection(index);
  }, [toggleSpotifySelection, clearSpotifySelection]);

  const handleClick = useCallback((_selectionKey: string, index: number) => {
    clearSpotifySelection();
    toggleSpotifySelection(index);
  }, [clearSpotifySelection, toggleSpotifySelection]);

  const getSelectedTrackUris = useCallback((): string[] => {
    return Array.from(spotifySelection)
      .sort((a, b) => a - b)
      .map((idx) => sortedTracks[idx])
      .filter((track): track is Track => track !== undefined && !!track.uri)
      .map((track) => track.uri);
  }, [spotifySelection, sortedTracks]);

  const getSelectedTracks = useCallback((): Track[] => {
    return Array.from(spotifySelection)
      .sort((a, b) => a - b)
      .map((idx) => sortedTracks[idx])
      .filter((track): track is Track => track !== undefined);
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
        providerId={effectiveProviderId}
        onProviderChange={setProviderId}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <SearchResultsState
          isLoading={isLoading}
          isError={isError}
          debouncedQuery={debouncedQuery}
          hasTracks={sortedTracks.length > 0}
        >
          <SearchTracksVirtualList
            panelId={SEARCH_PANEL_ID}
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
