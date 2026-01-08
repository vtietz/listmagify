/**
 * RecommendationsPanel - displays AI-powered track recommendations
 * based on selected tracks in the split editor.
 * 
 * Shown at the bottom of the BrowsePanel when tracks are selected.
 */

'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { useSeedRecommendations, useDismissRecommendation } from '@/hooks/useRecommendations';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useCompareModeStore, getTrackCompareColor } from '@/hooks/useCompareModeStore';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { TrackRow } from './TrackRow';
import { TrackContextMenu } from './TrackContextMenu';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from './constants';
import { makeCompositeId } from '@/lib/dnd/id';
import { cn, matchesAllWords } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Track } from '@/lib/spotify/types';

/** Virtual panel ID for recommendations (used in DnD composite IDs) */
export const RECS_PANEL_ID = 'recs-panel';

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

export function RecommendationsPanel({
  selectedTrackIds,
  excludeTrackIds = [],
  playlistId,
  isExpanded,
  onToggleExpand,
  height = 300,
}: RecommendationsPanelProps) {
  const isCompact = useHydratedCompactMode();
  const { isPhone } = useDeviceType();
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const dismissMutation = useDismissRecommendation();
  const [panelWidth, setPanelWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Compare mode: get distribution for coloring (recs panel not included in calculation)
  const isCompareEnabled = useCompareModeStore((s) => s.isEnabled);
  
  // Track panel width for responsive header
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPanelWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  
  // Hide header on narrow panels (< 400px) or on mobile
  const showHeader = !isPhone && panelWidth >= 400;
  const compareDistribution = useCompareModeStore((s) => s.distribution);
  const getCompareColorForTrack = useCallback((trackUri: string) => {
    return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled);
  }, [compareDistribution, isCompareEnabled]);
  
  // Context menu store
  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);
  const shouldShowContextMenu = contextMenu.isOpen && contextMenu.panelId === RECS_PANEL_ID;
  
  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Load more state - start with 20, increment by 20
  const [displayLimit, setDisplayLimit] = useState(20);

  // Fetch recommendations based on selected tracks (fetch more than we display for filtering)
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useSeedRecommendations(
    selectedTrackIds,
    excludeTrackIds,
    playlistId,
    isExpanded && selectedTrackIds.length > 0,
    50 // Fetch up to 50 for filtering headroom
  );

  const allRecommendations = data?.recommendations ?? [];
  const isEnabled = data?.enabled ?? true;
  
  // Filter recommendations by search query (words can match in any order)
  const filteredRecommendations = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return allRecommendations;
    return allRecommendations.filter((r: { track?: Track }) => {
      const track = r.track;
      if (!track) return false;
      return (
        (track.name ? matchesAllWords(track.name, query) : false) ||
        track.artists?.some(a => matchesAllWords(a, query)) ||
        (track.album?.name ? matchesAllWords(track.album.name, query) : false)
      );
    });
  }, [allRecommendations, searchQuery]);
  
  // Apply display limit for "load more" functionality
  const recommendations = useMemo(() => 
    filteredRecommendations.slice(0, displayLimit),
    [filteredRecommendations, displayLimit]
  );
  
  const hasMore = filteredRecommendations.length > displayLimit;
  
  // Scroll container ref for infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  
  // Infinite scroll: load more when trigger element is visible
  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger || !hasMore) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDisplayLimit(prev => prev + 20);
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '100px', // Load 100px before reaching the end
        threshold: 0,
      }
    );
    
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore]);
  
  // Reset display limit when search changes
  useEffect(() => {
    setDisplayLimit(20);
  }, [searchQuery]);

  // Extract tracks for playback
  const trackUris = useMemo((): string[] => 
    recommendations
      .map((r: { trackId: string; score: number; rank: number; track?: Track }) => r.track?.uri)
      .filter((uri: string | undefined): uri is string => !!uri),
    [recommendations]
  );

  // Playback integration
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
  });

  // Handle liked toggle
  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);

  // Handle dismiss
  const handleDismiss = useCallback((trackId: string) => {
    dismissMutation.mutate({ trackId, contextId: playlistId });
  }, [dismissMutation, playlistId]);

  // Dummy selection handlers (recommendations don't support multi-select)
  const handleSelect = useCallback(() => {}, []);
  const handleClick = useCallback(() => {}, []);

  // Dynamic row height
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;

  // Show message when no tracks selected
  if (selectedTrackIds.length === 0) {
    if (!isExpanded) {
      return (
        <div 
          className="border-t border-border bg-muted/50 px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
          onClick={onToggleExpand}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Select tracks to get recommendations</span>
            </div>
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      );
    }
    
    return (
      <div className="border-t border-border bg-background flex flex-col h-full">
        <div 
          className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors flex-shrink-0"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Recommendations</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          <div className="text-center p-4">
            <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>Select one or more tracks to get recommendations</p>
          </div>
        </div>
      </div>
    );
  }

  // Collapsed state
  if (!isExpanded) {
    return (
      <div 
        className="border-t border-border bg-muted/50 px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>
              Recommendations based on {selectedTrackIds.length} selected track{selectedTrackIds.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="border-t border-border bg-background flex flex-col h-full"
    >
      {/* Header - hidden on narrow panels */}
      {showHeader && (
        <div 
          className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors flex-shrink-0"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              Recommendations
            </span>
            {filteredRecommendations.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({recommendations.length}{hasMore ? `/${filteredRecommendations.length}` : ''} tracks)
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      
      {/* Search bar */}
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

      {/* Content */}
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
          <>
            <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
              <RecommendationsList
                recommendations={recommendations}
                rowHeight={rowHeight}
                isLiked={isLiked}
                onToggleLiked={handleToggleLiked}
                onDismiss={handleDismiss}
                isTrackPlaying={isTrackPlaying}
                isTrackLoading={isTrackLoading}
                onPlay={playTrack}
                onPause={pausePlayback}
                onSelect={handleSelect}
                onClick={handleClick}
                getCompareColorForTrack={getCompareColorForTrack}
              />
              {/* Invisible trigger for infinite scroll - inside scroll container */}
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
          </>
        )}
      </div>
      
      {/* Context menu for this panel */}
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
    </div>
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
  onSelect: () => void;
  onClick: () => void;
  getCompareColorForTrack: (trackUri: string) => string;
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
                isSelected={false}
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
