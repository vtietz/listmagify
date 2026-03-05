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
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { useLastfmMatch, makeMatchKeyFromDTO } from '@/hooks/useLastfmMatchCache';
import { lastfmToTrack, type IndexedTrackDTO } from '@/hooks/useLastfmTracks';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { useCompareModeStore, getTrackCompareColor } from '@/hooks/useCompareModeStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiFetch } from '@/lib/api/client';
import { makeCompositeId } from '@/lib/dnd/id';
import { toast } from '@/lib/ui/toast';
import { LastfmBrowseFilters } from './LastfmBrowseFilters';
import { LastfmBrowseList } from './LastfmBrowseList';
import type { ImportedTrackDTO, ImportSource } from '@/lib/importers/types';
import type { Track } from '@/lib/spotify/types';

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
    if (lastfmSelection.length === 0) return [];
    
    const uris: string[] = [];
    // Use lastfmSelection directly as it's already ordered by selection order
    for (const idx of lastfmSelection) {
      const track = allLastfmTracks[idx];
      if (!track) continue;
      
      const cached = getCachedMatch(track);
      if (cached?.spotifyTrack?.uri && 
          (cached.confidence === 'high' || cached.confidence === 'medium')) {
        uris.push(cached.spotifyTrack.uri);
      }
    }
    
    return uris;
  }, [lastfmSelection, allLastfmTracks, getCachedMatch]);
  
  // Get selected tracks as Track objects for drag overlay
  const selectedTracks = useMemo(() => {
    if (lastfmSelection.length === 0) return [];
    
    const tracks: Track[] = [];
    for (const idx of lastfmSelection) {
      const lastfmTrack = allLastfmTracks[idx];
      if (!lastfmTrack) continue;
      
      const cached = getCachedMatch(lastfmTrack);
      const spotifyTrack = cached?.spotifyTrack;
      
      if (spotifyTrack && 
          (cached.confidence === 'high' || cached.confidence === 'medium')) {
        // Use the matched Spotify track
        tracks.push(spotifyTrack);
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
    
    // Shift+click: range selection from anchor to current
    if (event.shiftKey && lastfmAnchorIndex !== null) {
      const start = Math.min(lastfmAnchorIndex, index);
      const end = Math.max(lastfmAnchorIndex, index);
      
      // Select range
      selectLastfmRange(lastfmAnchorIndex, index);
      
      // Trigger matching for all tracks in range
      const tracksToMatch = allTracks.slice(start, end + 1)
        .filter(t => {
          const cached = getCachedMatch(t._lastfmDto);
          return !cached || cached.status === 'idle';
        })
        .map(t => t._lastfmDto);
      
      if (tracksToMatch.length > 0) {
        matchTracks(tracksToMatch);
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+click: toggle individual selection
      toggleLastfmSelection(index);
      
      // Trigger matching for the track
      const cached = getCachedMatch(track._lastfmDto);
      if (!cached || cached.status === 'idle') {
        matchTrack(track._lastfmDto);
      }
    } else {
      // Plain click: single select (clears others)
      clearLastfmSelection();
      toggleLastfmSelection(index);
      
      // Trigger matching for the track
      const cached = getCachedMatch(track._lastfmDto);
      if (!cached || cached.status === 'idle') {
        matchTrack(track._lastfmDto);
      }
    }
  }, [allTracks, lastfmAnchorIndex, toggleLastfmSelection, selectLastfmRange, clearLastfmSelection, getCachedMatch, matchTrack, matchTracks]);
  
  // Handle click (single select)
  const handleClick = useCallback((_selectionKey: string, index: number) => {
    const track = allTracks[index];
    if (!track) return;
    
    // Single click - clear others and select this one
    clearLastfmSelection();
    toggleLastfmSelection(index);
    
    // Trigger matching
    const cached = getCachedMatch(track._lastfmDto);
    if (!cached || cached.status === 'idle') {
      matchTrack(track._lastfmDto);
    }
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
    
    // Get selected tracks in selection order (CTRL+click order preserved)
    const selectedTracks = lastfmSelection
      .map((idx) => allLastfmTracks[idx])
      .filter((t): t is IndexedTrackDTO => t !== undefined);
    
    if (selectedTracks.length === 0) {
      toast.error('No tracks selected');
      return [];
    }
    
    // Match all selected tracks (batch)
    const matchResults = await matchTracks(selectedTracks);
    
    // Get matched URIs (only high/medium confidence)
    const matchedUris: string[] = [];
    let unmatchedCount = 0;
    
    for (const track of selectedTracks) {
      const key = makeMatchKeyFromDTO(track);
      const match = matchResults.get(key);
      
      if (match?.status === 'matched' && match.spotifyTrack) {
        // Accept high/medium confidence matches
        if (match.confidence === 'high' || match.confidence === 'medium') {
          matchedUris.push(match.spotifyTrack.uri);
        } else {
          unmatchedCount++;
        }
      } else {
        unmatchedCount++;
      }
    }
    
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
