'use client';

import { useMemo, useCallback, useRef } from 'react';
import type React from 'react';
import { X } from 'lucide-react';
import { useSeedRecommendations } from '@features/playlists/hooks/useRecommendations';
import { useSavedTracksIndex } from '@features/playlists/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@features/player/hooks/useTrackPlayback';
import { useHydratedCompactMode } from '@features/split-editor/stores/useCompactModeStore';
import { useDeviceType } from '@shared/hooks/useDeviceType';
import { useCompareModeStore, getTrackCompareColor } from '@features/split-editor/stores/useCompareModeStore';
import { getCanonicalTrackKey } from '@/lib/music-provider/canonicalKey';
import { useContextMenuStore } from '@features/split-editor/stores/useContextMenuStore';
import {
  type RecommendationItem,
  RecommendationsExpandedPanel,
  usePanelWidth,
  useRecommendationsFilter,
  useRecommendationsSelection,
  isRecommendationsHeaderVisible,
  shouldShowRecommendationsContextMenu,
  getRecommendationsRowHeight,
  useRecommendationTrackUris,
  useRecommendationActions,
  renderNonExpandedRecommendationsState,
} from './recommendationsPanelHelpers';
import { TrackRow } from '../TrackRow';
import { makeCompositeId } from '@/lib/dnd/id';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Track } from '@/lib/music-provider/types';

export const RECS_PANEL_ID = 'recs-panel';
const EMPTY_RECOMMENDATIONS: RecommendationItem[] = [];

interface RecommendationsPanelProps {
  selectedTrackIds: string[];
  excludeTrackIds?: string[];
  playlistId?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  height?: number | undefined;
  onTrackDragStart?: (track: Track) => void;
}

export function RecommendationsPanel({
  selectedTrackIds,
  excludeTrackIds = [],
  playlistId,
  isExpanded,
  onToggleExpand,
  height: _height = 300,
}: RecommendationsPanelProps) {
  const isCompact = useHydratedCompactMode();
  const { isPhone } = useDeviceType();
  const { isLiked } = useSavedTracksIndex();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelWidth = usePanelWidth(containerRef);

  const isCompareEnabled = useCompareModeStore((state) => state.isEnabled);
  const compareDistribution = useCompareModeStore((state) => state.distribution);
  const getCompareColorForTrack = useCallback((trackUri: string) => {
    return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled);
  }, [compareDistribution, isCompareEnabled]);

  const showHeader = isRecommendationsHeaderVisible(isPhone, panelWidth);

  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((state) => state.closeMenu);
  const shouldShowContextMenu = shouldShowRecommendationsContextMenu(contextMenu, RECS_PANEL_ID);

  const {
    data,
    isLoading,
    isError,
    refetch: _refetch,
  } = useSeedRecommendations(
    selectedTrackIds,
    excludeTrackIds,
    playlistId,
    isExpanded && selectedTrackIds.length > 0,
    50
  );

  const allRecommendations = data?.recommendations ?? EMPTY_RECOMMENDATIONS;
  const isEnabled = data?.enabled ?? true;
  const {
    searchQuery,
    setSearchQuery,
    recommendations,
    filteredRecommendations,
    hasMore,
    scrollContainerRef,
    loadMoreTriggerRef,
  } = useRecommendationsFilter(allRecommendations);

  const trackUris = useRecommendationTrackUris(recommendations);
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({ trackUris });

  const { handleToggleLiked, handleDismiss } = useRecommendationActions(playlistId);
  const {
    recsSelection,
    onSelect: handleSelect,
    onClick: handleClick,
    getSelectedTracks,
  } = useRecommendationsSelection(recommendations);

  const rowHeight = getRecommendationsRowHeight(isCompact);
  const nonExpandedState = renderNonExpandedRecommendationsState({
    selectedTrackIds,
    isExpanded,
    onToggleExpand,
  });

  if (nonExpandedState) {
    return nonExpandedState;
  }

  const contentProps = {
    isEnabled,
    isLoading,
    isError,
    loadMoreTriggerRef,
    scrollContainerRef,
    rowHeight,
    isLiked,
    onToggleLiked: handleToggleLiked,
    onDismiss: handleDismiss,
    isTrackPlaying,
    isTrackLoading,
    onPlay: playTrack,
    onPause: pausePlayback,
    onSelect: handleSelect,
    onClick: handleClick,
    getCompareColorForTrack,
    recsSelection,
    getSelectedTracks,
  };

  return (
    <RecommendationsExpandedPanel
      containerRef={containerRef}
      showHeader={showHeader}
      onToggleExpand={onToggleExpand}
      recommendations={recommendations}
      filteredRecommendations={filteredRecommendations}
      hasMore={hasMore}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      contentProps={contentProps}
      contextMenu={contextMenu}
      shouldShowContextMenu={shouldShowContextMenu}
      closeContextMenu={closeContextMenu}
      RecommendationsList={RecommendationsList}
    />
  );
}

interface RecommendationsListProps {
  recommendations: RecommendationItem[];
  rowHeight: number;
  isLiked: (trackId: string) => boolean;
  onToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  onDismiss: (trackId: string) => void;
  isTrackPlaying: (trackId: string) => boolean;
  isTrackLoading: (uri: string) => boolean;
  onPlay: (trackUri: string) => void;
  onPause: () => void;
  onSelect: (_selectionKey: string, index: number, event: React.MouseEvent) => void;
  onClick: (_selectionKey: string, index: number) => void;
  getCompareColorForTrack: (trackUri: string) => string;
  recsSelection: number[];
  getSelectedTracks: () => Track[];
}

function RecommendationsList({
  recommendations,
  rowHeight,
  isLiked,
  onToggleLiked,
  onDismiss,
  isTrackPlaying,
  isTrackLoading,
  onPlay,
  onPause,
  onSelect,
  onClick,
  getCompareColorForTrack,
  recsSelection,
  getSelectedTracks,
}: RecommendationsListProps) {
  const tracks = useMemo(
    () => recommendations
      .filter((recommendation) => recommendation.track)
      .map((recommendation, idx) => ({
        ...recommendation.track!,
        position: idx,
        score: recommendation.score,
      })),
    [recommendations]
  );

  return (
    <div className="h-full overflow-auto">
      <div className="relative w-full">
        {tracks.map((track, index) => {
          const trackId = track.id || track.uri;
          const compositeId = makeCompositeId(RECS_PANEL_ID, trackId, index);
          const liked = track.id ? isLiked(track.id) : false;
          const isCurrentSelected = recsSelection.includes(index);
          const selectedTracksForDrag = isCurrentSelected && recsSelection.length > 0
            ? getSelectedTracks()
            : undefined;

          return (
            <div key={compositeId} style={{ height: rowHeight }} className="relative group">
              <TrackRow
                track={track}
                index={index}
                selectionKey={compositeId}
                isSelected={isCurrentSelected}
                isEditable={false}
                locked={false}
                onSelect={onSelect}
                onClick={onClick}
                panelId={RECS_PANEL_ID}
                dndMode="copy"
                isDragSourceSelected={false}
                showLikedColumn={true}
                isLiked={liked}
                onToggleLiked={onToggleLiked}
                isPlaying={track.id ? isTrackPlaying(track.id) : false}
                isPlaybackLoading={isTrackLoading(track.uri)}
                onPlay={onPlay}
                onPause={onPause}
                compareColor={getCompareColorForTrack(getCanonicalTrackKey(track))}
                isMultiSelect={recsSelection.length > 1}
                selectedCount={recsSelection.length}
                selectedTracks={selectedTracksForDrag}
              />
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  'text-muted-foreground hover:text-destructive'
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (track.id) {
                    onDismiss(track.id);
                  }
                }}
                title="Dismiss recommendation"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
