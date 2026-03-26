'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import type React from 'react';
import { Sparkles, Loader2, ChevronDown, Search } from 'lucide-react';
import { useDismissRecommendation } from '@features/playlists/hooks/useRecommendations';
import { useSavedTracksIndex } from '@features/playlists/hooks/useSavedTracksIndex';
import { useContextMenuStore } from '@features/split-editor/stores/useContextMenuStore';
import { EmptyStateCollapsed, EmptyStateExpanded, CollapsedPanel } from './RecommendationsPanelStates';
import { TrackContextMenu } from '../TrackContextMenu';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from '../constants';
import { matchesAllWords } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { Track } from '@/lib/music-provider/types';

export type RecommendationItem = { trackId: string; score: number; rank: number; track?: Track };

export interface ContentStateProps {
  isEnabled: boolean;
  isLoading: boolean;
  isError: boolean;
  recommendations: RecommendationItem[];
  hasMore: boolean;
  searchQuery: string;
  loadMoreTriggerRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
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

function ContentState({
  isEnabled,
  isLoading,
  isError,
  recommendations,
  hasMore,
  searchQuery,
  loadMoreTriggerRef,
  scrollContainerRef,
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
  RecommendationsList,
}: ContentStateProps & {
  RecommendationsList: React.ComponentType<{
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
  }>;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {!isEnabled ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          <div className="text-center p-4">
            <p>Recommendations are not enabled.</p>
            <p className="text-xs mt-1">Set RECS_ENABLED=true to enable.</p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-full text-sm text-destructive">
          Failed to load recommendations
        </div>
      ) : recommendations.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          <div className="text-center p-4">
            <p>{searchQuery ? 'No matches found.' : 'No recommendations found.'}</p>
            <p className="text-xs mt-1">
              {searchQuery ? 'Try a different search term.' : 'Add more playlists to build recommendation data.'}
            </p>
          </div>
        </div>
      ) : (
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
          <RecommendationsList
            recommendations={recommendations}
            rowHeight={rowHeight}
            isLiked={isLiked}
            onToggleLiked={onToggleLiked}
            onDismiss={onDismiss}
            isTrackPlaying={isTrackPlaying}
            isTrackLoading={isTrackLoading}
            onPlay={onPlay}
            onPause={onPause}
            onSelect={onSelect}
            onClick={onClick}
            getCompareColorForTrack={getCompareColorForTrack}
            recsSelection={recsSelection}
            getSelectedTracks={getSelectedTracks}
          />
          {hasMore && (
            <div
              ref={loadMoreTriggerRef}
              className="h-8 flex items-center justify-center text-xs text-muted-foreground"
            >
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Loading...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function usePanelWidth(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [panelWidth, setPanelWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPanelWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  return panelWidth;
}

export function useRecommendationsFilter(allRecommendations: RecommendationItem[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(20);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const filteredRecommendations = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return allRecommendations;
    }

    return allRecommendations.filter((recommendation) => {
      const track = recommendation.track;
      if (!track) {
        return false;
      }

      return (
        (track.name ? matchesAllWords(track.name, query) : false)
        || track.artists?.some((artist) => matchesAllWords(artist, query))
        || (track.album?.name ? matchesAllWords(track.album.name, query) : false)
      );
    });
  }, [allRecommendations, searchQuery]);

  const recommendations = useMemo(
    () => filteredRecommendations.slice(0, displayLimit),
    [filteredRecommendations, displayLimit]
  );

  const hasMore = filteredRecommendations.length > displayLimit;

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDisplayLimit((prev) => prev + 20);
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '100px',
        threshold: 0,
      }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore]);

  useEffect(() => {
    setDisplayLimit(20);
  }, [searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    recommendations,
    filteredRecommendations,
    hasMore,
    scrollContainerRef,
    loadMoreTriggerRef,
  };
}

export function useRecommendationsSelection(recommendations: RecommendationItem[]) {
  const [recsSelection, setRecsSelection] = useState<number[]>([]);

  const onSelect = useCallback((_selectionKey: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      setRecsSelection((prev) => {
        const selectionIndex = prev.indexOf(index);
        if (selectionIndex >= 0) {
          return prev.filter((value) => value !== index);
        }

        return [...prev, index];
      });
      return;
    }

    setRecsSelection([index]);
  }, []);

  const onClick = useCallback((_selectionKey: string, index: number) => {
    setRecsSelection([index]);
  }, []);

  const getSelectedTracks = useCallback((): Track[] => {
    return [...recsSelection]
      .sort((a, b) => a - b)
      .map((idx) => recommendations[idx]?.track)
      .filter((track): track is Track => track !== undefined);
  }, [recsSelection, recommendations]);

  return {
    recsSelection,
    onSelect,
    onClick,
    getSelectedTracks,
  };
}

export function RecommendationsExpandedPanel({
  containerRef,
  showHeader,
  onToggleExpand,
  recommendations,
  filteredRecommendations,
  hasMore,
  searchQuery,
  setSearchQuery,
  contentProps,
  contextMenu,
  shouldShowContextMenu,
  closeContextMenu,
  RecommendationsList,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  showHeader: boolean;
  onToggleExpand: () => void;
  recommendations: RecommendationItem[];
  filteredRecommendations: RecommendationItem[];
  hasMore: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  contentProps: Omit<ContentStateProps, 'recommendations' | 'hasMore' | 'searchQuery'>;
  contextMenu: ReturnType<typeof useContextMenuStore.getState>;
  shouldShowContextMenu: boolean;
  closeContextMenu: () => void;
  RecommendationsList: React.ComponentType<{
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
  }>;
}) {
  return (
    <div ref={containerRef} className="border-t border-border bg-background flex flex-col h-full">
      {showHeader ? (
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors flex-shrink-0"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Recommendations</span>
            {filteredRecommendations.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                ({recommendations.length}{hasMore ? `/${filteredRecommendations.length}` : ''} tracks)
              </span>
            ) : null}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      ) : null}

      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filter recommendations..."
            className="h-9 pl-9 text-sm"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      </div>

      <ContentState
        {...contentProps}
        recommendations={recommendations}
        hasMore={hasMore}
        searchQuery={searchQuery}
        RecommendationsList={RecommendationsList}
      />

      {shouldShowContextMenu && contextMenu.track ? (
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
      ) : null}
    </div>
  );
}

export function isRecommendationsHeaderVisible(isPhone: boolean, panelWidth: number): boolean {
  return !isPhone && panelWidth >= 400;
}

export function shouldShowRecommendationsContextMenu(
  contextMenu: ReturnType<typeof useContextMenuStore.getState>,
  panelId: string
): boolean {
  return contextMenu.isOpen && contextMenu.panelId === panelId;
}

export function getRecommendationsRowHeight(isCompact: boolean): number {
  return isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
}

export function useRecommendationTrackUris(recommendations: RecommendationItem[]) {
  return useMemo(
    () => recommendations
      .map((recommendation) => recommendation.track?.uri)
      .filter((uri): uri is string => Boolean(uri)),
    [recommendations]
  );
}

export function useRecommendationActions(playlistId: string | undefined) {
  const { toggleLiked } = useSavedTracksIndex();
  const dismissMutation = useDismissRecommendation();

  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);

  const handleDismiss = useCallback((trackId: string) => {
    dismissMutation.mutate({ trackId, contextId: playlistId });
  }, [dismissMutation, playlistId]);

  return {
    handleToggleLiked,
    handleDismiss,
  };
}

export function renderNonExpandedRecommendationsState({
  selectedTrackIds,
  isExpanded,
  onToggleExpand,
}: {
  selectedTrackIds: string[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  if (selectedTrackIds.length === 0) {
    if (!isExpanded) {
      return <EmptyStateCollapsed onToggleExpand={onToggleExpand} />;
    }

    return <EmptyStateExpanded onToggleExpand={onToggleExpand} />;
  }

  if (!isExpanded) {
    return <CollapsedPanel selectedTrackIds={selectedTrackIds} onToggleExpand={onToggleExpand} />;
  }

  return null;
}