/**
 * TrackRow component with drag-and-drop support and selection.
 * Renders a single track in a playlist panel.
 */

'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import type { Track } from '@/lib/spotify/types';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import { cn } from '@/lib/utils';
import { formatDuration, formatReleaseDate, formatScrobbleDate } from '@/lib/utils/format';
import { Heart, Play, Pause, Loader2, MapPin } from 'lucide-react';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { usePlayerStore } from '@/hooks/usePlayerStore';
import { AddToMarkedButton } from './AddToMarkedButton';
import { TRACK_GRID_CLASSES, TRACK_GRID_CLASSES_NORMAL, TRACK_GRID_CLASSES_COMPACT, getTrackGridStyle } from './TableHeader';
import { Avatar } from '@/components/ui/avatar';

interface TrackRowProps {
  track: Track;
  index: number;
  selectionKey: string;
  isSelected: boolean;
  isEditable: boolean;
  locked?: boolean;
  onSelect: (selectionKey: string, index: number, event: React.MouseEvent) => void;
  onClick: (selectionKey: string, index: number) => void;
  panelId?: string;
  playlistId?: string;
  dndMode?: 'copy' | 'move';
  /** True if this track is selected AND a drag is in progress from this panel */
  isDragSourceSelected?: boolean;
  /** Whether to show the liked status column */
  showLikedColumn?: boolean;
  /** Whether this track is liked (saved to user's library) */
  isLiked?: boolean;
  /** Callback to toggle liked status */
  onToggleLiked?: (trackId: string, currentlyLiked: boolean) => void;
  /** Whether this track is currently playing */
  isPlaying?: boolean;
  /** Whether playback is loading for this track */
  isPlaybackLoading?: boolean;
  /** Callback to play this track */
  onPlay?: (trackUri: string) => void;
  /** Callback to pause playback */
  onPause?: () => void;
  /** Whether there's an insertion marker before this row */
  hasInsertionMarker?: boolean;
  /** Whether there's an insertion marker after this row (for last item) */
  hasInsertionMarkerAfter?: boolean;
  /** Whether this is a collaborative playlist (shows added-by avatar) */
  isCollaborative?: boolean;
  /** Function to get cached user profile data (displayName and imageUrl) */
  getProfile?: ((userId: string) => { displayName?: string | null; imageUrl?: string | null } | undefined) | undefined;
  /** Cumulative duration in milliseconds from start of playlist to this track */
  cumulativeDurationMs?: number;
  /** Whether this track crosses an hour boundary (show hour marker after) */
  crossesHourBoundary?: boolean;
  /** Which hour number was just crossed (1, 2, 3, etc.) */
  hourNumber?: number;
  /** Whether to allow toggling insertion markers (disabled when search/filter is active) */
  allowInsertionMarkerToggle?: boolean;
  /** Whether to hide the built-in AddToMarkedButton (for custom implementations) */
  hideAddToMarkedButton?: boolean;
  /** Render function for prefix columns (e.g., match status indicator) - rendered as first grid cells */
  renderPrefixColumns?: () => React.ReactNode;
  /** Whether to show match status column (affects grid layout) */
  showMatchStatusColumn?: boolean;
  /** Whether to show custom add column (affects grid layout, replaces standard add to marked) */
  showCustomAddColumn?: boolean;
  /** Unix timestamp (seconds) of when track was scrobbled/played - displayed instead of release year */
  scrobbleTimestamp?: number | undefined;
  /** Whether to use wider date column for scrobble dates (affects grid layout) */
  showScrobbleDateColumn?: boolean;
  /** Whether to show cumulative time column (default true) */
  showCumulativeTime?: boolean;
  /** Custom drag data type (default 'track', use 'lastfm-track' for Last.fm) */
  dragType?: 'track' | 'lastfm-track';
  /** Matched Spotify track for Last.fm drag (required when dragType is 'lastfm-track') */
  matchedTrack?: { id: string; uri: string; name: string; artist?: string | undefined; durationMs?: number | undefined } | null;
  /** Original Last.fm track DTO for drag data */
  lastfmDto?: { artistName: string; trackName: string; albumName?: string | undefined };
  /** All selected tracks' matched URIs for multi-select Last.fm drag */
  selectedMatchedUris?: string[];
  /** Callback when drag starts (used to trigger Last.fm matching) */
  onDragStart?: () => void;
}

export function TrackRow({
  track,
  index,
  selectionKey,
  isSelected,
  isEditable,
  locked = false,
  onSelect,
  onClick,
  panelId,
  playlistId,
  dndMode = 'copy',
  isDragSourceSelected = false,
  showLikedColumn = true,
  isLiked = false,
  onToggleLiked,
  isPlaying = false,
  isPlaybackLoading = false,
  onPlay,
  onPause,
  hasInsertionMarker = false,
  hasInsertionMarkerAfter = false,
  isCollaborative = false,
  getProfile,
  cumulativeDurationMs = 0,
  crossesHourBoundary = false,
  hourNumber = 0,
  allowInsertionMarkerToggle = true,
  hideAddToMarkedButton = false,
  renderPrefixColumns,
  showMatchStatusColumn = false,
  showCustomAddColumn = false,
  scrobbleTimestamp,
  showScrobbleDateColumn = false,
  showCumulativeTime = true,
  dragType = 'track',
  matchedTrack,
  lastfmDto,
  selectedMatchedUris,
  onDragStart,
}: TrackRowProps) {
  const { isCompact } = useCompactModeStore();
  const { open: openBrowsePanel, setSearchQuery } = useBrowsePanelStore();
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  const allPlaylists = useInsertionPointsStore((s) => s.playlists);
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  
  // Check if any markers exist across all playlists
  const hasAnyMarkers = Object.values(allPlaylists).some((p) => p.markers.length > 0);
  
  // Don't show standard add column if using custom add column
  const showStandardAddColumn = hasAnyMarkers && !showCustomAddColumn && !hideAddToMarkedButton;
  
  // Dynamic grid style based on visible columns
  const gridStyle = getTrackGridStyle(isPlayerVisible, showStandardAddColumn, isCollaborative, {
    showMatchStatusColumn,
    showCustomAddColumn,
    showScrobbleDateColumn,
    showCumulativeTime,
  });
  
  // Track whether mouse is near top/bottom edge for insertion marker toggle
  // null = not near edge, 'top' = near top edge, 'bottom' = near bottom edge
  const [nearEdge, setNearEdge] = React.useState<'top' | 'bottom' | null>(null);
  
  // Create globally unique composite ID scoped by panel and position
  // Position is required to distinguish duplicate tracks (same song multiple times)
  const trackId = track.id || track.uri;
  const position = getTrackPosition(track, index);
  const compositeId = panelId ? makeCompositeId(panelId, trackId, position) : trackId;

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: compositeId, // Globally unique ID
    disabled: locked, // Disable drag if panel is locked (read-only panels can still be drag sources in copy mode)
    animateLayoutChanges: () => false, // Disable "make room" animation for non-active items
    data: dragType === 'lastfm-track'
      ? {
          type: 'lastfm-track',
          track: lastfmDto, // Original Last.fm DTO for overlay
          matchedTrack, // Matched Spotify track for adding to playlist (single track)
          selectedMatchedUris, // All selected tracks' matched URIs for multi-select
          panelId,
          position, // Global position
        }
      : {
          type: 'track',
          trackId, // Keep pure Spotify ID for mutations
          track,
          panelId,
          playlistId,
          position, // Global position for mutations
        },
  });

  // Don't apply transform/transition - we use drag overlay and drop indicator instead
  // This prevents the original item from moving during drag
  const style = {};

  const { role: _attrRole, ...restAttributes } = attributes;
  
  // Handler to search for artist in browse panel
  const handleArtistClick = (e: React.MouseEvent, artistName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSearchQuery(`artist:"${artistName}"`);
    openBrowsePanel();
  };
  
  // Handler to search for album in browse panel
  const handleAlbumClick = (e: React.MouseEvent, albumName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSearchQuery(`album:"${albumName}"`);
    openBrowsePanel();
  };

  const handleClick = (e: React.MouseEvent) => {
    // Prevent text selection when using modifier-based range/toggle selection
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onSelect(selectionKey, index, e);
    } else {
      onClick(selectionKey, index);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Avoid native text selection during modifier selection
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  };

  const handleHeartClick = (e: React.MouseEvent) => {
    // Stop propagation to prevent row selection/DnD interference
    e.stopPropagation();
    e.preventDefault();
    
    // Local files have null ID - can't be saved to library
    if (!track.id) return;
    
    onToggleLiked?.(track.id, isLiked);
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    // Stop propagation to prevent row selection/DnD interference
    e.stopPropagation();
    e.preventDefault();
    
    if (isPlaying) {
      onPause?.();
    } else {
      onPlay?.(track.uri);
    }
  };

  const handleInsertionMarkerToggle = (e: React.MouseEvent) => {
    // Stop propagation to prevent row selection/DnD interference
    e.stopPropagation();
    e.preventDefault();
    
    if (playlistId && isEditable && !locked && allowInsertionMarkerToggle) {
      // Use the track's actual playlist position, not visual index
      // This ensures markers work correctly even when the list is sorted/filtered
      const actualPosition = track.position ?? index;
      const targetPosition = nearEdge === 'bottom' ? actualPosition + 1 : actualPosition;
      togglePoint(playlistId, targetPosition);
    }
  };

  // Edge detection thresholds in pixels
  const EDGE_THRESHOLD_Y = 8;  // Vertical: how close to top/bottom edge
  const EDGE_THRESHOLD_X = 30; // Horizontal: how close to left edge

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;
    
    // Only show toggle when mouse is near left edge AND near top/bottom edge
    const nearLeftEdge = relativeX <= EDGE_THRESHOLD_X;
    
    if (!nearLeftEdge) {
      setNearEdge(null);
      return;
    }
    
    // Check if mouse is near top or bottom edge
    if (relativeY <= EDGE_THRESHOLD_Y) {
      setNearEdge('top');
    } else if (relativeY >= rect.height - EDGE_THRESHOLD_Y) {
      setNearEdge('bottom');
    } else {
      setNearEdge(null);
    }
  };

  const handleMouseLeave = () => {
    setNearEdge(null);
  };

  // Local files can't be saved to library
  const isLocalFile = track.id === null;

  // Wrap listeners to trigger onDragStart callback (for Last.fm matching)
  const wrappedListeners = useMemo(() => {
    if (!onDragStart || !listeners) return listeners;
    
    const { onPointerDown, ...rest } = listeners;
    return {
      ...rest,
      onPointerDown: (e: React.PointerEvent) => {
        onDragStart();
        onPointerDown?.(e);
      },
    };
  }, [listeners, onDragStart]);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...gridStyle }}
      className={cn(
        'relative group/row bg-card cursor-default', // relative and group for the insertion marker toggle, default cursor for row
        TRACK_GRID_CLASSES,
        isCompact ? 'h-7 ' + TRACK_GRID_CLASSES_COMPACT : 'h-10 ' + TRACK_GRID_CLASSES_NORMAL,
        'border-b border-border transition-colors',
        !isSelected && 'hover:bg-accent/40 hover:text-foreground',
        isSelected && 'bg-accent/70 text-foreground hover:bg-accent/80',
        // Visual feedback during drag - apply to dragged item OR all selected items in multi-select
        (isDragging || isDragSourceSelected) && dndMode === 'move' && 'opacity-0',
        (isDragging || isDragSourceSelected) && dndMode === 'copy' && 'opacity-50',
      )}
      id={`option-${panelId}-${index}`}
      role="option"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-selected={isSelected}
      title={
        locked
          ? 'Panel is locked - unlock to enable dragging'
          : dndMode === 'copy'
            ? 'Click and drag to copy (Ctrl to move)'
            : 'Click and drag to move (Ctrl to copy)'
      }
      {...(!locked ? { ...restAttributes, ...wrappedListeners } : {})}
    >
      {/* Prefix columns (e.g., match status + custom add button for Last.fm) */}
      {renderPrefixColumns?.()}

      {/* Contributor avatar - only for collaborative playlists */}
      {isCollaborative && (
        <div className="flex items-center justify-center">
          {track.addedBy ? (
            (() => {
              // Get cached profile data if available
              const profile = getProfile?.(track.addedBy.id);
              const displayName = profile?.displayName ?? track.addedBy.displayName ?? null;
              const imageUrl = profile?.imageUrl ?? null;
              return (
                <Avatar
                  displayName={displayName}
                  userId={track.addedBy.id}
                  imageUrl={imageUrl}
                  size={isCompact ? 'sm' : 'md'}
                  title={`Added by ${displayName || track.addedBy.id}`}
                />
              );
            })()
          ) : (
            <div
              className={cn(
                'rounded-full bg-muted/30',
                isCompact ? 'h-4 w-4' : 'h-5 w-5'
              )}
              title="Unknown contributor"
            />
          )}
        </div>
      )}

      {/* Play button - only show when player is visible */}
      {isPlayerVisible && (
        <button
          onClick={handlePlayClick}
          disabled={isLocalFile || isPlaybackLoading}
          className={cn(
            'flex items-center justify-center rounded-full transition-all',
            isCompact ? 'h-5 w-5' : 'h-6 w-6',
            isLocalFile && 'opacity-30 cursor-not-allowed',
            !isLocalFile && 'hover:scale-110 hover:bg-green-500 hover:text-white',
            isPlaying ? 'bg-green-500 text-white' : 'text-muted-foreground',
          )}
          title={
            isLocalFile
              ? 'Local files cannot be played'
              : isPlaying
                ? 'Pause'
                : 'Play'
          }
          aria-label={isPlaying ? 'Pause track' : 'Play track'}
        >
          {isPlaybackLoading ? (
            <Loader2 className={isCompact ? 'h-3 w-3 animate-spin' : 'h-4 w-4 animate-spin'} />
          ) : isPlaying ? (
            <Pause className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
          ) : (
            <Play className={isCompact ? 'h-3 w-3 ml-0.5' : 'h-4 w-4 ml-0.5'} />
          )}
        </button>
      )}

      {/* Add to marked insertion points button - only when using standard add column */}
      {showStandardAddColumn && (
        <AddToMarkedButton
          trackUri={track.uri}
          trackName={track.name}
        />
      )}

      {/* Liked status button */}
      {showLikedColumn ? (
        <button
          onClick={handleHeartClick}
          disabled={isLocalFile}
          className={cn(
            'flex items-center justify-center transition-colors',
            isLocalFile && 'opacity-30 cursor-not-allowed',
            !isLocalFile && 'hover:scale-110',
            isLiked ? 'text-[#9759f5]' : 'text-muted-foreground hover:text-foreground',
          )}
          title={
            isLocalFile
              ? 'Local files cannot be saved to library'
              : isLiked
                ? 'Remove from Liked Songs'
                : 'Save to Liked Songs'
          }
          aria-label={isLiked ? 'Unlike track' : 'Like track'}
        >
          <Heart
            className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4', isLiked && 'fill-current')}
          />
        </button>
      ) : (
        <div />
      )}

      {/* Position number */}
      <div className={cn('text-muted-foreground tabular-nums select-none', isCompact ? 'text-xs' : 'text-sm')}>
        {track.position != null ? track.position + 1 : index + 1}
      </div>

      {/* Track title with explicit badge and Open in Spotify link */}
      <div className="min-w-0 flex items-center gap-1.5">
        {/* Explicit content badge per Spotify guidelines */}
        {track.explicit && (
          <span 
            className={cn(
              'shrink-0 inline-flex items-center justify-center rounded font-bold bg-muted-foreground/20 text-muted-foreground',
              isCompact ? 'text-[8px] px-1 h-3' : 'text-[9px] px-1.5 h-4'
            )}
            title="Explicit content"
            aria-label="Explicit"
          >
            E
          </span>
        )}
        {track.id ? (
          <a
            href={`https://open.spotify.com/track/${track.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn('truncate select-none hover:underline hover:text-green-500', isCompact ? 'text-xs' : 'text-sm')}
            title={`${track.name} — Open in Spotify ↗`}
          >
            {track.name}
          </a>
        ) : (
          <span className={cn('truncate select-none', isCompact ? 'text-xs' : 'text-sm')}>
            {track.name}
          </span>
        )}
      </div>

      {/* Artist - click to search in browse panel */}
      <div className="min-w-0">
        <div className={cn('text-muted-foreground truncate', isCompact ? 'text-xs' : 'text-sm')}>
          {track.artistObjects && track.artistObjects.length > 0 ? (
            track.artistObjects.map((artist, idx) => (
              <span key={artist.id || artist.name}>
                <button
                  className="hover:underline hover:text-green-500 text-left cursor-pointer"
                  onClick={(e) => handleArtistClick(e, artist.name)}
                  title={`Search for tracks by "${artist.name}"`}
                >
                  {artist.name}
                </button>
                {idx < track.artistObjects!.length - 1 && ', '}
              </span>
            ))
          ) : (
            track.artists.map((artistName, idx) => (
              <span key={artistName}>
                <button
                  className="hover:underline hover:text-green-500 text-left cursor-pointer"
                  onClick={(e) => handleArtistClick(e, artistName)}
                  title={`Search for tracks by "${artistName}"`}
                >
                  {artistName}
                </button>
                {idx < track.artists.length - 1 && ', '}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Album - click to search in browse panel, hidden on small screens */}
      <div className="hidden lg:block min-w-0">
        {track.album?.name && (
          <div className={cn('text-muted-foreground truncate', isCompact ? 'text-xs' : 'text-sm')}>
            <button
              className="hover:underline hover:text-green-500 text-left cursor-pointer truncate max-w-full"
              onClick={(e) => handleAlbumClick(e, track.album!.name as string)}
              title={`Search for tracks from "${track.album.name}"`}
            >
              {track.album.name}
            </button>
          </div>
        )}
      </div>

      {/* Date column - shows scrobble date if available, otherwise release year */}
      {scrobbleTimestamp ? (
        <div 
          className={cn('text-muted-foreground tabular-nums text-center select-none whitespace-nowrap', isCompact ? 'text-xs' : 'text-sm')}
          title={`Scrobbled: ${new Date(scrobbleTimestamp * 1000).toLocaleString()}`}
        >
          {formatScrobbleDate(scrobbleTimestamp)}
        </div>
      ) : (
        <div 
          className={cn('text-muted-foreground tabular-nums text-center select-none', isCompact ? 'text-xs' : 'text-sm')}
          title={track.album?.releaseDate ? `Released: ${formatReleaseDate(track.album.releaseDate, track.album.releaseDatePrecision)}` : 'Release date unknown'}
        >
          {track.album?.releaseDate ? track.album.releaseDate.substring(0, 4) : '—'}
        </div>
      )}

      {/* Popularity bar - visual representation of 0-100 popularity */}
      <div 
        className="flex items-center justify-center select-none"
        title={track.popularity != null ? `Popularity: ${track.popularity}%` : 'Popularity: Unknown'}
      >
        {track.popularity != null ? (
          <div className={cn('w-full rounded-full bg-muted/50', isCompact ? 'h-1' : 'h-1.5')}>
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                width: `${track.popularity}%`,
                backgroundColor: `color-mix(in srgb, #11B7AE ${track.popularity}%, #6b7280)`
              }}
            />
          </div>
        ) : (
          <div className={cn('w-full rounded-full bg-muted/30', isCompact ? 'h-1' : 'h-1.5')} />
        )}
      </div>

      {/* Duration - right aligned */}
      <div className={cn('text-muted-foreground tabular-nums text-right select-none', isCompact ? 'text-xs' : 'text-sm')}>
        {formatDuration(track.durationMs)}
      </div>

      {/* Cumulative duration - right aligned */}
      {showCumulativeTime && (
        <div 
          className={cn('text-muted-foreground/60 tabular-nums text-right select-none', isCompact ? 'text-xs' : 'text-sm')}
          title={`Total time elapsed: ${formatDuration(cumulativeDurationMs)}`}
        >
          {formatDuration(cumulativeDurationMs)}
        </div>
      )}

      {/* Hour boundary marker - horizontal line when an hour is elapsed */}
      {crossesHourBoundary && (
        <div
          className="absolute left-0 right-0 bottom-0 flex items-center pointer-events-none z-10"
        >
          <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/70 to-cyan-500/70" />
          <span className={cn(
            'px-1.5 text-cyan-500 font-medium whitespace-nowrap',
            isCompact ? 'text-[9px]' : 'text-[10px]'
          )}>
            {hourNumber}h
          </span>
          <div className="w-2 h-[1px] bg-cyan-500/70" />
        </div>
      )}

      {/* Insertion marker line - shown at top edge when marked (before this row) */}
      {hasInsertionMarker && (
        <div
          className="absolute left-0 right-0 h-[3px] bg-orange-500 pointer-events-none z-10"
          style={{ top: '-1.5px', boxShadow: '0 0 6px rgba(249, 115, 22, 0.7)' }}
        />
      )}

      {/* Insertion marker line - shown at bottom edge when marked (after this row) */}
      {hasInsertionMarkerAfter && (
        <div
          className="absolute left-0 right-0 h-[3px] bg-orange-500 pointer-events-none z-10"
          style={{ bottom: '-1.5px', boxShadow: '0 0 6px rgba(249, 115, 22, 0.7)' }}
        />
      )}

      {/* Insertion marker toggle button - only appears when mouse is near top/bottom edge */}
      {isEditable && !locked && allowInsertionMarkerToggle && nearEdge !== null && (
        <button
          onClick={handleInsertionMarkerToggle}
          className={cn(
            'absolute z-20 rounded-full transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1',
            isCompact ? 'w-4 h-4 -left-1' : 'w-5 h-5 -left-1.5',
            // Position at top or bottom based on which edge mouse is near
            nearEdge === 'bottom'
              ? (isCompact ? '-bottom-2' : '-bottom-2.5')
              : (isCompact ? '-top-2' : '-top-2.5'),
            // Show as active if there's a marker at the relevant position
            (nearEdge === 'bottom' ? hasInsertionMarkerAfter : hasInsertionMarker)
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-muted text-muted-foreground hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-950',
          )}
          title={
            nearEdge === 'bottom'
              ? (hasInsertionMarkerAfter ? 'Remove insertion marker' : 'Add insertion marker after this row')
              : (hasInsertionMarker ? 'Remove insertion marker' : 'Add insertion marker before this row')
          }
          aria-pressed={nearEdge === 'bottom' ? hasInsertionMarkerAfter : hasInsertionMarker}
          aria-label={
            nearEdge === 'bottom'
              ? (hasInsertionMarkerAfter ? `Remove insertion point after row ${index + 1}` : `Add insertion point after row ${index + 1}`)
              : (hasInsertionMarker ? `Remove insertion point before row ${index + 1}` : `Add insertion point before row ${index + 1}`)
          }
        >
          <MapPin className={cn(isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3', 'mx-auto')} />
        </button>
      )}
    </div>
  );
}
