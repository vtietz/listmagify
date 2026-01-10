/**
 * TrackRow component with drag-and-drop support and selection.
 * Renders a single track in a playlist panel.
 * 
 * Refactored to use extracted cell and action subcomponents for maintainability.
 */

'use client';

import * as React from 'react';
import { useMemo, useCallback } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Track } from '@/lib/spotify/types';
import { cn } from '@/lib/utils';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { useInsertionMarkerToggle } from '@/hooks/useInsertionMarkerToggle';
import { useRowSortable } from '@/hooks/useRowSortable';
import { useLongPress } from '@/hooks/useLongPress';
import { AddToMarkedButton } from './AddToMarkedButton';
import { TRACK_GRID_CLASSES, TRACK_GRID_CLASSES_NORMAL, TRACK_GRID_CLASSES_COMPACT, getTrackGridStyle } from './TableHeader';

// Cell subcomponents
import {
  PositionCell,
  TitleCell,
  ArtistCell,
  AlbumCell,
  DateCell,
  PopularityBar,
  DurationCell,
  CumulativeTimeCell,
  HourBoundaryMarker,
  InsertionMarkerLine,
} from './TrackRowCells';

// Action subcomponents
import {
  HeartButton,
  PlayPauseButton,
  InsertionToggleButton,
  ContributorAvatar,
} from './TrackRowActions';

// Mobile drag handle
import { DragHandle, useDragHandle } from './DragHandle';

// Context menu types
import { 
  type ReorderActions,
  type MarkerActions,
  type TrackActions,
} from './TrackContextMenu';

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
  /** Whether this track appears multiple times in the playlist (duplicate) */
  isDuplicate?: boolean;
  /** Whether another instance of this duplicate track is currently selected */
  isOtherInstanceSelected?: boolean;
  /** Compare mode background color (transparent when not in compare mode) */
  compareColor?: string | undefined;
  /** Context menu reorder actions */
  reorderActions?: ReorderActions;
  /** Context menu marker actions */
  markerActions?: MarkerActions;
  /** Context menu track actions (remove, go to artist/album) */
  contextTrackActions?: TrackActions;
  /** Whether multi-select mode is active */
  isMultiSelect?: boolean;
  /** Number of selected tracks */
  selectedCount?: number;
  /** Selected tracks for multi-select drag (browse panels) */
  selectedTracks?: Track[] | undefined;
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
  isDuplicate = false,
  isOtherInstanceSelected = false,
  compareColor,
  reorderActions,
  markerActions,
  contextTrackActions,
  isMultiSelect = false,
  selectedCount = 1,
  selectedTracks,
}: TrackRowProps) {
  // Store hooks
  const { isCompact } = useCompactModeStore();
  const { open: openBrowsePanel, setSearchQuery } = useBrowsePanelStore();
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  const allPlaylists = useInsertionPointsStore((s) => s.playlists);
  
  // Always show play button regardless of player visibility
  const shouldShowPlayButton = true;
  
  // Global context menu store
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  
  // Check if any markers exist across all playlists
  const hasAnyMarkers = Object.values(allPlaylists).some((p) => p.markers.length > 0);
  
  // Don't show standard add column if using custom add column
  const showStandardAddColumn = hasAnyMarkers && !showCustomAddColumn && !hideAddToMarkedButton;
  
  // Mobile drag handle visibility - must be called before getTrackGridStyle
  const { showHandle, handleOnlyDrag } = useDragHandle();
  
  // Long-press handler for mobile multi-select (toggle selection)
  const { wasLongPress, resetLongPress, ...longPressTouchHandlers } = useLongPress({
    delay: 400,
    onLongPress: useCallback(() => {
      // Toggle selection on long press (like Ctrl+Click)
      onSelect(selectionKey, index, { ctrlKey: true, metaKey: false, shiftKey: false } as React.MouseEvent);
    }, [onSelect, selectionKey, index]),
    disabled: !showHandle, // Only enable on touch devices
  });
  
  // Dynamic grid style based on visible columns
  const gridStyle = getTrackGridStyle(
    shouldShowPlayButton, 
    showStandardAddColumn, 
    isCollaborative, 
    {
      showMatchStatusColumn,
      showCustomAddColumn,
      showScrobbleDateColumn,
      showCumulativeTime,
      showDragHandle: showHandle,
    }
  );

  // Local files can't be saved to library or played
  const isLocalFile = track.id === null;

  // Sortable hook for DnD
  const {
    isDragging,
    setNodeRef,
    attributes,
    listeners,
  } = useRowSortable({
    track,
    index,
    panelId,
    playlistId,
    disabled: locked,
    dragType,
    matchedTrack,
    lastfmDto,
    selectedMatchedUris,
    selectedTracks,
    onDragStart,
  });

  // Insertion marker toggle hook
  const {
    nearEdge,
    handleMouseMove,
    handleMouseLeave,
    handleInsertionMarkerToggle,
  } = useInsertionMarkerToggle({
    playlistId,
    isEditable,
    locked,
    allowToggle: allowInsertionMarkerToggle,
    trackPosition: track.position ?? index,
    visualIndex: index,
    togglePoint,
  });
  
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
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onSelect(selectionKey, index, e);
    } else if (showHandle && isMultiSelect) {
      // On touch devices, when in multi-select mode, tap toggles selection (like Ctrl+Click)
      e.preventDefault();
      onSelect(selectionKey, index, { ctrlKey: true, metaKey: false, shiftKey: false } as React.MouseEvent);
    } else {
      onClick(selectionKey, index);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  };

  const handleHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!track.id) return;
    onToggleLiked?.(track.id, isLiked);
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isPlaying) {
      onPause?.();
    } else {
      onPlay?.(track.uri);
    }
  };

  // Build context menu track actions with play/like/go-to handlers
  const fullTrackActions = useMemo((): TrackActions => {
    const actions: TrackActions = {
      ...contextTrackActions,
      onPlay: () => onPlay?.(track.uri),
      onGoToArtist: () => {
        const artistName = track.artists?.[0];
        if (artistName) {
          setSearchQuery(`artist:"${artistName}"`);
          openBrowsePanel();
        }
      },
      onGoToAlbum: () => {
        const albumName = track.album?.name;
        if (albumName) {
          setSearchQuery(`album:"${albumName}"`);
          openBrowsePanel();
        }
      },
      isPlaying,
      isLiked,
    };
    if (contextTrackActions?.canRemove !== undefined) {
      actions.canRemove = contextTrackActions.canRemove;
    }
    if (onPause) actions.onPause = onPause;
    if (track.id && onToggleLiked) {
      actions.onToggleLiked = () => onToggleLiked(track.id!, isLiked);
    }
    if (track.id) {
      actions.onOpenInSpotify = () => {
        window.open(`https://open.spotify.com/track/${track.id}`, '_blank', 'noopener,noreferrer');
      };
    }
    return actions;
  }, [contextTrackActions, track, onPlay, onPause, onToggleLiked, isLiked, isPlaying, setSearchQuery, openBrowsePanel]);

  // Build marker actions with actual handlers
  const trackPosition = track.position ?? index;
  const fullMarkerActions = useMemo((): MarkerActions => {
    const actions: MarkerActions = {
      ...markerActions,
      hasAnyMarkers,
      hasMarkerBefore: hasInsertionMarker,
      hasMarkerAfter: hasInsertionMarkerAfter,
    };
    // Always allow marker actions in context menu (regardless of inline toggle setting)
    if (playlistId && isEditable) {
      actions.onAddMarkerBefore = () => togglePoint(playlistId, trackPosition);
      actions.onAddMarkerAfter = () => togglePoint(playlistId, trackPosition + 1);
    }
    if (playlistId && isEditable && (hasInsertionMarker || hasInsertionMarkerAfter)) {
      actions.onRemoveMarker = () => {
        if (hasInsertionMarker) togglePoint(playlistId, trackPosition);
        if (hasInsertionMarkerAfter) togglePoint(playlistId, trackPosition + 1);
      };
    }
    return actions;
  }, [markerActions, hasAnyMarkers, hasInsertionMarker, hasInsertionMarkerAfter, playlistId, isEditable, trackPosition, togglePoint]);

  // Context menu handlers - use global store (desktop only)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Skip context menu entirely on touch devices - use toolbar selection menu instead
    if (showHandle) {
      return;
    }
    
    // Skip context menu if this was triggered by a long press (on touch devices)
    if (wasLongPress()) {
      resetLongPress();
      return;
    }
    
    const showMulti = isSelected && isMultiSelect && selectedCount > 1;
    openContextMenu({
      track,
      position: { x: e.clientX, y: e.clientY },
      isMultiSelect: showMulti,
      selectedCount: showMulti ? selectedCount : 1,
      isEditable,
      panelId: panelId || '',
      markerActions: fullMarkerActions,
      trackActions: fullTrackActions,
      reorderActions: reorderActions || {},
    });
  }, [track, isSelected, isMultiSelect, selectedCount, isEditable, panelId, fullMarkerActions, fullTrackActions, reorderActions, openContextMenu, wasLongPress, resetLongPress, showHandle]);

  const handleMoreButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const showMulti = isSelected && isMultiSelect && selectedCount > 1;
    openContextMenu({
      track,
      position: { x: rect.right, y: rect.top },
      isMultiSelect: showMulti,
      selectedCount: showMulti ? selectedCount : 1,
      isEditable,
      panelId: panelId || '',
      markerActions: fullMarkerActions,
      trackActions: fullTrackActions,
      reorderActions: reorderActions || {},
    });
  }, [track, isSelected, isMultiSelect, selectedCount, isEditable, panelId, fullMarkerActions, fullTrackActions, reorderActions, openContextMenu]);

  // Compute the effective background style for compare mode
  const effectiveBackgroundStyle = useMemo(() => {
    if (compareColor && compareColor !== 'transparent' && !isSelected && !isDuplicate) {
      return { backgroundColor: compareColor };
    }
    return {};
  }, [compareColor, isSelected, isDuplicate]);

  // Get contributor profile data
  const contributorProfile = useMemo(() => {
    if (!isCollaborative || !track.addedBy) return null;
    const profile = getProfile?.(track.addedBy.id);
    return {
      userId: track.addedBy.id,
      displayName: profile?.displayName ?? track.addedBy.displayName ?? null,
      imageUrl: profile?.imageUrl ?? null,
    };
  }, [isCollaborative, track.addedBy, getProfile]);

  return (
    <div
      ref={setNodeRef}
      style={{ ...gridStyle, ...effectiveBackgroundStyle }}
      className={cn(
        'relative group/row cursor-default',
        !compareColor || compareColor === 'transparent' || isSelected || isDuplicate ? 'bg-card' : '',
        TRACK_GRID_CLASSES,
        isCompact ? 'h-7 ' + TRACK_GRID_CLASSES_COMPACT : 'h-10 ' + TRACK_GRID_CLASSES_NORMAL,
        'border-b border-border transition-colors',
        // Selection and duplicate states
        isSelected && isDuplicate && 'bg-orange-500/30 text-foreground hover:bg-orange-500/40',
        isSelected && !isDuplicate && 'bg-accent/70 text-foreground hover:bg-accent/80',
        !isSelected && isDuplicate && isOtherInstanceSelected && 'bg-orange-500/20 hover:bg-orange-500/30',
        !isSelected && isDuplicate && !isOtherInstanceSelected && 'bg-orange-500/5 hover:bg-orange-500/10',
        !isSelected && !isDuplicate && (!compareColor || compareColor === 'transparent') && 'hover:bg-accent/40 hover:text-foreground',
        // Drag states
        (isDragging || isDragSourceSelected) && dndMode === 'move' && 'opacity-0',
        (isDragging || isDragSourceSelected) && dndMode === 'copy' && 'opacity-50',
      )}
      id={`option-${panelId}-${index}`}
      role="option"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      aria-selected={isSelected}
      title={
        locked
          ? 'Panel is locked - unlock to enable dragging'
          : dndMode === 'copy'
            ? 'Click and drag to copy (Ctrl to move)'
            : 'Click and drag to move (Ctrl to copy)'
      }
      // Only attach drag listeners to row on desktop; on touch devices, use DragHandle
      {...(!locked && !handleOnlyDrag ? { ...attributes, ...listeners } : { ...attributes })}
      // Long-press handlers for mobile multi-select
      {...longPressTouchHandlers}
    >
      {/* Selection indicator - small centered orange dot */}
      {isSelected && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-500 z-10"
          aria-hidden="true"
        />
      )}
      
      {/* Mobile drag handle - only visible on touch devices */}
      {showHandle && (
        <DragHandle
          disabled={locked}
          {...(listeners ? { listeners } : {})}
          isDragging={isDragging}
          isCompact={isCompact}
        />
      )}

      {/* Prefix columns (e.g., match status + custom add button for Last.fm) */}
      {renderPrefixColumns?.()}

      {/* Contributor avatar - only for collaborative playlists */}
      {isCollaborative && (
        <ContributorAvatar
          isCompact={isCompact}
          userId={contributorProfile?.userId}
          displayName={contributorProfile?.displayName}
          imageUrl={contributorProfile?.imageUrl}
        />
      )}

      {/* Play button - only show when player is visible */}
      {shouldShowPlayButton && (
        <PlayPauseButton
          isCompact={isCompact}
          isPlaying={isPlaying}
          isLoading={isPlaybackLoading}
          isLocalFile={isLocalFile}
          onClick={handlePlayClick}
        />
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
        <HeartButton
          isCompact={isCompact}
          isLiked={isLiked}
          isLocalFile={isLocalFile}
          onClick={handleHeartClick}
        />
      ) : (
        <div />
      )}

      {/* Position number */}
      <PositionCell
        isCompact={isCompact}
        index={index}
        position={track.position}
      />

      {/* Track title with inline more button */}
      <TitleCell 
        isCompact={isCompact} 
        track={track}
        moreButton={!showHandle ? (
          <button
            className={cn(
              'shrink-0 flex items-center justify-center rounded',
              'opacity-0 group-hover/row:opacity-100 group-hover/title:opacity-100 focus:opacity-100',
              'bg-muted/80 hover:bg-muted transition-all',
              isCompact ? 'w-6 h-6' : 'w-7 h-7',
            )}
            onClick={handleMoreButtonClick}
            aria-label="More options"
          >
            <MoreHorizontal className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        ) : undefined}
      />

      {/* Artist */}
      <ArtistCell
        isCompact={isCompact}
        track={track}
        onArtistClick={handleArtistClick}
      />

      {/* Album */}
      <AlbumCell
        isCompact={isCompact}
        track={track}
        onAlbumClick={handleAlbumClick}
      />

      {/* Date (release year or scrobble timestamp) */}
      <DateCell
        isCompact={isCompact}
        track={track}
        scrobbleTimestamp={scrobbleTimestamp}
      />

      {/* Popularity bar */}
      <PopularityBar isCompact={isCompact} popularity={track.popularity} />

      {/* Duration */}
      <DurationCell isCompact={isCompact} durationMs={track.durationMs} />

      {/* Cumulative duration */}
      {showCumulativeTime && (
        <CumulativeTimeCell
          isCompact={isCompact}
          cumulativeDurationMs={cumulativeDurationMs}
        />
      )}

      {/* Hour boundary marker */}
      {crossesHourBoundary && (
        <HourBoundaryMarker isCompact={isCompact} hourNumber={hourNumber} />
      )}

      {/* Insertion marker lines */}
      {hasInsertionMarker && <InsertionMarkerLine position="top" />}
      {hasInsertionMarkerAfter && <InsertionMarkerLine position="bottom" />}

      {/* Insertion marker toggle button */}
      {isEditable && !locked && allowInsertionMarkerToggle && nearEdge !== null && (
        <InsertionToggleButton
          isCompact={isCompact}
          edge={nearEdge}
          hasMarker={nearEdge === 'bottom' ? hasInsertionMarkerAfter : hasInsertionMarker}
          rowIndex={index}
          onClick={handleInsertionMarkerToggle}
        />
      )}
    </div>
  );
}
