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
import { SearchFilterToggle } from './SearchFilterToggle';
import { ArtistResultsList } from './ArtistResultsList';
import { AlbumResultsList } from './AlbumResultsList';
import { DrillDownTrackList } from './DrillDownTrackList';
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

type SearchPanelBodyProps = {
  effectiveProviderId: MusicProviderId;
  effectiveSearchFilter: 'all' | 'tracks' | 'artists' | 'albums';
  isLoading: boolean;
  isError: boolean;
  debouncedQuery: string;
  sortedTracks: Track[];
  shouldShowContextMenu: boolean;
  contextMenu: ReturnType<typeof useContextMenuStore.getState>;
  closeContextMenu: () => void;
  sortableIds: string[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sortKey: ReturnType<typeof useSearchSortState>['sortKey'];
  sortDirection: ReturnType<typeof useSearchSortState>['sortDirection'];
  handleSort: ReturnType<typeof useSearchSortState>['handleSort'];
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
  spotifySelection: number[];
  getSelectedTracks: () => Track[];
  isLiked: (trackId: string) => boolean;
  handleToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  isTrackPlaying: (trackId: string) => boolean;
  isTrackLoading: (trackUri: string) => boolean;
  playTrack: (trackUri: string) => void;
  pausePlayback: () => void;
  getCompareColorForTrack: (trackUri: string) => string;
  handleSelect: (_selectionKey: string, index: number, event: React.MouseEvent) => void;
  handleClick: (_selectionKey: string, index: number) => void;
  isFetchingNextPage: boolean;
  isActive: boolean;
};

function SearchPanelBody(props: SearchPanelBodyProps) {
  if (props.effectiveSearchFilter === 'artists') {
    return (
      <AlbumResultsBoundary
        type="artists"
        debouncedQuery={props.debouncedQuery}
        providerId={props.effectiveProviderId}
        isActive={props.isActive}
      />
    );
  }

  if (props.effectiveSearchFilter === 'albums') {
    return (
      <AlbumResultsBoundary
        type="albums"
        debouncedQuery={props.debouncedQuery}
        providerId={props.effectiveProviderId}
        isActive={props.isActive}
      />
    );
  }

  return (
    <>
      <SearchResultsState
        isLoading={props.isLoading}
        isError={props.isError}
        debouncedQuery={props.debouncedQuery}
        hasTracks={props.sortedTracks.length > 0}
      >
        <SearchTracksVirtualList
          panelId={SEARCH_PANEL_ID}
          sortableIds={props.sortableIds}
          scrollRef={props.scrollRef}
          sortKey={props.sortKey}
          sortDirection={props.sortDirection}
          onSort={props.handleSort}
          virtualizer={props.virtualizer}
          sortedTracks={props.sortedTracks}
          spotifySelection={props.spotifySelection}
          getSelectedTracks={props.getSelectedTracks}
          isLiked={props.isLiked}
          onToggleLiked={props.handleToggleLiked}
          isTrackPlaying={props.isTrackPlaying}
          isTrackLoading={props.isTrackLoading}
          playTrack={props.playTrack}
          pausePlayback={props.pausePlayback}
          getCompareColorForTrack={props.getCompareColorForTrack}
          onSelect={props.handleSelect}
          onClick={props.handleClick}
          isFetchingNextPage={props.isFetchingNextPage}
          providerId={props.effectiveProviderId}
        />
      </SearchResultsState>

      <SearchPanelContextMenu
        shouldShow={props.shouldShowContextMenu}
        contextMenu={props.contextMenu}
        onClose={props.closeContextMenu}
      />
    </>
  );
}

function AlbumResultsBoundary({
  type,
  debouncedQuery,
  providerId,
  isActive,
}: {
  type: 'artists' | 'albums';
  debouncedQuery: string;
  providerId: MusicProviderId;
  isActive: boolean;
}) {
  if (type === 'artists') {
    return <ArtistResultsList debouncedQuery={debouncedQuery} providerId={providerId} isActive={isActive} />;
  }

  return <AlbumResultsList debouncedQuery={debouncedQuery} providerId={providerId} isActive={isActive} />;
}

function useSpotifyTracksOnlyFilter(
  effectiveProviderId: MusicProviderId,
  searchFilter: 'all' | 'tracks' | 'artists' | 'albums',
  setSearchFilter: (filter: 'all' | 'tracks' | 'artists' | 'albums') => void,
) {
  useEffect(() => {
    if (effectiveProviderId === 'spotify' && searchFilter !== 'tracks') {
      setSearchFilter('tracks');
    }
  }, [effectiveProviderId, searchFilter, setSearchFilter]);
}

function resolveTrackSearchEnabled(params: {
  isActive: boolean;
  effectiveSearchFilter: 'all' | 'tracks' | 'artists' | 'albums';
  drillDown: unknown;
  debouncedQuery: string;
}): boolean {
  return params.isActive
    && (params.effectiveSearchFilter === 'tracks' || params.effectiveSearchFilter === 'all')
    && !params.drillDown
    && params.debouncedQuery.trim().length > 0;
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
    searchFilter,
    setSearchFilter,
    drillDown,
  } = useBrowsePanelStore();

  const effectiveProviderId = providerId ?? storeProviderId;
  const effectiveSearchFilter = effectiveProviderId === 'spotify' ? 'tracks' : searchFilter;
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const isCompact = useHydratedCompactMode();
  useSpotifyTracksOnlyFilter(effectiveProviderId, searchFilter, setSearchFilter);

  const isCompareEnabled = useCompareModeStore((state) => state.isEnabled);
  const compareDistribution = useCompareModeStore((state) => state.distribution);
  const getCompareColorForTrack = useCallback((trackUri: string) => {
    return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled) ?? '';
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

  const isTrackSearchEnabled = resolveTrackSearchEnabled({
    isActive,
    effectiveSearchFilter,
    drillDown,
    debouncedQuery,
  });

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
    enabled: isTrackSearchEnabled,
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

  if (drillDown) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DrillDownTrackList drillDown={drillDown} providerId={effectiveProviderId} />
      </div>
    );
  }

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

      {effectiveProviderId !== 'spotify' ? (
        <SearchFilterToggle activeFilter={effectiveSearchFilter} onFilterChange={setSearchFilter} />
      ) : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        <SearchPanelBody
          effectiveProviderId={effectiveProviderId}
          effectiveSearchFilter={effectiveSearchFilter}
          isLoading={isLoading}
          isError={isError}
          debouncedQuery={debouncedQuery}
          sortedTracks={sortedTracks}
          shouldShowContextMenu={shouldShowContextMenu}
          contextMenu={contextMenu}
          closeContextMenu={closeContextMenu}
          sortableIds={sortableIds}
          scrollRef={scrollRef}
          sortKey={sortKey}
          sortDirection={sortDirection}
          handleSort={handleSort}
          virtualizer={virtualizer}
          spotifySelection={spotifySelection}
          getSelectedTracks={getSelectedTracks}
          isLiked={isLiked}
          handleToggleLiked={handleToggleLiked}
          isTrackPlaying={isTrackPlaying}
          isTrackLoading={isTrackLoading}
          playTrack={playTrack}
          pausePlayback={pausePlayback}
          getCompareColorForTrack={getCompareColorForTrack}
          handleSelect={handleSelect}
          handleClick={handleClick}
          isFetchingNextPage={isFetchingNextPage}
          isActive={isActive}
        />
      </div>
    </div>
  );
}
