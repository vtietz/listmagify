/**
 * LastfmBrowseList - Virtualized list of Last.fm tracks with matching status
 */

'use client';
'use no memo';

import { useRef, useEffect, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2, Radio } from 'lucide-react';
import { TrackRow } from './TrackRow';
import { TrackContextMenu } from './TrackContextMenu';
import { TableHeader } from './TableHeader';
import { LastfmAddToMarkedButton } from './LastfmAddToMarkedButton';
import { MatchStatusIndicator } from './MatchStatusIndicator';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from './constants';
import { makeCompositeId } from '@/lib/dnd/id';
import { makeMatchKeyFromDTO } from '@/hooks/useLastfmMatchCache';
import { LASTFM_PANEL_ID } from './LastfmBrowseTab';
import type { LastfmTrack, IndexedTrackDTO } from '@/hooks/useLastfmTracks';
import type { Track } from '@/lib/spotify/types';

interface LastfmBrowseListProps {
  allTracks: LastfmTrack[];
  sortableIds: string[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  debouncedUsername: string;
  isFetchingNextPage: boolean;
  lastfmSelection: number[];
  isCompact: boolean;
  hasAnyMarkers: boolean;
  selectedMatchedUris: string[];
  selectedTracks: Track[];
  isLiked: (trackId: string) => boolean;
  getCachedMatch: (dto: IndexedTrackDTO) => any;
  matchTrack: (dto: IndexedTrackDTO) => void;
  isTrackPlaying: (trackId: string | null) => boolean;
  isTrackLoading: (trackUri: string) => boolean;
  playTrack: (trackUri: string) => Promise<void>;
  pausePlayback: () => Promise<void>;
  handleToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  handleSelect: (selectionKey: string, index: number, event: React.MouseEvent) => void;
  handleClick: (selectionKey: string, index: number) => void;
  handleSort: () => void;
  getCompareColorForTrack: (trackUri: string) => string | undefined;
  contextMenu: {
    isOpen: boolean;
    panelId: string | null;
    track: Track | null;
    position: { x: number; y: number } | null;
    markerActions?: any;
    trackActions?: any;
    isMultiSelect: boolean;
    selectedCount: number;
  };
  closeContextMenu: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function LastfmBrowseList({
  allTracks,
  sortableIds,
  isLoading,
  isError,
  error,
  debouncedUsername,
  isFetchingNextPage,
  lastfmSelection,
  isCompact,
  hasAnyMarkers,
  selectedMatchedUris,
  selectedTracks,
  isLiked,
  getCachedMatch,
  matchTrack,
  isTrackPlaying,
  isTrackLoading,
  playTrack,
  pausePlayback,
  handleToggleLiked,
  handleSelect,
  handleClick,
  handleSort,
  getCompareColorForTrack,
  contextMenu,
  closeContextMenu,
  scrollRef,
}: LastfmBrowseListProps) {
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
  const deferredCount = useDeferredValue(allTracks.length);
  
  const virtualizer = useVirtualizer({
    count: deferredCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: VIRTUALIZATION_OVERSCAN,
  });
  
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  
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
  
  const shouldShowContextMenu = contextMenu.isOpen && contextMenu.panelId === LASTFM_PANEL_ID;
  
  // Empty states
  if (isLoading && debouncedUsername) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-sm text-destructive px-4 text-center">
        <p>Failed to load tracks</p>
        <p className="text-xs mt-1 text-muted-foreground">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }
  
  if (!debouncedUsername) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground px-4 text-center">
        <Radio className="h-8 w-8 mb-2 opacity-50" />
        <p>Enter a Last.fm username</p>
        <p className="text-xs mt-1">to browse their listening history</p>
      </div>
    );
  }
  
  if (allTracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No tracks found for &quot;{debouncedUsername}&quot;
      </div>
    );
  }
  
  return (
    <>
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
              const isSelected = lastfmSelection.includes(virtualRow.index);
              const liked = track.id ? isLiked(track.id) : false;
              
              const cached = getCachedMatch(dto);
              const matchStatus = cached?.status ?? 'idle';
              const matchedSpotifyTrack = cached?.spotifyTrack;
              
              const handleDragStart = () => {
                if (!cached || cached.status === 'idle') {
                  matchTrack(dto);
                }
              };
              
              const optionalProps = isMatched ? {
                onToggleLiked: handleToggleLiked,
                isPlaybackLoading: isTrackLoading(track.uri),
                onPlay: playTrack,
                onPause: pausePlayback,
              } : {};
              
              const renderPrefixColumns = () => (
                <>
                  <div className="flex items-center justify-center">
                    <MatchStatusIndicator status={matchStatus} />
                  </div>
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
                    onDragStart={handleDragStart}
                    compareColor={matchedSpotifyTrack?.uri ? getCompareColorForTrack(matchedSpotifyTrack.uri) : undefined}
                    isMultiSelect={lastfmSelection.length > 1}
                    selectedCount={lastfmSelection.length}
                    {...(isSelected && selectedMatchedUris.length > 0 
                      ? { selectedMatchedUris } 
                      : {})}
                    {...(isSelected && selectedTracks.length > 0
                      ? { selectedTracks }
                      : {})}
                    {...optionalProps}
                  />
                </div>
              );
            })}
          </div>
        </div>
        
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </SortableContext>
      
      {shouldShowContextMenu && contextMenu.track && (
        <TrackContextMenu
          track={contextMenu.track}
          isOpen={true}
          onClose={closeContextMenu}
          {...(contextMenu.position ? { position: contextMenu.position } : {})}
          {...(contextMenu.markerActions ? { markerActions: contextMenu.markerActions } : {})}
          {...(contextMenu.trackActions ? { trackActions: contextMenu.trackActions } : {})}
          isMultiSelect={contextMenu.isMultiSelect}
          selectedCount={contextMenu.selectedCount}
          isEditable={false}
        />
      )}
    </>
  );
}
