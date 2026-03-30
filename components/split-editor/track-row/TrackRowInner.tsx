'use client';

import React, { memo } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { useInsertionMarkerToggle } from '@features/split-editor/playlist/hooks/useInsertionMarkerToggle';
import { useRowSortable } from '@features/dnd/useRowSortable';
import { buildRowClassNames } from './style';
import { useTrackRowComputed } from './hooks/useTrackRowComputed';
import { useContextMenuActions } from './hooks/useContextMenuActions';
import { useTrackRowHandlers } from './hooks/useTrackRowHandlers';
import type { TrackRowInnerProps } from './types';
import { RowWrapper } from './view/RowWrapper';
import { TrackRowView } from './view/TrackRowView';

function buildTitle(
  locked: boolean,
  dndMode: 'move' | 'copy',
  pendingStatus?: 'matching' | 'unresolved' | undefined,
  pendingMessage?: string | undefined,
): string {
  if (pendingStatus === 'unresolved') {
    return pendingMessage ?? 'Match unresolved';
  }

  if (pendingStatus === 'matching') {
    return pendingMessage ?? 'Matching track…';
  }

  if (locked) return 'Panel is locked - unlock to enable dragging';
  if (dndMode === 'copy') return 'Click and drag to copy (Ctrl to move)';
  return 'Click and drag to move (Ctrl to copy)';
}

function buildMouseHandlers(
  isDndActive: boolean,
  handleMouseMove: React.MouseEventHandler,
  handleMouseLeave: React.MouseEventHandler,
): Record<string, React.MouseEventHandler> {
  if (isDndActive) return {};
  return { onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave };
}

function SelectionIndicator({ isSelected }: { isSelected: boolean }) {
  if (!isSelected) return null;
  return (
    <div
      className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-500 z-10"
      aria-hidden="true"
    />
  );
}

const TRACK_ROW_INNER_DEFAULTS = {
  dndMode: 'copy' as const,
  locked: false,
  isDragSourceSelected: false,
  showLikedColumn: true,
  isLiked: false,
  isPlaying: false,
  isPlaybackLoading: false,
  isPlayingFromThisPanel: true,
  hasInsertionMarker: false,
  hasInsertionMarkerAfter: false,
  isCollaborative: false,
  cumulativeDurationMs: 0,
  crossesHourBoundary: false,
  hourNumber: 0,
  allowInsertionMarkerToggle: true,
  showMatchStatusColumn: false,
  showCustomAddColumn: false,
  showScrobbleDateColumn: false,
  showReleaseYearColumn: true,
  showPopularityColumn: true,
  showCumulativeTime: true,
  isDuplicate: false,
  isSoftDuplicate: false,
  isOtherInstanceSelected: false,
  isMultiSelect: false,
  selectedCount: 1,
};

type TrackRowInnerResolvedProps = Omit<TrackRowInnerProps, keyof typeof TRACK_ROW_INNER_DEFAULTS>
  & typeof TRACK_ROW_INNER_DEFAULTS;

function resolveTrackRowInnerProps(props: TrackRowInnerProps): TrackRowInnerResolvedProps {
  return {
    ...TRACK_ROW_INNER_DEFAULTS,
    ...props,
  } as TrackRowInnerResolvedProps;
}

function TrackRowInnerComponent(props: TrackRowInnerProps) {
  const {
  track,
  index,
  selectionKey,
  isSelected,
  isEditable,
  locked,
  onSelect,
  onClick,
  panelId,
  playlistId,
  dndMode,
  isDragSourceSelected,
  showLikedColumn,
  isLiked,
  onToggleLiked,
  isPlaying,
  isPlaybackLoading,
  onPlay,
  onPause,
  isPlayingFromThisPanel,
  hasInsertionMarker,
  hasInsertionMarkerAfter,
  isCollaborative,
  getProfile,
  cumulativeDurationMs,
  crossesHourBoundary,
  hourNumber,
  allowInsertionMarkerToggle,
  renderPrefixColumns,
  showMatchStatusColumn,
  showCustomAddColumn,
  scrobbleTimestamp,
  showScrobbleDateColumn,
  showReleaseYearColumn,
  showPopularityColumn,
  showCumulativeTime,
  isDuplicate,
  isSoftDuplicate,
  isOtherInstanceSelected,
  compareColor,
  reorderActions,
  markerActions,
  contextTrackActions,
  isMultiSelect,
  selectedCount,
  selectedTracks,
  pendingStatus,
  pendingMessage,
  ctx,
  } = resolveTrackRowInnerProps(props);

  const {
    isCompact,
    isAutoScrollEnabled,
    openBrowsePanel,
    providerId,
    setSearchQuery,
    setSearchFilter,
    togglePoint,
    hasAnyMarkersGlobal,
    isPhone,
    setMobileOverlay,
    isDndActive,
    openContextMenu,
    setDrillDown,
    setProviderId,
    showHandle,
    handleOnlyDrag,
  } = ctx;

  const { isDragging, setNodeRef, attributes, listeners } = useRowSortable({
    track,
    index,
    panelId,
    playlistId,
    providerId,
    disabled: locked,
    selectedTracks,
    trackPayload: props.trackPayload,
    selectedTrackPayloads: props.selectedTrackPayloads,
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
    showReleaseYearColumn,
    showPopularityColumn,
    showCumulativeTime,
    showHandle,
    isCompact,
    providerId,
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
    providerId,
    setSearchQuery,
    setSearchFilter,
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
    providerId,
    setSearchQuery,
    setSearchFilter,
    openBrowsePanel,
    ...(setDrillDown ? { setDrillDown } : {}),
    setProviderId,
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
    ...(props.pendingActions ? { pendingActions: props.pendingActions } : {}),
    disableContextMenu: pendingStatus === 'matching',
  });

  const className = buildRowClassNames({
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
  });

  const title = buildTitle(locked, dndMode, pendingStatus, pendingMessage);

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
      {...buildMouseHandlers(isDndActive, handleMouseMove, handleMouseLeave)}
      onContextMenu={handleContextMenu}
      longPressTouchHandlers={longPressTouchHandlers}
      showHandle={showHandle}
    >
      <SelectionIndicator isSelected={isSelected} />

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
        showReleaseYearColumn={showReleaseYearColumn}
        showPopularityColumn={showPopularityColumn}
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
        pendingStatus={pendingStatus}
        pendingMessage={pendingMessage}
        onRemovePending={props.onRemovePending}
      />
    </RowWrapper>
  );
}

export const TrackRowInner = memo(TrackRowInnerComponent);
