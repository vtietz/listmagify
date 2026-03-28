'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Search, X, Loader2 } from 'lucide-react';
import { useDebouncedValue } from '@shared/hooks/useDebouncedValue';
import { useContextMenuStore } from '@features/split-editor/stores/useContextMenuStore';
import { useAuthSummary } from '@features/auth/hooks/useAuth';
import { useAvailableProviders } from '@shared/hooks/useAvailableProviders';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProviderStatusDropdown } from '@/components/auth/ProviderStatusDropdown';
import { TrackRow } from '@/components/split-editor/TrackRow';
import { TrackContextMenu } from '@/components/split-editor/TrackContextMenu';
import { TableHeader } from '@features/split-editor/playlist/ui/TableHeader';
import { AddSelectedToMarkersButton } from '@/components/split-editor/playlist/AddSelectedToMarkersButton';
import { makeCompositeId } from '@/lib/dnd/id';
import type { TrackPayload } from '@features/dnd/model/types';
import type { SortKey, SortDirection } from '@features/split-editor/playlist/hooks/usePlaylistSort';
import type { Track, MusicProviderId } from '@/lib/music-provider/types';

export function useSearchQueryState(
  searchQuery: string,
  setSearchQuery: (query: string) => void,
  clearSpotifySelection: () => void,
  providerId: MusicProviderId
) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debouncedQuery = useDebouncedValue(localQuery, 300);

  // Reset localQuery when provider changes or store query changes externally
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery, providerId]);

  useEffect(() => {
    setSearchQuery(debouncedQuery);
    clearSpotifySelection();
  }, [debouncedQuery, setSearchQuery, clearSpotifySelection]);

  return { localQuery, setLocalQuery, debouncedQuery };
}

export function useFocusWhenActive(isActive: boolean, inputRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (!isActive || !inputRef.current) {
      return;
    }

    const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeoutId);
  }, [isActive, inputRef]);
}

export function useSearchSortState() {
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

  return { sortKey, sortDirection, handleSort };
}

export function useLoadNextSearchPageOnScroll({
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

export function SearchInputBar({
  inputRef,
  localQuery,
  onChange,
  onClear,
  hasAnyMarkers,
  selectedCount,
  getTrackUris,
  getTrackPayloads,
  providerId,
  onProviderChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  localQuery: string;
  onChange: (value: string) => void;
  onClear: () => void;
  hasAnyMarkers: boolean;
  selectedCount: number;
  getTrackUris: () => string[];
  getTrackPayloads: () => TrackPayload[];
  providerId: MusicProviderId;
  onProviderChange: (id: MusicProviderId) => void;
}) {
  const availableProviders = useAvailableProviders();
  const authSummary = useAuthSummary();

  const statusMap = useMemo(() => ({
    spotify: authSummary.spotify.code === 'ok' ? 'connected' : 'disconnected',
    tidal: authSummary.tidal.code === 'ok' ? 'connected' : 'disconnected',
  } satisfies Record<MusicProviderId, 'connected' | 'disconnected'>), [authSummary.spotify.code, authSummary.tidal.code]);

  return (
    <div className="px-3 py-2 border-b border-border">
      <div className="relative flex items-center gap-1.5">
        <ProviderStatusDropdown
          context="panel"
          currentProviderId={providerId}
          providers={availableProviders}
          statusMap={statusMap}
          hideWhenSingleConnected={false}
          triggerRole="combobox"
          triggerAriaLabel="Search provider"
          onProviderChange={onProviderChange}
          data-testid="browse-provider-status-dropdown"
        />
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search tracks, artists, albums..."
            value={localQuery}
            onChange={(event) => onChange(event.target.value)}
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
            getTrackPayloads={getTrackPayloads}
            sourceProviderId={providerId}
            className="h-9 w-9 shrink-0"
          />
        ) : null}
      </div>
    </div>
  );
}

export function SearchResultsState({
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

export function SearchTracksVirtualList({
  panelId,
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
  providerId,
  hasAnyMarkers,
  onAddTrackToAllMarkers,
}: {
  panelId: string;
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
  providerId: MusicProviderId;
  hasAnyMarkers: boolean;
  onAddTrackToAllMarkers?: (track: Track) => void;
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
            providerId={providerId}
          />
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const track = sortedTracks[virtualRow.index];
              if (!track) {
                return null;
              }

              const trackId = track.id || track.uri;
              const position = track.position ?? virtualRow.index;
              const compositeId = makeCompositeId(panelId, trackId, position);
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
                    panelId={panelId}
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
                    {...(hasAnyMarkers && onAddTrackToAllMarkers ? {
                      markerActions: {
                        hasAnyMarkers: true,
                        onAddToAllMarkers: () => onAddTrackToAllMarkers(track),
                      },
                    } : {})}
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

export function SearchPanelContextMenu({
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