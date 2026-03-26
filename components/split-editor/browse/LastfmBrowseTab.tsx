/**
 * LastfmBrowseTab - Browse and import tracks from Last.fm profiles
 * 
 * Features:
 * - Username input (debounced search)
 * - Source type selector (Recent, Loved, Top, Weekly)
 * - Period selector for Top tracks
 * - Infinite scroll with virtualized track list
 * - Uses same TrackRow component as Spotify search (columns filled when matched)
 * - Lazy Spotify matching on selection
 * - Add selected to marked insertion points
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useBrowsePanelStore } from '@features/split-editor/browse/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@features/split-editor/stores/useCompactModeStore';
import { useInsertionPointsStore } from '@features/split-editor/playlist/hooks/useInsertionPointsStore';
import { useContextMenuStore } from '@features/split-editor/stores/useContextMenuStore';
import { useLastfmMatch, makeMatchKeyFromDTO } from '@features/split-editor/browse/hooks/useLastfmMatchCache';
import { lastfmToTrack, type IndexedTrackDTO } from '@features/split-editor/browse/hooks/useLastfmTracks';
import { useSavedTracksIndex } from '@features/playlists/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@features/player/hooks/useTrackPlayback';
import { useCompareModeStore, getTrackCompareColor } from '@features/split-editor/stores/useCompareModeStore';
import { useDebouncedValue } from '@shared/hooks/useDebouncedValue';
import { apiFetch } from '@/lib/api/client';
import { makeCompositeId } from '@/lib/dnd/id';
import { toast } from '@/lib/ui/toast';
import { LastfmBrowseFilters } from './LastfmBrowseFilters';
import { LastfmBrowseList } from './LastfmBrowseList';
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
  /** Whether this tab is currently active */
  isActive?: boolean;
}

type SelectionMode = 'range' | 'toggle' | 'single';

function shouldMatchTrack(cached: { status?: string } | undefined): boolean {
  return !cached || cached.status === 'idle';
}

function resolveSelectionMode(event: React.MouseEvent, lastfmAnchorIndex: number | null): SelectionMode {
  if (event.shiftKey && lastfmAnchorIndex !== null) {
    return 'range';
  }

  if (event.ctrlKey || event.metaKey) {
    return 'toggle';
  }

  return 'single';
}

function triggerTrackMatchIfNeeded(
  dto: IndexedTrackDTO,
  getCachedMatch: (dto: IndexedTrackDTO) => any,
  matchTrack: (dto: IndexedTrackDTO) => void,
): void {
  const cached = getCachedMatch(dto);
  if (shouldMatchTrack(cached)) {
    matchTrack(dto);
  }
}

function handleRangeSelection(params: {
  allTracks: Array<{ _lastfmDto: IndexedTrackDTO }>;
  lastfmAnchorIndex: number;
  index: number;
  selectLastfmRange: (anchorIndex: number, index: number) => void;
  getCachedMatch: (dto: IndexedTrackDTO) => any;
  matchTracks: (tracks: IndexedTrackDTO[]) => Promise<Map<string, any>>;
}): void {
  const start = Math.min(params.lastfmAnchorIndex, params.index);
  const end = Math.max(params.lastfmAnchorIndex, params.index);
  params.selectLastfmRange(params.lastfmAnchorIndex, params.index);

  const tracksToMatch = params.allTracks
    .slice(start, end + 1)
    .map((track) => track._lastfmDto)
    .filter((dto) => shouldMatchTrack(params.getCachedMatch(dto)));

  if (tracksToMatch.length > 0) {
    void params.matchTracks(tracksToMatch);
  }
}

function getSelectedDtos(lastfmSelection: number[], allLastfmTracks: IndexedTrackDTO[]): IndexedTrackDTO[] {
  return lastfmSelection
    .map((idx) => allLastfmTracks[idx])
    .filter((track): track is IndexedTrackDTO => track !== undefined);
}

function extractMatchedUri(match: any): string | null {
  const matchedTrack = match?.matchedTrack ?? match?.spotifyTrack;
  if (!matchedTrack) {
    return null;
  }

  if (match?.status !== 'matched') {
    return null;
  }

  if (match.confidence !== 'high' && match.confidence !== 'medium') {
    return null;
  }

  return matchedTrack.uri;
}

function collectMatchedUris(
  selectedTracks: IndexedTrackDTO[],
  matchResults: Map<string, any>,
): { matchedUris: string[]; unmatchedCount: number } {
  const matchedUris: string[] = [];
  let unmatchedCount = 0;

  for (const track of selectedTracks) {
    const key = makeMatchKeyFromDTO(track);
    const uri = extractMatchedUri(matchResults.get(key));
    if (uri) {
      matchedUris.push(uri);
    } else {
      unmatchedCount++;
    }
  }

  return { matchedUris, unmatchedCount };
}

function isHighOrMediumConfidenceMatch(cached: any): boolean {
  return cached?.confidence === 'high' || cached?.confidence === 'medium';
}

function collectSelectedMatchedUris(params: {
  lastfmSelection: number[];
  allLastfmTracks: IndexedTrackDTO[];
  getCachedMatch: (dto: IndexedTrackDTO) => any;
}): string[] {
  if (params.lastfmSelection.length === 0) {
    return [];
  }

  const uris: string[] = [];
  for (const idx of params.lastfmSelection) {
    const track = params.allLastfmTracks[idx];
    if (!track) {
      continue;
    }

    const cached = params.getCachedMatch(track);
    const matchedTrack = cached?.matchedTrack ?? cached?.spotifyTrack;
    if (matchedTrack?.uri && isHighOrMediumConfidenceMatch(cached)) {
      uris.push(matchedTrack.uri);
    }
  }

  return uris;
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
  
  const { matchTrack, matchTracks, getCachedMatch } = useLastfmMatch();
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const isCompact = useHydratedCompactMode();
  
  // Compare mode: get distribution for coloring (Last.fm panel not included in calculation)
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
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Local input state for immediate feedback
  const [localUsername, setLocalUsername] = useState(lastfmUsername);
  
  // Debounce username input
  const debouncedUsername = useDebouncedValue(localUsername, 500);
  
  // Sync local state when store changes
  useEffect(() => {
    setLocalUsername(lastfmUsername);
  }, [lastfmUsername]);
  
  // Update store when debounced value changes
  useEffect(() => {
    setLastfmUsername(debouncedUsername);
  }, [debouncedUsername, setLastfmUsername]);
  
  // Focus input when tab becomes active
  useEffect(() => {
    if (isActive && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isActive]);
  
  // Infinite query for Last.fm tracks
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
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
  
  // Flatten all pages into a single track list with stable positions
  const allLastfmTracks = useMemo((): IndexedTrackDTO[] => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page, pageIdx) =>
      page.tracks.map((track, idx) => ({
        ...track,
        globalIndex: pageIdx * 50 + idx,
      }))
    );
  }, [data?.pages]);
  
  // Convert to Track format for display (with matched data when available)
  const allTracks = useMemo(() => {
    return allLastfmTracks.map((dto) => {
      const cached = getCachedMatch(dto);
      return lastfmToTrack(dto, cached);
    });  
  }, [allLastfmTracks, getCachedMatch]);
  
  // Create composite IDs for sortable context
  const sortableIds = useMemo(() => {
    return allTracks.map((track) => {
      const key = makeMatchKeyFromDTO(track._lastfmDto);
      return makeCompositeId(LASTFM_PANEL_ID, key, track._lastfmDto.globalIndex);
    });
  }, [allTracks]);
  
  // Compute matched URIs for all selected tracks (used for multi-select drag)
  const selectedMatchedUris = useMemo(() => {
    return collectSelectedMatchedUris({
      lastfmSelection,
      allLastfmTracks,
      getCachedMatch,
    });
  }, [lastfmSelection, allLastfmTracks, getCachedMatch]);
  
  // Get selected tracks as Track objects for drag overlay
  const selectedTracks = useMemo(() => {
    if (lastfmSelection.length === 0) return [];
    
    const tracks: Track[] = [];
    for (const idx of lastfmSelection) {
      const lastfmTrack = allLastfmTracks[idx];
      if (!lastfmTrack) continue;
      
      const cached = getCachedMatch(lastfmTrack);
      const matchedTrack = cached?.matchedTrack ?? cached?.spotifyTrack;
      
      if (matchedTrack && 
          (cached?.confidence === 'high' || cached?.confidence === 'medium')) {
        // Use the matched provider track
        tracks.push(matchedTrack);
      } else {
        // Create a minimal Track object from Last.fm data
        tracks.push(lastfmToTrack(lastfmTrack, cached));
      }
    }
    
    return tracks;
  }, [lastfmSelection, allLastfmTracks, getCachedMatch]);
  
  // Track URIs for playback (only matched tracks)
  const trackUris = useMemo(() => 
    allTracks
      .filter((t) => t._isMatched && t.uri && !t.uri.startsWith('lastfm:'))
      .map((t) => t.uri),
    [allTracks]
  );
  
  // Playback integration - pass 'lastfm' as sourceId to maintain playback context
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
    sourceId: LASTFM_PANEL_ID,
  });
  
  // Auto-load more when scrolling near the bottom (infinite scroll)
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
  
  // Handle track selection (triggers matching)
  const handleSelect = useCallback((_selectionKey: string, index: number, event: React.MouseEvent) => {
    const track = allTracks[index];
    if (!track) return;

    const mode = resolveSelectionMode(event, lastfmAnchorIndex);
    if (mode === 'range' && lastfmAnchorIndex !== null) {
      handleRangeSelection({
        allTracks,
        lastfmAnchorIndex,
        index,
        selectLastfmRange,
        getCachedMatch,
        matchTracks,
      });
      return;
    }

    if (mode === 'single') {
      clearLastfmSelection();
    }

    toggleLastfmSelection(index);
    triggerTrackMatchIfNeeded(track._lastfmDto, getCachedMatch, matchTrack);
  }, [allTracks, lastfmAnchorIndex, toggleLastfmSelection, selectLastfmRange, clearLastfmSelection, getCachedMatch, matchTrack, matchTracks]);
  
  // Handle click (single select)
  const handleClick = useCallback((_selectionKey: string, index: number) => {
    const track = allTracks[index];
    if (!track) return;
    
    // Single click - clear others and select this one
    clearLastfmSelection();
    toggleLastfmSelection(index);
    
    // Trigger matching
    triggerTrackMatchIfNeeded(track._lastfmDto, getCachedMatch, matchTrack);
  }, [allTracks, clearLastfmSelection, toggleLastfmSelection, getCachedMatch, matchTrack]);
  
  // Handle liked toggle (only for matched tracks)
  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);
  
  // Dummy sort handler (Last.fm doesn't support sorting)
  const handleSort = useCallback(() => {}, []);
  
  // Handle adding selected tracks to all marked insertion points
  // This is now a callback that returns URIs for the unified button
  const getSelectedTrackUris = useCallback(async (): Promise<string[]> => {
    if (lastfmSelection.length === 0) return [];

    const selectedTracks = getSelectedDtos(lastfmSelection, allLastfmTracks);
    if (selectedTracks.length === 0) {
      toast.error('No tracks selected');
      return [];
    }

    const matchResults = await matchTracks(selectedTracks);
    const { matchedUris, unmatchedCount } = collectMatchedUris(selectedTracks, matchResults);
    
    if (matchedUris.length === 0) {
      toast.error(`Could not match any of the ${selectedTracks.length} selected tracks`);
      return [];
    }
    
    // Show warning about unmatched if any
    if (unmatchedCount > 0) {
      toast.info(`${unmatchedCount} track${unmatchedCount > 1 ? 's' : ''} couldn't be matched`);
    }
    
    // Clear selection after getting URIs
    clearLastfmSelection();
    
    return matchedUris;
  }, [
    lastfmSelection,
    allLastfmTracks,
    matchTracks,
    clearLastfmSelection,
  ]);
  
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
        inputRef={inputRef}
      />
      
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          ref={scrollRef}
          className="h-full overflow-auto"
        >
          <LastfmBrowseList
            allTracks={allTracks}
            sortableIds={sortableIds}
            isLoading={isLoading}
            isError={isError}
            error={error}
            debouncedUsername={debouncedUsername}
            isFetchingNextPage={isFetchingNextPage}
            lastfmSelection={lastfmSelection}
            isCompact={isCompact}
            hasAnyMarkers={hasAnyMarkers}
            selectedMatchedUris={selectedMatchedUris}
            selectedTracks={selectedTracks}
            isLiked={isLiked}
            getCachedMatch={getCachedMatch}
            matchTrack={matchTrack}
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
