'use client';
'use no memo';

import { useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, Loader2, Music, Disc3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBrowsePanelStore, type DrillDownTarget } from '@/hooks/useBrowsePanelStore';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useCompareModeStore, getTrackCompareColor } from '@/hooks/useCompareModeStore';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { usePlaylistSort } from '@/hooks/usePlaylistSort';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { apiFetch } from '@/lib/api/client';
import { SearchTracksVirtualList, SearchPanelContextMenu, useSearchSortState } from './searchPanelHelpers';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from '../constants';
import { makeCompositeId } from '@/lib/dnd/id';
import type { Track, MusicProviderId } from '@/lib/music-provider/types';

const DRILLDOWN_PANEL_ID = 'drilldown-panel';

interface DrillDownTrackListProps {
  drillDown: DrillDownTarget;
  providerId: MusicProviderId;
}

export function DrillDownTrackList({ drillDown, providerId }: DrillDownTrackListProps) {
  const {
    clearDrillDown,
    spotifySelection,
    toggleSpotifySelection,
    clearSpotifySelection,
  } = useBrowsePanelStore();

  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const isCompact = useHydratedCompactMode();

  const isCompareEnabled = useCompareModeStore((state) => state.isEnabled);
  const compareDistribution = useCompareModeStore((state) => state.distribution);
  const getCompareColorForTrack = useCallback((trackUri: string) => {
    return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled);
  }, [compareDistribution, isCompareEnabled]);

  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((state) => state.closeMenu);
  const shouldShowContextMenu = contextMenu.isOpen && contextMenu.panelId === DRILLDOWN_PANEL_ID;

  const scrollRef = useRef<HTMLDivElement>(null);
  const { sortKey, sortDirection, handleSort } = useSearchSortState();

  const apiPath = drillDown.type === 'artist'
    ? `/api/artists/${encodeURIComponent(drillDown.id)}/tracks?provider=${providerId}`
    : `/api/albums/${encodeURIComponent(drillDown.id)}/tracks?provider=${providerId}`;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['browse-drilldown-tracks', providerId, drillDown.type, drillDown.id],
    queryFn: () => apiFetch<{ tracks: Track[] }>(apiPath),
    staleTime: 5 * 60 * 1000,
  });

  const allTracks = useMemo(() => {
    if (!data?.tracks) return [] as (Track & { position: number })[];
    return data.tracks.map((track: Track, idx: number) => ({ ...track, position: idx }));
  }, [data?.tracks]);

  const sortedTracks = usePlaylistSort({ tracks: allTracks, sortKey, sortDirection });

  const sortableIds = useMemo(() => {
    return sortedTracks.map((track, idx) =>
      makeCompositeId(DRILLDOWN_PANEL_ID, track.id || track.uri, track.position ?? idx)
    );
  }, [sortedTracks]);

  const trackUris = useMemo(() => sortedTracks.map((t) => t.uri), [sortedTracks]);
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
    sourceId: DRILLDOWN_PANEL_ID,
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

  const getSelectedTracks = useCallback((): Track[] => {
    return Array.from(spotifySelection)
      .sort((a, b) => a - b)
      .map((idx) => sortedTracks[idx])
      .filter((track): track is Track => track !== undefined);
  }, [spotifySelection, sortedTracks]);

  const Icon = drillDown.type === 'artist' ? Music : Disc3;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-2 py-1.5 border-b border-border flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={clearDrillDown}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {drillDown.image ? (
            <img src={drillDown.image.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{drillDown.name}</div>
          <div className="text-xs text-muted-foreground">
            {drillDown.type === 'artist' ? 'Top tracks' : 'Album tracks'}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-32 text-sm text-destructive">Failed to load tracks.</div>
        ) : sortedTracks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">No tracks found</div>
        ) : (
          <SearchTracksVirtualList
            panelId={DRILLDOWN_PANEL_ID}
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
            isFetchingNextPage={false}
          />
        )}

        <SearchPanelContextMenu
          shouldShow={shouldShowContextMenu}
          contextMenu={contextMenu}
          onClose={closeContextMenu}
        />
      </div>
    </div>
  );
}
