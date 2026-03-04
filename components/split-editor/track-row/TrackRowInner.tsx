'use client';

import { memo, useMemo } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { useInsertionMarkerToggle } from '@/hooks/useInsertionMarkerToggle';
import { useRowSortable } from '@/hooks/useRowSortable';
import { buildRowClassNames } from './style';
import { useTrackRowComputed } from './hooks/useTrackRowComputed';
import { useContextMenuActions } from './hooks/useContextMenuActions';
import { useTrackRowHandlers } from './hooks/useTrackRowHandlers';
import type { TrackRowInnerProps } from './types';
import { RowWrapper } from './view/RowWrapper';
import { TrackRowView } from './view/TrackRowView';

function TrackRowInnerComponent({
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
  isPlayingFromThisPanel = true,
  hasInsertionMarker = false,
  hasInsertionMarkerAfter = false,
  isCollaborative = false,
  getProfile,
  cumulativeDurationMs = 0,
  crossesHourBoundary = false,
  hourNumber = 0,
  allowInsertionMarkerToggle = true,
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
  isSoftDuplicate = false,
  isOtherInstanceSelected = false,
  compareColor,
  reorderActions,
  markerActions,
  contextTrackActions,
  isMultiSelect = false,
  selectedCount = 1,
  selectedTracks,
  ctx,
}: TrackRowInnerProps) {
  const {
    isCompact,
    isAutoScrollEnabled,
    openBrowsePanel,
    setSearchQuery,
    togglePoint,
    hasAnyMarkersGlobal,
    isPhone,
    setMobileOverlay,
    isDndActive,
    openContextMenu,
    showHandle,
    handleOnlyDrag,
  } = ctx;

  const { isDragging, setNodeRef, attributes, listeners } = useRowSortable({
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

  const {
    nearEdge,
    handleMouseMove,
    handleMouseLeave,
    handleInsertionMarkerToggle,
  } = useInsertionMarkerToggle({
    playlistId,
    isEditable,
    locked,
    allowToggle: allowInsertionMarkerToggle && !isDndActive,
    trackPosition: track.position ?? index,
    visualIndex: index,
    togglePoint,
  });

  const {
    shouldShowPlayButton,
    showStandardAddColumn,
    isLocalFile,
    isAnyDuplicate,
    trackPosition,
    gridStyle,
    effectiveBackgroundStyle,
    contributorProfile,
  } = useTrackRowComputed({
    track,
    index,
    isSelected,
    isDuplicate,
    isSoftDuplicate,
    compareColor,
    showCustomAddColumn,
    showMatchStatusColumn,
    showScrobbleDateColumn,
    showCumulativeTime,
    showHandle,
    isCompact,
    isCollaborative,
    getProfile,
  });

  const { fullTrackActions, fullMarkerActions } = useContextMenuActions({
    track,
    isPlaying,
    isLiked,
    contextTrackActions,
    markerActions,
    onPlay,
    onPause,
    onToggleLiked,
    setSearchQuery,
    openBrowsePanel,
    hasAnyMarkers: hasAnyMarkersGlobal,
    hasInsertionMarker,
    hasInsertionMarkerAfter,
    playlistId,
    isEditable,
    trackPosition,
    togglePoint,
  });

  const {
    longPressTouchHandlers,
    handleArtistClick,
    handleAlbumClick,
    handleClick,
    handleMouseDown,
    handleHeartClick,
    handlePlayClick,
    handleContextMenu,
    handleMoreButtonClick,
  } = useTrackRowHandlers({
    track,
    index,
    selectionKey,
    onSelect,
    onClick,
    showHandle,
    isMultiSelect,
    onToggleLiked,
    isLiked,
    isPlaying,
    onPlay,
    onPause,
    setSearchQuery,
    openBrowsePanel,
    isPhone,
    setMobileOverlay,
    openContextMenu,
    isSelected,
    selectedCount,
    isEditable,
    panelId,
    fullMarkerActions,
    fullTrackActions,
    reorderActions,
  });

  const className = useMemo(
    () =>
      buildRowClassNames({
        compareColor,
        isSelected,
        isAnyDuplicate,
        isDuplicate,
        isSoftDuplicate,
        isOtherInstanceSelected,
        isCompact,
        isDragging,
        isDragSourceSelected,
        dndMode,
      }),
    [
      compareColor,
      isSelected,
      isAnyDuplicate,
      isDuplicate,
      isSoftDuplicate,
      isOtherInstanceSelected,
      isCompact,
      isDragging,
      isDragSourceSelected,
      dndMode,
    ],
  );

  const title = locked
    ? 'Panel is locked - unlock to enable dragging'
    : dndMode === 'copy'
      ? 'Click and drag to copy (Ctrl to move)'
      : 'Click and drag to move (Ctrl to copy)';

  return (
    <RowWrapper
      setNodeRef={setNodeRef}
      style={{ ...gridStyle, ...effectiveBackgroundStyle }}
      className={className}
      id={`option-${panelId}-${index}`}
      isSelected={isSelected}
      title={title}
      locked={locked}
      handleOnlyDrag={handleOnlyDrag}
      dragAttributes={attributes as DraggableAttributes}
      dragListeners={listeners as SyntheticListenerMap | undefined}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      {...(!isDndActive ? { onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave } : {})}
      onContextMenu={handleContextMenu}
      longPressTouchHandlers={longPressTouchHandlers}
      showHandle={showHandle}
    >
      {isSelected && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-500 z-10"
          aria-hidden="true"
        />
      )}

      <TrackRowView
        track={track}
        index={index}
        isEditable={isEditable}
        locked={locked}
        showHandle={showHandle}
        isDragging={isDragging}
        isCompact={isCompact}
        isCollaborative={isCollaborative}
        shouldShowPlayButton={shouldShowPlayButton}
        showStandardAddColumn={showStandardAddColumn}
        showLikedColumn={showLikedColumn}
        isLiked={isLiked}
        isLocalFile={isLocalFile}
        isPlaying={isPlaying}
        isPlaybackLoading={isPlaybackLoading}
        isPlayingFromThisPanel={isPlayingFromThisPanel}
        isAutoScrollEnabled={isAutoScrollEnabled}
        renderPrefixColumns={renderPrefixColumns}
        contributorProfile={contributorProfile}
        scrobbleTimestamp={scrobbleTimestamp}
        showCumulativeTime={showCumulativeTime}
        cumulativeDurationMs={cumulativeDurationMs}
        crossesHourBoundary={crossesHourBoundary}
        hourNumber={hourNumber}
        playlistId={playlistId}
        hasInsertionMarker={hasInsertionMarker}
        hasInsertionMarkerAfter={hasInsertionMarkerAfter}
        allowInsertionMarkerToggle={allowInsertionMarkerToggle}
        nearEdge={nearEdge}
        onToggleInsertionMarker={handleInsertionMarkerToggle}
        onHeartClick={handleHeartClick}
        onPlayClick={handlePlayClick}
        onMoreButtonClick={handleMoreButtonClick}
        onArtistClick={handleArtistClick}
        onAlbumClick={handleAlbumClick}
        dragListeners={listeners as SyntheticListenerMap | undefined}
      />
    </RowWrapper>
  );
}

export const TrackRowInner = memo(TrackRowInnerComponent);
