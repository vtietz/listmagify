/**
 * TrackRow component with drag-and-drop support and selection.
 * Renders a single track in a playlist panel.
 */

'use client';

import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import type { Track } from '@/lib/spotify/types';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import { cn } from '@/lib/utils';
import { formatDuration, formatReleaseDate } from '@/lib/utils/format';
import { Heart, Play, Pause, Loader2, MapPin } from 'lucide-react';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { AddToMarkedButton } from './AddToMarkedButton';
import { TRACK_GRID_CLASSES, TRACK_GRID_CLASSES_NORMAL, TRACK_GRID_CLASSES_COMPACT, TRACK_GRID_STYLE_WITH_ALBUM } from './TableHeader';

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
}: TrackRowProps) {
  const { isCompact } = useCompactModeStore();
  const { open: openBrowsePanel, setSearchQuery } = useBrowsePanelStore();
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  
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
    data: {
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
    
    if (playlistId && isEditable && !locked) {
      // Toggle marker at index (before this row) or index+1 (after this row)
      const targetIndex = nearEdge === 'bottom' ? index + 1 : index;
      togglePoint(playlistId, targetIndex);
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

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...TRACK_GRID_STYLE_WITH_ALBUM }}
      className={cn(
        'relative group/row', // Add relative and group for the insertion marker toggle
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
      {...(!locked ? { ...restAttributes, ...listeners } : {})}
    >
      {/* Play button */}
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

      {/* Add to marked insertion points button */}
      <AddToMarkedButton
        trackUri={track.uri}
        trackName={track.name}
        {...(playlistId ? { excludePlaylistId: playlistId } : {})}
      />

      {/* Liked status button */}
      {showLikedColumn ? (
        <button
          onClick={handleHeartClick}
          disabled={isLocalFile}
          className={cn(
            'flex items-center justify-center transition-colors',
            isLocalFile && 'opacity-30 cursor-not-allowed',
            !isLocalFile && 'hover:scale-110',
            isLiked ? 'text-green-500' : 'text-muted-foreground hover:text-foreground',
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
      <div className={cn('text-muted-foreground tabular-nums cursor-pointer select-none', isCompact ? 'text-xs' : 'text-sm')}>
        {track.position != null ? track.position + 1 : index + 1}
      </div>

      {/* Track title - no link, just text */}
      <div className="min-w-0">
        <div className={cn('truncate cursor-pointer select-none', isCompact ? 'text-xs' : 'text-sm')}>
          {track.name}
        </div>
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

      {/* Release Year - shows year, tooltip shows full date */}
      <div 
        className={cn('text-muted-foreground tabular-nums text-center cursor-pointer select-none', isCompact ? 'text-xs' : 'text-sm')}
        title={track.album?.releaseDate ? `Released: ${formatReleaseDate(track.album.releaseDate, track.album.releaseDatePrecision)}` : 'Release date unknown'}
      >
        {track.album?.releaseDate ? track.album.releaseDate.substring(0, 4) : '—'}
      </div>

      {/* Popularity bar - visual representation of 0-100 popularity */}
      <div 
        className="flex items-center justify-center cursor-pointer select-none"
        title={track.popularity != null ? `Popularity: ${track.popularity}%` : 'Popularity: Unknown'}
      >
        {track.popularity != null ? (
          <div className={cn('w-full rounded-full bg-muted/50', isCompact ? 'h-1' : 'h-1.5')}>
            <div 
              className={cn(
                'h-full rounded-full transition-all',
                track.popularity >= 70 ? 'bg-green-500' : 
                track.popularity >= 40 ? 'bg-yellow-500' : 
                'bg-muted-foreground/50'
              )}
              style={{ width: `${track.popularity}%` }}
            />
          </div>
        ) : (
          <div className={cn('w-full rounded-full bg-muted/30', isCompact ? 'h-1' : 'h-1.5')} />
        )}
      </div>

      {/* Duration - right aligned */}
      <div className={cn('text-muted-foreground tabular-nums text-right cursor-pointer select-none', isCompact ? 'text-xs' : 'text-sm')}>
        {formatDuration(track.durationMs)}
      </div>

      {/* Insertion marker line - shown at top edge when marked (before this row) */}
      {hasInsertionMarker && (
        <div
          className="absolute left-0 right-0 top-0 h-[3px] bg-orange-500 pointer-events-none z-10"
          style={{ boxShadow: '0 0 6px rgba(249, 115, 22, 0.7)' }}
        />
      )}

      {/* Insertion marker line - shown at bottom edge when marked (after this row) */}
      {hasInsertionMarkerAfter && (
        <div
          className="absolute left-0 right-0 bottom-0 h-[3px] bg-orange-500 pointer-events-none z-10"
          style={{ boxShadow: '0 0 6px rgba(249, 115, 22, 0.7)' }}
        />
      )}

      {/* Insertion marker toggle button - only appears when mouse is near top/bottom edge */}
      {isEditable && !locked && nearEdge !== null && (
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
