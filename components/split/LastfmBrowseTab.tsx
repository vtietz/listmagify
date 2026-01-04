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

import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { User, Loader2, Radio, Circle, CheckCircle2, XCircle } from 'lucide-react';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useLastfmMatch, makeMatchKeyFromDTO, type CachedMatch } from '@/hooks/useLastfmMatchCache';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TrackRow } from './TrackRow';
import { TableHeader } from './TableHeader';
import { AddSelectedToMarkersButton } from './AddSelectedToMarkersButton';
import { LastfmAddToMarkedButton } from './LastfmAddToMarkedButton';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from './constants';
import { makeCompositeId } from '@/lib/dnd/id';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';
import type { ImportedTrackDTO, ImportSource, LastfmPeriod } from '@/lib/importers/types';
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
  period?: LastfmPeriod;
  error?: string;
}

/** Extended track DTO with global index for flattened infinite query pages */
interface IndexedTrackDTO extends ImportedTrackDTO {
  globalIndex: number;
}

/** Extended Track type with Last.fm metadata for rendering */
interface LastfmTrack extends Track {
  _lastfmDto: IndexedTrackDTO;
  _isMatched: boolean;
}

/**
 * Convert a Last.fm track to a Spotify Track format for display
 * Uses matched Spotify data when available, otherwise shows Last.fm info as placeholder
 */
function lastfmToTrack(
  dto: IndexedTrackDTO,
  cachedMatch: CachedMatch | undefined
): LastfmTrack {
  const matched = cachedMatch?.spotifyTrack;
  
  if (matched) {
    // Use matched Spotify track data
    return {
      id: matched.id,
      uri: matched.uri,
      name: matched.name,
      artists: matched.artists.length > 0 ? matched.artists : [dto.artistName],
      artistObjects: matched.artists.length > 0 
        ? matched.artists.map(name => ({ id: null, name }))
        : [{ id: null, name: dto.artistName }],
      durationMs: matched.durationMs ?? 0,
      position: dto.globalIndex,
      album: matched.album?.name 
        ? { id: matched.album.id ?? null, name: matched.album.name }
        : dto.albumName 
          ? { name: dto.albumName }
          : null,
      popularity: matched.popularity ?? null,
      _lastfmDto: dto,
      _isMatched: true,
    };
  }
  
  // Unmatched - show Last.fm info as placeholder
  return {
    id: null, // Mark as unmatched
    uri: `lastfm:${dto.artistName}:${dto.trackName}`, // Fake URI for identification
    name: dto.trackName,
    artists: [dto.artistName],
    artistObjects: [{ id: null, name: dto.artistName }],
    durationMs: 0, // Unknown
    position: dto.globalIndex,
    album: dto.albumName ? { name: dto.albumName } : null,
    popularity: null,
    _lastfmDto: dto,
    _isMatched: false,
  };
}

/** Match status indicator component */
function MatchStatusIndicator({ status }: { status: 'idle' | 'pending' | 'matched' | 'failed' }) {
  switch (status) {
    case 'pending':
      return (
        <Loader2 
          className="h-3.5 w-3.5 animate-spin text-muted-foreground" 
          aria-label="Matching..."
        />
      );
    case 'matched':
      return (
        <CheckCircle2 
          className="h-3.5 w-3.5 text-green-500" 
          aria-label="Matched"
        />
      );
    case 'failed':
      return (
        <XCircle 
          className="h-3.5 w-3.5 text-red-500" 
          aria-label="No match found"
        />
      );
    case 'idle':
    default:
      return (
        <Circle 
          className="h-3.5 w-3.5 text-muted-foreground/50" 
          aria-label="Not matched yet"
        />
      );
  }
}

const SOURCE_OPTIONS: { value: ImportSource; label: string }[] = [
  { value: 'lastfm-recent', label: 'Recent' },
  { value: 'lastfm-loved', label: 'Loved' },
  { value: 'lastfm-top', label: 'Top' },
  { value: 'lastfm-weekly', label: 'Weekly' },
];

const PERIOD_OPTIONS: { value: LastfmPeriod; label: string }[] = [
  { value: '7day', label: '7d' },
  { value: '1month', label: '1mo' },
  { value: '3month', label: '3mo' },
  { value: '6month', label: '6mo' },
  { value: '12month', label: '1yr' },
  { value: 'overall', label: 'All' },
];

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
    toggleLastfmSelection,
    clearLastfmSelection,
  } = useBrowsePanelStore();
  
  const { matchTrack, matchTracks, getCachedMatch, isPending } = useLastfmMatch();
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const isCompact = useHydratedCompactMode();
  
  // Check if any markers exist (for showing add to markers button)
  const allPlaylists = useInsertionPointsStore((s) => s.playlists);
  const hasAnyMarkers = Object.values(allPlaylists).some((p) => p.markers.length > 0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  // Use state for scroll element to avoid flushSync during React render
  // (virtualizer calls flushSync internally when scroll element changes)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
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
  const allTracks = useMemo((): LastfmTrack[] => {
    return allLastfmTracks.map((dto) => {
      const cached = getCachedMatch(dto);
      return lastfmToTrack(dto, cached);
    });
  }, [allLastfmTracks, getCachedMatch]);
  
  const totalResults = data?.pages[0]?.pagination?.totalItems ?? allTracks.length;
  
  // Create composite IDs for sortable context
  const sortableIds = useMemo(() => {
    return allTracks.map((track) => {
      const key = makeMatchKeyFromDTO(track._lastfmDto);
      return makeCompositeId(LASTFM_PANEL_ID, key, track._lastfmDto.globalIndex);
    });
  }, [allTracks]);
  
  // Track URIs for playback (only matched tracks)
  const trackUris = useMemo(() => 
    allTracks
      .filter((t) => t._isMatched && t.uri && !t.uri.startsWith('lastfm:'))
      .map((t) => t.uri),
    [allTracks]
  );
  
  // Playback integration
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
  });
  
  // Dynamic row height based on compact mode
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
  
  // Defer the count to avoid flushSync during render
  const deferredCount = useDeferredValue(allTracks.length);
  
  // Virtualizer for efficient rendering
  // Uses scrollElement state instead of ref to avoid flushSync during render
  const virtualizer = useVirtualizer({
    count: deferredCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: VIRTUALIZATION_OVERSCAN,
  });
  
  // Store virtualizer in ref
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  
  // Track previous compact mode
  const prevCompactRef = useRef(isCompact);
  
  // Re-measure when compact mode changes
  useEffect(() => {
    if (prevCompactRef.current !== isCompact) {
      prevCompactRef.current = isCompact;
      const timeoutId = setTimeout(() => {
        virtualizerRef.current.measure();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isCompact]);
  
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
  const handleSelect = useCallback((selectionKey: string, index: number, event: React.MouseEvent) => {
    const track = allTracks[index];
    if (!track) return;
    
    // Toggle selection based on modifier keys
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      toggleLastfmSelection(index);
    } else {
      clearLastfmSelection();
      toggleLastfmSelection(index);
    }
    
    // Trigger matching for the track
    const cached = getCachedMatch(track._lastfmDto);
    if (!cached || cached.status === 'idle') {
      matchTrack(track._lastfmDto);
    }
  }, [allTracks, toggleLastfmSelection, clearLastfmSelection, getCachedMatch, matchTrack]);
  
  // Handle click (single select)
  const handleClick = useCallback((selectionKey: string, index: number) => {
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
    if (lastfmSelection.size === 0) return [];
    
    // Get selected tracks
    const selectedTracks = Array.from(lastfmSelection)
      .sort((a, b) => a - b)
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
      {/* Username input */}
      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="relative">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Last.fm username..."
            value={localUsername}
            onChange={(e) => setLocalUsername(e.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
        
        {/* Source selector */}
        <div className="flex gap-1">
          {SOURCE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={lastfmSource === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLastfmSource(opt.value)}
              className="flex-1 h-7 text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        
        {/* Period selector (only for Top) */}
        {lastfmSource === 'lastfm-top' && (
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={lastfmPeriod === opt.value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setLastfmPeriod(opt.value)}
                className="flex-1 h-6 text-xs px-1"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}
        
        {/* Results count and actions */}
        {debouncedUsername && totalResults > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {totalResults.toLocaleString()} tracks
              <span className={lastfmSelection.size > 0 ? 'ml-2 text-primary' : 'ml-2 invisible'}>
                ({lastfmSelection.size} selected)
              </span>
            </p>
            
            {/* Add selected to markers button - only when markers exist */}
            {hasAnyMarkers && (
              <AddSelectedToMarkersButton
                selectedCount={lastfmSelection.size}
                getTrackUris={getSelectedTrackUris}
                className="h-7 w-7"
              />
            )}
          </div>
        )}
      </div>
      
      {/* Results - scroll container is always rendered to keep virtualizer stable */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          ref={(el) => {
            (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            setScrollElement(el);
          }}
          className="h-full overflow-auto"
        >
          {isLoading && debouncedUsername ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-32 text-sm text-destructive px-4 text-center">
              <p>Failed to load tracks</p>
              <p className="text-xs mt-1 text-muted-foreground">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : !debouncedUsername ? (
            <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground px-4 text-center">
              <Radio className="h-8 w-8 mb-2 opacity-50" />
              <p>Enter a Last.fm username</p>
              <p className="text-xs mt-1">to browse their listening history</p>
            </div>
          ) : allTracks.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No tracks found for &quot;{debouncedUsername}&quot;
            </div>
          ) : (
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="relative w-full">
                <TableHeader
                  isEditable={false}
                  sortKey="position"
                  sortDirection="asc"
                  onSort={handleSort}
                  showLikedColumn={true}
                  showMatchStatusColumn={true}
                  showCustomAddColumn={hasAnyMarkers}
                  showScrobbleDateColumn={true}
                  showCumulativeTime={false}
                />
                <div
                  style={{
                    height: virtualizer.getTotalSize(),
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const track = allTracks[virtualRow.index];
                    if (!track) return null;
                    
                    const dto = track._lastfmDto;
                    const isMatched = track._isMatched;
                    
                    const key = makeMatchKeyFromDTO(dto);
                    const compositeId = makeCompositeId(LASTFM_PANEL_ID, key, dto.globalIndex);
                    const isSelected = lastfmSelection.has(virtualRow.index);
                    const liked = track.id ? isLiked(track.id) : false;
                    
                    // Get match status from cache
                    const cached = getCachedMatch(dto);
                    const matchStatus = cached?.status ?? 'idle';
                    const matchedSpotifyTrack = cached?.spotifyTrack;
                    
                    // Build optional props conditionally to satisfy exactOptionalPropertyTypes
                    const optionalProps = isMatched ? {
                      onToggleLiked: handleToggleLiked,
                      isPlaybackLoading: isTrackLoading(track.uri),
                      onPlay: playTrack,
                      onPause: pausePlayback,
                    } : {};
                    
                    // Render prefix columns (match status + custom add button when markers exist)
                    const renderPrefixColumns = () => (
                      <>
                        {/* Match status indicator */}
                        <div className="flex items-center justify-center">
                          <MatchStatusIndicator status={matchStatus} />
                        </div>
                        {/* Last.fm add to marked button (only when markers exist) */}
                        {hasAnyMarkers && (
                          <div className="flex items-center justify-center">
                            <LastfmAddToMarkedButton
                              lastfmTrack={dto}
                              trackName={track.name}
                            />
                          </div>
                        )}
                      </>
                    );
                    
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
                          isSelected={isSelected}
                          isEditable={false}
                          locked={false}
                          onSelect={handleSelect}
                          onClick={handleClick}
                          panelId={LASTFM_PANEL_ID}
                          dndMode="copy"
                          isDragSourceSelected={false}
                          showLikedColumn={true}
                          isLiked={liked}
                          isPlaying={isMatched && track.id ? isTrackPlaying(track.id) : false}
                          showMatchStatusColumn={true}
                          showCustomAddColumn={hasAnyMarkers}
                          renderPrefixColumns={renderPrefixColumns}
                          scrobbleTimestamp={dto.playedAt}
                          showScrobbleDateColumn={true}
                          showCumulativeTime={false}
                          dragType="lastfm-track"
                          matchedTrack={matchedSpotifyTrack ? {
                            id: matchedSpotifyTrack.id,
                            uri: matchedSpotifyTrack.uri,
                            name: matchedSpotifyTrack.name,
                            artist: matchedSpotifyTrack.artists[0],
                            durationMs: matchedSpotifyTrack.durationMs,
                          } : null}
                          lastfmDto={{
                            artistName: dto.artistName,
                            trackName: dto.trackName,
                            albumName: dto.albumName,
                          }}
                          {...optionalProps}
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
            </SortableContext>
          )}
        </div>
      </div>
    </div>
  );
}
