/**
 * LastfmBrowseTab - Browse and import tracks from Last.fm profiles
 *
 * Features:
 * - Username input (debounced search)
 * - Source type selector (Recent, Loved, Top, Weekly)
 * - Period selector for Top tracks
 * - Infinite scroll with virtualized track list
 * - Tracks displayed with raw Last.fm metadata; matching happens at drop time
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useBrowsePanelStore } from '@features/split-editor/browse/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@features/split-editor/stores/useCompactModeStore';
import { useInsertionPointsStore } from '@features/split-editor/playlist/hooks/useInsertionPointsStore';
import { useContextMenuStore } from '@features/split-editor/stores/useContextMenuStore';
import { lastfmToTrack, lastfmDtoToTrackPayload, type IndexedTrackDTO } from '@features/split-editor/browse/hooks/useLastfmTracks';
import { useSavedTracksIndex } from '@features/playlists/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@features/player/hooks/useTrackPlayback';
import { useCompareModeStore, getTrackCompareColor } from '@features/split-editor/stores/useCompareModeStore';
import { useDebouncedValue } from '@shared/hooks/useDebouncedValue';
import { apiFetch } from '@/lib/api/client';
import { makeCompositeId } from '@/lib/dnd/id';
import { LastfmBrowseFilters } from './LastfmBrowseFilters';
import { LastfmBrowseList } from './LastfmBrowseList';
import type { TrackPayload } from '@features/dnd/model/types';
import type { ImportedTrackDTO, ImportSource } from '@/lib/importers/types';
import type { Track } from '@/lib/music-provider/types';

/** Virtual panel ID for Last.fm browse (used in DnD composite IDs) */
export const LASTFM_PANEL_ID = 'lastfm-panel';

interface LastfmResponse {
  enabled: boolean;
  tracks: ImportedTrackDTO[];
  pagination: {
    page: number;
    perPage: number;
    totalPages?: number;
    totalItems?: number;
  };
  source: ImportSource;
  period?: string;
  error?: string;
}

interface LastfmBrowseTabProps {
  isActive?: boolean;
}

type SelectionMode = 'range' | 'toggle' | 'single';

function resolveSelectionMode(event: React.MouseEvent, lastfmAnchorIndex: number | null): SelectionMode {
  if (event.shiftKey && lastfmAnchorIndex !== null) {
    return 'range';
  }

  if (event.ctrlKey || event.metaKey) {
    return 'toggle';
  }

  return 'single';
}

function makeLastfmCompositeKey(dto: IndexedTrackDTO): string {
  return `${dto.artistName.toLowerCase().trim()}::${dto.trackName.toLowerCase().trim()}`;
}

export function LastfmBrowseTab({ isActive = true }: LastfmBrowseTabProps) {
  const {
    lastfmUsername,
    setLastfmUsername,
    lastfmSource,
    setLastfmSource,
    lastfmPeriod,
    setLastfmPeriod,
    lastfmSelection,
    lastfmAnchorIndex,
    toggleLastfmSelection,
    selectLastfmRange,
    clearLastfmSelection,
  } = useBrowsePanelStore();

  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const isCompact = useHydratedCompactMode();

  const isCompareEnabled = useCompareModeStore((s) => s.isEnabled);
  const compareDistribution = useCompareModeStore((s) => s.distribution);
  const getCompareColorForTrack = useCallback((trackUri: string) => {
    return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled);
  }, [compareDistribution, isCompareEnabled]);

  const allPlaylists = useInsertionPointsStore((s) => s.playlists);
  const hasAnyMarkers = Object.values(allPlaylists).some((p) => p.markers.length > 0);

  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [localUsername, setLocalUsername] = useState(lastfmUsername);

  const debouncedUsername = useDebouncedValue(localUsername, 500);

  useEffect(() => {
    setLocalUsername(lastfmUsername);
  }, [lastfmUsername]);

  useEffect(() => {
    setLastfmUsername(debouncedUsername);
  }, [debouncedUsername, setLastfmUsername]);

  useEffect(() => {
    if (isActive && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isActive]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ['lastfm-browse', lastfmSource, debouncedUsername, lastfmPeriod],
    queryFn: async ({ pageParam }: { pageParam: number }): Promise<LastfmResponse> => {
      if (!debouncedUsername.trim()) {
        return {
          enabled: true,
          tracks: [],
          pagination: { page: 1, perPage: 50 },
          source: lastfmSource,
        };
      }

      const endpoint = lastfmSource.replace('lastfm-', '');
      const params = new URLSearchParams({
        user: debouncedUsername.trim().toLowerCase(),
        page: String(pageParam),
        limit: '50',
      });

      if (lastfmSource === 'lastfm-top') {
        params.set('period', lastfmPeriod);
      }

      return apiFetch<LastfmResponse>(`/api/lastfm/${endpoint}?${params}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      if (totalPages && page < totalPages) {
        return page + 1;
      }
      return undefined;
    },
    enabled: isActive && debouncedUsername.trim().length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const allLastfmTracks = useMemo((): IndexedTrackDTO[] => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page, pageIdx) =>
      page.tracks.map((track, idx) => ({
        ...track,
        globalIndex: pageIdx * 50 + idx,
      }))
    );
  }, [data?.pages]);

  const allTracks = useMemo(() => {
    return allLastfmTracks.map((dto) => lastfmToTrack(dto));
  }, [allLastfmTracks]);

  const sortableIds = useMemo(() => {
    return allTracks.map((track) => {
      const key = makeLastfmCompositeKey(track._lastfmDto);
      return makeCompositeId(LASTFM_PANEL_ID, key, track._lastfmDto.globalIndex);
    });
  }, [allTracks]);

  const selectedTracks = useMemo(() => {
    if (lastfmSelection.length === 0) return [];

    const tracks: Track[] = [];
    for (const idx of lastfmSelection) {
      const lastfmTrack = allLastfmTracks[idx];
      if (!lastfmTrack) continue;
      tracks.push(lastfmToTrack(lastfmTrack));
    }

    return tracks;
  }, [lastfmSelection, allLastfmTracks]);

  const selectedTrackPayloads = useMemo(() => {
    if (lastfmSelection.length === 0) return [];
    return lastfmSelection
      .map((idx) => allLastfmTracks[idx])
      .filter((dto): dto is IndexedTrackDTO => dto !== undefined)
      .map((dto) => lastfmDtoToTrackPayload(dto));
  }, [lastfmSelection, allLastfmTracks]);

  // Playback: LastFM tracks have no provider URIs, so pass empty array
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris: [],
    sourceId: LASTFM_PANEL_ID,
  });

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

  const handleSelect = useCallback((_selectionKey: string, index: number, event: React.MouseEvent) => {
    const track = allTracks[index];
    if (!track) return;

    const mode = resolveSelectionMode(event, lastfmAnchorIndex);
    if (mode === 'range' && lastfmAnchorIndex !== null) {
      selectLastfmRange(lastfmAnchorIndex, index);
      return;
    }

    if (mode === 'single') {
      clearLastfmSelection();
    }

    toggleLastfmSelection(index);
  }, [allTracks, lastfmAnchorIndex, toggleLastfmSelection, selectLastfmRange, clearLastfmSelection]);

  const handleClick = useCallback((_selectionKey: string, index: number) => {
    const track = allTracks[index];
    if (!track) return;

    clearLastfmSelection();
    toggleLastfmSelection(index);
  }, [allTracks, clearLastfmSelection, toggleLastfmSelection]);

  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);

  const handleSort = useCallback(() => {}, []);

  const getSelectedTrackUris = useCallback(async (): Promise<string[]> => {
    // LastFM tracks have no provider URIs; matching happens via pending flow
    return [];
  }, []);

  const getSelectedTrackPayloads = useCallback((): TrackPayload[] => {
    return selectedTrackPayloads;
  }, [selectedTrackPayloads]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <LastfmBrowseFilters
        localUsername={localUsername}
        onUsernameChange={setLocalUsername}
        lastfmSource={lastfmSource}
        onSourceChange={setLastfmSource}
        lastfmPeriod={lastfmPeriod}
        onPeriodChange={setLastfmPeriod}
        hasAnyMarkers={hasAnyMarkers}
        selectedCount={lastfmSelection.length}
        getTrackUris={getSelectedTrackUris}
        getTrackPayloads={getSelectedTrackPayloads}
        inputRef={inputRef}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          ref={scrollRef}
          className="h-full overflow-auto"
        >
          <LastfmBrowseList
            allTracks={allTracks}
            allLastfmTracks={allLastfmTracks}
            sortableIds={sortableIds}
            isLoading={isLoading}
            isError={isError}
            error={error}
            debouncedUsername={debouncedUsername}
            isFetchingNextPage={isFetchingNextPage}
            lastfmSelection={lastfmSelection}
            isCompact={isCompact}
            hasAnyMarkers={hasAnyMarkers}
            selectedTracks={selectedTracks}
            selectedTrackPayloads={selectedTrackPayloads}
            isLiked={isLiked}
            isTrackPlaying={isTrackPlaying}
            isTrackLoading={isTrackLoading}
            playTrack={playTrack}
            pausePlayback={pausePlayback}
            handleToggleLiked={handleToggleLiked}
            handleSelect={handleSelect}
            handleClick={handleClick}
            handleSort={handleSort}
            getCompareColorForTrack={getCompareColorForTrack}
            contextMenu={contextMenu}
            closeContextMenu={closeContextMenu}
            scrollRef={scrollRef}
          />
        </div>
      </div>
    </div>
  );
}
