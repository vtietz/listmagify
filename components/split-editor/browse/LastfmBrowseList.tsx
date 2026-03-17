/**
 * LastfmBrowseList - Virtualized list of Last.fm tracks with matching status
 */

'use client';
'use no memo';

import { useRef, useEffect, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2, Radio } from 'lucide-react';
import { TrackRow } from '../TrackRow';
import { TrackContextMenu } from '../TrackContextMenu';
import { TableHeader } from '../TableHeader';
import { LastfmAddToMarkedButton } from './LastfmAddToMarkedButton';
import { MatchStatusIndicator } from './MatchStatusIndicator';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from '../constants';
import { makeCompositeId } from '@/lib/dnd/id';
import { makeMatchKeyFromDTO } from '@/hooks/useLastfmMatchCache';
import { LASTFM_PANEL_ID } from './LastfmBrowseTab';
import type { LastfmTrack, IndexedTrackDTO } from '@/hooks/useLastfmTracks';
import type { Track } from '@/lib/music-provider/types';

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

type ListViewState = 'loading' | 'error' | 'missing-username' | 'empty-results' | 'ready';

function resolveListViewState(params: {
  isLoading: boolean;
  debouncedUsername: string;
  isError: boolean;
  allTracksLength: number;
}): ListViewState {
  if (params.isLoading && params.debouncedUsername) {
    return 'loading';
  }

  if (params.isError) {
    return 'error';
  }

  if (!params.debouncedUsername) {
    return 'missing-username';
  }

  if (params.allTracksLength === 0) {
    return 'empty-results';
  }

  return 'ready';
}

function renderListViewState(params: {
  state: ListViewState;
  debouncedUsername: string;
  error: unknown;
}): React.ReactNode {
  switch (params.state) {
    case 'loading':
      return (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    case 'error':
      return (
        <div className="flex flex-col items-center justify-center h-32 text-sm text-destructive px-4 text-center">
          <p>Failed to load tracks</p>
          <p className="text-xs mt-1 text-muted-foreground">
            {params.error instanceof Error ? params.error.message : 'Unknown error'}
          </p>
        </div>
      );
    case 'missing-username':
      return (
        <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground px-4 text-center">
          <Radio className="h-8 w-8 mb-2 opacity-50" />
          <p>Enter a Last.fm username</p>
          <p className="text-xs mt-1">to browse their listening history</p>
        </div>
      );
    case 'empty-results':
      return (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No tracks found for &quot;{params.debouncedUsername}&quot;
        </div>
      );
    default:
      return null;
  }
}

function buildMatchedTrackPayload(matchedTrack: any) {
  if (!matchedTrack) {
    return null;
  }

  return {
    id: matchedTrack.id,
    uri: matchedTrack.uri,
    name: matchedTrack.name,
    artist: matchedTrack.artists[0],
    durationMs: matchedTrack.durationMs,
  };
}

function getTrackRowOptionalProps(params: {
  isMatched: boolean;
  track: LastfmTrack;
  isTrackLoading: (trackUri: string) => boolean;
  handleToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  playTrack: (trackUri: string) => void;
  pausePlayback: () => void;
  isSelected: boolean;
  selectedMatchedUris: string[];
  selectedTracks: Track[];
}) {
  const optionalProps: Record<string, unknown> = {};

  if (params.isMatched) {
    optionalProps.onToggleLiked = params.handleToggleLiked;
    optionalProps.isPlaybackLoading = params.isTrackLoading(params.track.uri);
    optionalProps.onPlay = params.playTrack;
    optionalProps.onPause = params.pausePlayback;
  }

  if (params.isSelected && params.selectedMatchedUris.length > 0) {
    optionalProps.selectedMatchedUris = params.selectedMatchedUris;
  }

  if (params.isSelected && params.selectedTracks.length > 0) {
    optionalProps.selectedTracks = params.selectedTracks;
  }

  return optionalProps;
}

function buildContextMenuOptionalProps(contextMenu: LastfmBrowseListProps['contextMenu']) {
  const props: {
    position?: { x: number; y: number };
    markerActions?: any;
    trackActions?: any;
  } = {};

  if (contextMenu.position) {
    props.position = contextMenu.position;
  }

  if (contextMenu.markerActions) {
    props.markerActions = contextMenu.markerActions;
  }

  if (contextMenu.trackActions) {
    props.trackActions = contextMenu.trackActions;
  }

  return props;
}

function renderVirtualRow(params: {
  virtualRow: ReturnType<ReturnType<typeof useVirtualizer>['getVirtualItems']>[number];
  allTracks: LastfmTrack[];
  lastfmSelection: number[];
  isLiked: (trackId: string) => boolean;
  getCachedMatch: (dto: IndexedTrackDTO) => any;
  matchTrack: (dto: IndexedTrackDTO) => void;
  hasAnyMarkers: boolean;
  handleSelect: (selectionKey: string, index: number, event: React.MouseEvent) => void;
  handleClick: (selectionKey: string, index: number) => void;
  isTrackPlaying: (trackId: string | null) => boolean;
  isTrackLoading: (trackUri: string) => boolean;
  playTrack: (trackUri: string) => void;
  pausePlayback: () => void;
  handleToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  getCompareColorForTrack: (trackUri: string) => string | undefined;
  selectedMatchedUris: string[];
  selectedTracks: Track[];
}): React.ReactNode {
  const track = params.allTracks[params.virtualRow.index];
  if (!track) {
    return null;
  }

  const dto = track._lastfmDto;
  const isMatched = track._isMatched;
  const key = makeMatchKeyFromDTO(dto);
  const compositeId = makeCompositeId(LASTFM_PANEL_ID, key, dto.globalIndex);
  const isSelected = params.lastfmSelection.includes(params.virtualRow.index);
  const liked = track.id ? params.isLiked(track.id) : false;
  const cached = params.getCachedMatch(dto);
  const matchStatus = cached?.status ?? 'idle';
  const matchedTrack = cached?.matchedTrack ?? cached?.spotifyTrack;

  const handleDragStart = () => {
    if (!cached || cached.status === 'idle') {
      params.matchTrack(dto);
    }
  };

  const optionalProps = getTrackRowOptionalProps({
    isMatched,
    track,
    isTrackLoading: params.isTrackLoading,
    handleToggleLiked: params.handleToggleLiked,
    playTrack: params.playTrack,
    pausePlayback: params.pausePlayback,
    isSelected,
    selectedMatchedUris: params.selectedMatchedUris,
    selectedTracks: params.selectedTracks,
  });

  const renderPrefixColumns = () => (
    <>
      <div className="flex items-center justify-center">
        <MatchStatusIndicator status={matchStatus} />
      </div>
      {params.hasAnyMarkers && (
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
        transform: `translateY(${params.virtualRow.start}px)`,
      }}
    >
      <TrackRow
        track={track}
        index={params.virtualRow.index}
        selectionKey={compositeId}
        isSelected={isSelected}
        isEditable={false}
        locked={false}
        onSelect={params.handleSelect}
        onClick={params.handleClick}
        panelId={LASTFM_PANEL_ID}
        dndMode="copy"
        isDragSourceSelected={false}
        showLikedColumn={true}
        isLiked={liked}
        isPlaying={isMatched && track.id ? params.isTrackPlaying(track.id) : false}
        showMatchStatusColumn={true}
        showCustomAddColumn={params.hasAnyMarkers}
        renderPrefixColumns={renderPrefixColumns}
        scrobbleTimestamp={dto.playedAt}
        showScrobbleDateColumn={true}
        showCumulativeTime={false}
        dragType="lastfm-track"
        matchedTrack={buildMatchedTrackPayload(matchedTrack)}
        lastfmDto={{
          artistName: dto.artistName,
          trackName: dto.trackName,
          albumName: dto.albumName,
        }}
        onDragStart={handleDragStart}
        compareColor={matchedTrack?.uri ? params.getCompareColorForTrack(matchedTrack.uri) : undefined}
        isMultiSelect={params.lastfmSelection.length > 1}
        selectedCount={params.lastfmSelection.length}
        {...optionalProps}
      />
    </div>
  );
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
  const viewState = resolveListViewState({
    isLoading,
    debouncedUsername,
    isError,
    allTracksLength: allTracks.length,
  });

  if (viewState !== 'ready') {
    return renderListViewState({
      state: viewState,
      debouncedUsername,
      error,
    });
  }

  const contextMenuOptionalProps = buildContextMenuOptionalProps(contextMenu);
  
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
              return renderVirtualRow({
                virtualRow,
                allTracks,
                lastfmSelection,
                isLiked,
                getCachedMatch,
                matchTrack,
                hasAnyMarkers,
                handleSelect,
                handleClick,
                isTrackPlaying,
                isTrackLoading,
                playTrack,
                pausePlayback,
                handleToggleLiked,
                getCompareColorForTrack,
                selectedMatchedUris,
                selectedTracks,
              });
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
          {...contextMenuOptionalProps}
          isMultiSelect={contextMenu.isMultiSelect}
          selectedCount={contextMenu.selectedCount}
          isEditable={false}
        />
      )}
    </>
  );
}
