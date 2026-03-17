/**
 * RecommendationsPanel - displays AI-powered track recommendations
 * based on selected tracks in the split editor.
 * 
 * Shown at the bottom of the BrowsePanel when tracks are selected.
 */

'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import type React from 'react';
import { Sparkles, X, Loader2, ChevronDown, Search } from 'lucide-react';
import { useSeedRecommendations, useDismissRecommendation } from '@/hooks/useRecommendations';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useCompareModeStore, getTrackCompareColor } from '@/hooks/useCompareModeStore';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { EmptyStateCollapsed, EmptyStateExpanded, CollapsedPanel } from './RecommendationsPanelStates';
import { TrackRow } from '../TrackRow';
import { TrackContextMenu } from '../TrackContextMenu';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from '../constants';
import { makeCompositeId } from '@/lib/dnd/id';
import { cn, matchesAllWords } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Track } from '@/lib/music-provider/types';

/** Virtual panel ID for recommendations (used in DnD composite IDs) */
export const RECS_PANEL_ID = 'recs-panel';
type RecommendationItem = { trackId: string; score: number; rank: number; track?: Track };
const EMPTY_RECOMMENDATIONS: RecommendationItem[] = [];

interface RecommendationsPanelProps {
  /** Selected track IDs from split panels */
  selectedTrackIds: string[];
  /** Track IDs to exclude from recommendations (e.g., playlist tracks) */
  excludeTrackIds?: string[];
  /** Optional playlist context for dismissals */
  playlistId?: string;
  /** Whether the panel is expanded */
  isExpanded: boolean;
  /** Toggle panel expansion */
  onToggleExpand: () => void;
  /** Panel height when expanded (optional, defaults to 300) */
  height?: number | undefined;
  /** Callback when a track is dragged from recommendations */
  onTrackDragStart?: (track: Track) => void;
}

interface ContentStateProps {
  isEnabled: boolean;
  isLoading: boolean;
  isError: boolean;
  recommendations: Array<{ trackId: string; score: number; rank: number; track?: Track }>;
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
}: ContentStateProps) {
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

function usePanelWidth(containerRef: React.RefObject<HTMLDivElement | null>) {
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

function useRecommendationsFilter(allRecommendations: RecommendationItem[]) {
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

function useRecommendationsSelection(
  recommendations: RecommendationItem[]
) {
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

function RecommendationsExpandedPanel({
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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter recommendations..."
            className="h-9 pl-9 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <ContentState
        {...contentProps}
        recommendations={recommendations}
        hasMore={hasMore}
        searchQuery={searchQuery}
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

function isRecommendationsHeaderVisible(isPhone: boolean, panelWidth: number): boolean {
  return !isPhone && panelWidth >= 400;
}

function shouldShowRecommendationsContextMenu(contextMenu: ReturnType<typeof useContextMenuStore.getState>): boolean {
  return contextMenu.isOpen && contextMenu.panelId === RECS_PANEL_ID;
}

function getRecommendationsRowHeight(isCompact: boolean): number {
  return isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
}

function useRecommendationTrackUris(
  recommendations: Array<{ trackId: string; score: number; rank: number; track?: Track }>
) {
  return useMemo(
    () => recommendations
      .map((recommendation) => recommendation.track?.uri)
      .filter((uri): uri is string => Boolean(uri)),
    [recommendations]
  );
}

function useRecommendationActions(playlistId: string | undefined) {
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

function renderNonExpandedRecommendationsState({
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
  
  // Compare mode: get distribution for coloring (recs panel not included in calculation)
  const isCompareEnabled = useCompareModeStore((s) => s.isEnabled);

  // Hide header on narrow panels (< 400px) or on mobile
  const showHeader = isRecommendationsHeaderVisible(isPhone, panelWidth);
  const compareDistribution = useCompareModeStore((s) => s.distribution);
  const getCompareColorForTrack = useCallback((trackUri: string) => {
    return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled);
  }, [compareDistribution, isCompareEnabled]);
  
  // Context menu store
  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);
  const shouldShowContextMenu = shouldShowRecommendationsContextMenu(contextMenu);

  // Fetch recommendations based on selected tracks (fetch more than we display for filtering)
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
    50 // Fetch up to 50 for filtering headroom
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

  // Extract tracks for playback
  const trackUris = useRecommendationTrackUris(recommendations);

  // Playback integration
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
  });

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

  const contentProps: Omit<ContentStateProps, 'recommendations' | 'hasMore' | 'searchQuery'> = {
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
    />
  );
}

interface RecommendationsListProps {
  recommendations: Array<{ trackId: string; score: number; rank: number; track?: Track }>;
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
  // Convert to Track[] for the list
  const tracks = useMemo(() => 
    recommendations
      .filter(r => r.track)
      .map((r, idx) => ({
        ...r.track!,
        position: idx,
        score: r.score,
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
          
          // Get selected tracks if current track is in selection
          const isCurrentSelected = recsSelection.includes(index);
          const selectedTracksForDrag = isCurrentSelected && recsSelection.length > 0 
            ? getSelectedTracks() 
            : undefined;

          return (
            <div 
              key={compositeId}
              style={{ height: rowHeight }}
              className="relative group"
            >
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
                compareColor={getCompareColorForTrack(track.uri)}
                isMultiSelect={recsSelection.length > 1}
                selectedCount={recsSelection.length}
                selectedTracks={selectedTracksForDrag}
              />
              {/* Dismiss button overlay */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  "text-muted-foreground hover:text-destructive"
                )}
                onClick={(e) => {
                  e.stopPropagation();
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
