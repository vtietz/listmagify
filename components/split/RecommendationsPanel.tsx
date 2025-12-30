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
import { TrackRow } from './TrackRow';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from './constants';
import { makeCompositeId } from '@/lib/dnd/id';
import { cn } from '@/lib/utils';
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
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const dismissMutation = useDismissRecommendation();
  
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
  
  // Filter recommendations by search query
  const filteredRecommendations = useMemo(() => {
    if (!searchQuery.trim()) return allRecommendations;
    const query = searchQuery.toLowerCase();
    return allRecommendations.filter((r: { track?: Track }) => {
      const track = r.track;
      if (!track) return false;
      return (
        track.name?.toLowerCase().includes(query) ||
        track.artists?.some(a => a.toLowerCase().includes(query)) ||
        track.album?.name?.toLowerCase().includes(query)
      );
    });
  }, [allRecommendations, searchQuery]);
  
  // Apply display limit for "load more" functionality
  const recommendations = useMemo(() => 
    filteredRecommendations.slice(0, displayLimit),
    [filteredRecommendations, displayLimit]
  );
  
  const hasMore = filteredRecommendations.length > displayLimit;
  
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

  // Show collapsed header when no selection or collapsed
  if (selectedTrackIds.length === 0) {
    return null;
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
      className="border-t border-border bg-background flex flex-col h-full"
    >
      {/* Header */}
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              refetch();
            }}
            disabled={isLoading}
            className="h-7 px-2 text-xs"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              'Refresh'
            )}
          </Button>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      
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
            <div className="flex-1 min-h-0 overflow-auto">
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
              />
            </div>
            {hasMore && (
              <div className="px-3 py-2 border-t border-border bg-muted/10 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDisplayLimit(prev => prev + 20)}
                  className="h-7 text-xs"
                >
                  Load more ({filteredRecommendations.length - displayLimit} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
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
