import type { MouseEvent, ReactElement } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { TrackRowInner } from './track-row';
import type { ReorderActions, TrackActions } from './TrackContextMenu';
import type { MarkerActions } from './context-menu/types';
import type { TrackRowSharedContext } from './track-row/types';
import { getPendingIdFromUri } from '@/hooks/pending/state';
import type { Track } from '@/lib/music-provider/types';

/** Build per-row context track actions, merging panel-level base with row-specific duplicate handler */
function buildRowContextActions(
  base: Partial<TrackActions> | undefined,
  onDeleteTrackDuplicates: ((track: Track, position: number) => void | Promise<void>) | undefined,
  track: Track,
  position: number,
  isRowDuplicate: boolean,
): TrackActions | undefined {
  if (!onDeleteTrackDuplicates && !base) return undefined;
  return {
    ...base,
    ...(onDeleteTrackDuplicates && isRowDuplicate
      ? { onDeleteTrackDuplicates: () => onDeleteTrackDuplicates(track, position) }
      : undefined),
  };
}

export function buildPanelMarkerActions(
  hasAnyMarkers: boolean | undefined,
  onAddToAllMarkers: (() => void) | undefined,
): MarkerActions {
  const markerActions: MarkerActions = {};

  if (typeof hasAnyMarkers === 'boolean') {
    markerActions.hasAnyMarkers = hasAnyMarkers;
  }

  if (onAddToAllMarkers) {
    markerActions.onAddToAllMarkers = onAddToAllMarkers;
  }

  return markerActions;
}

export function shouldRenderInsertionMarkers(
  playlistId: string,
  isEditable: boolean,
  activeMarkerIndices: Set<number>,
  searchQuery: string,
  isSorted: boolean,
): boolean {
  if (!playlistId || !isEditable) {
    return false;
  }

  if (activeMarkerIndices.size <= 0) {
    return false;
  }

  if (searchQuery) {
    return false;
  }

  return !isSorted;
}

export function shouldRenderContextMenu(
  isOpen: boolean,
  contextMenuPanelId: string | null | undefined,
  panelId: string,
  hasTrack: boolean,
): boolean {
  if (!isOpen || !hasTrack) {
    return false;
  }

  return contextMenuPanelId === panelId;
}

function resolveTrackIdState(track: Track, getState: (trackId: string) => boolean): boolean {
  if (!track.id) {
    return false;
  }

  return getState(track.id);
}

function resolvePendingId(track: Track): string | null {
  return getPendingIdFromUri(track.uri);
}

interface TrackRowOptionalProps {
  reorderActions?: ReorderActions;
  contextTrackActions?: TrackActions;
}

function buildTrackRowOptionalProps(
  reorderActions: ReorderActions | undefined,
  contextTrackActions: TrackActions | undefined,
): TrackRowOptionalProps {
  const rowOptionalProps: TrackRowOptionalProps = {};

  if (reorderActions) {
    rowOptionalProps.reorderActions = reorderActions;
  }

  if (contextTrackActions) {
    rowOptionalProps.contextTrackActions = contextTrackActions;
  }

  return rowOptionalProps;
}

interface ContextMenuOptionalProps {
  position?: { x: number; y: number };
  reorderActions?: ReorderActions;
  markerActions?: MarkerActions;
  trackActions?: TrackActions;
}

export function buildContextMenuOptionalProps(contextMenu: {
  position: { x: number; y: number } | null;
  reorderActions: ReorderActions | null;
  markerActions: MarkerActions | null;
  trackActions: TrackActions | null;
}): ContextMenuOptionalProps {
  const optionalProps: ContextMenuOptionalProps = {};

  if (contextMenu.position) {
    optionalProps.position = contextMenu.position;
  }

  if (contextMenu.reorderActions) {
    optionalProps.reorderActions = contextMenu.reorderActions;
  }

  if (contextMenu.markerActions) {
    optionalProps.markerActions = contextMenu.markerActions;
  }

  if (contextMenu.trackActions) {
    optionalProps.trackActions = contextMenu.trackActions;
  }

  return optionalProps;
}

interface RenderVirtualizedTrackRowParams {
  panelId: string;
  playlistId: string;
  virtualRow: VirtualItem;
  filteredTracks: Track[];
  selection: Set<string>;
  selectionKey: (track: Track, index: number) => string;
  isEditable: boolean;
  canDrag: boolean;
  dndMode: 'copy' | 'move';
  isDragSource?: boolean | undefined;
  handleTrackSelect: (selectionKey: string, index: number, event: MouseEvent) => void;
  handleTrackClick: (selectionKey: string, index: number) => void;
  isTrackPlaying: (trackId: string) => boolean;
  isTrackLoading: (trackUri: string) => boolean;
  playTrack: (trackUri: string) => void;
  pausePlayback: () => void;
  isPlayingFromThisPanel: boolean;
  isLiked: (trackId: string) => boolean;
  handleToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  allowMarkerToggle: boolean;
  activeMarkerIndices: Set<number>;
  isDuplicate: (trackUri: string) => boolean;
  isSoftDuplicate: ((trackUri: string) => boolean) | undefined;
  isOtherInstanceSelected: (trackUri: string) => boolean;
  getCompareColorForTrack: (trackUri: string) => string | undefined;
  hasMultipleContributors: boolean;
  profileGetter: ((userId: string) => { displayName?: string | null; imageUrl?: string | null } | undefined) | undefined;
  cumulativeDurations: number[];
  hourBoundaries: Map<number, number>;
  panelMarkerActions: MarkerActions;
  buildReorderActions: ((trackPosition: number, playPosition?: number) => ReorderActions) | undefined;
  activePlayPosition: number | undefined;
  contextTrackActions: Partial<TrackActions> | undefined;
  onDeleteTrackDuplicates: ((track: Track, position: number) => void | Promise<void>) | undefined;
  showReleaseYearColumn: boolean;
  showPopularityColumn: boolean;
  sharedCtx: TrackRowSharedContext;
  pendingById: Map<string, { status: 'matching' | 'unresolved' | 'matched' | 'cancelled'; message?: string }>;
}

type VirtualizedRowModel = {
  track: Track;
  index: number;
  trackUri: string;
  trackPosition: number;
  selectionId: string;
  pendingState: { status: 'matching' | 'unresolved' | 'matched' | 'cancelled'; message?: string } | undefined;
  isPendingRow: boolean;
  isRowDuplicate: boolean;
  rowOptionalProps: TrackRowOptionalProps;
};

function getRowContainerStyle(virtualRow: VirtualItem) {
  return {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: `${virtualRow.size}px`,
    transform: `translateY(${virtualRow.start}px)`,
    contain: 'layout style paint' as const,
    contentVisibility: 'auto' as const,
  };
}

function buildVirtualizedRowModel(params: RenderVirtualizedTrackRowParams): VirtualizedRowModel | null {
  const track = params.filteredTracks[params.virtualRow.index];
  if (!track) {
    return null;
  }

  const index = params.virtualRow.index;
  const pendingId = resolvePendingId(track);
  const pendingState = pendingId ? params.pendingById.get(pendingId) : undefined;
  const isPendingRow = Boolean(pendingState && (pendingState.status === 'matching' || pendingState.status === 'unresolved'));
  const selectionId = params.selectionKey(track, index);
  const trackPosition = track.position ?? index;
  const trackUri = track.uri;
  const isRowDuplicate = params.isDuplicate(trackUri);
  const rowContextTrackActions = buildRowContextActions(
    params.contextTrackActions,
    params.onDeleteTrackDuplicates,
    track,
    trackPosition,
    isRowDuplicate,
  );
  const rowReorderActions = params.buildReorderActions
    ? params.buildReorderActions(trackPosition, params.activePlayPosition)
    : undefined;
  const rowOptionalProps = buildTrackRowOptionalProps(rowReorderActions, rowContextTrackActions);

  return {
    track,
    index,
    trackUri,
    trackPosition,
    selectionId,
    pendingState,
    isPendingRow,
    isRowDuplicate,
    rowOptionalProps,
  };
}

function buildTrackRowHandlers(
  isPendingRow: boolean,
  handleTrackSelect: RenderVirtualizedTrackRowParams['handleTrackSelect'],
  handleTrackClick: RenderVirtualizedTrackRowParams['handleTrackClick'],
) {
  if (isPendingRow) {
    return {
      onSelect: () => {},
      onClick: () => {},
    };
  }

  return {
    onSelect: handleTrackSelect,
    onClick: handleTrackClick,
  };
}

function isRowLocked(canDrag: boolean, isPendingRow: boolean): boolean {
  return !canDrag || isPendingRow;
}

function isDragSourceSelected(
  isDragSource: boolean | undefined,
  selection: Set<string>,
  selectionId: string,
): boolean {
  return Boolean(isDragSource && selection.has(selectionId));
}

function resolveMarkerProps(
  allowMarkerToggle: boolean,
  activeMarkerIndices: Set<number>,
  trackPosition: number,
): { hasInsertionMarker: boolean; hasInsertionMarkerAfter: boolean } {
  return {
    hasInsertionMarker: allowMarkerToggle && activeMarkerIndices.has(trackPosition),
    hasInsertionMarkerAfter: allowMarkerToggle && activeMarkerIndices.has(trackPosition + 1),
  };
}

function resolveSoftDuplicate(
  isSoftDuplicate: ((trackUri: string) => boolean) | undefined,
  trackUri: string,
): boolean {
  if (!isSoftDuplicate) {
    return false;
  }

  return isSoftDuplicate(trackUri);
}

function resolvePendingStatus(
  pendingState: VirtualizedRowModel['pendingState'],
): 'matching' | 'unresolved' | undefined {
  if (pendingState?.status === 'unresolved') {
    return 'unresolved';
  }

  if (pendingState?.status === 'matching') {
    return 'matching';
  }

  return undefined;
}

function buildTrackRowInnerProps(
  params: RenderVirtualizedTrackRowParams,
  rowModel: VirtualizedRowModel,
  onSelect: RenderVirtualizedTrackRowParams['handleTrackSelect'] | (() => void),
  onClick: RenderVirtualizedTrackRowParams['handleTrackClick'] | (() => void),
): React.ComponentProps<typeof TrackRowInner> {
  const markerProps = resolveMarkerProps(params.allowMarkerToggle, params.activeMarkerIndices, rowModel.trackPosition);

  return {
    ctx: params.sharedCtx,
    track: rowModel.track,
    index: rowModel.index,
    selectionKey: rowModel.selectionId,
    isSelected: params.selection.has(rowModel.selectionId),
    isEditable: params.isEditable,
    locked: isRowLocked(params.canDrag, rowModel.isPendingRow),
    panelId: params.panelId,
    playlistId: params.playlistId,
    dndMode: params.dndMode,
    isDragSourceSelected: isDragSourceSelected(params.isDragSource, params.selection, rowModel.selectionId),
    onSelect,
    onClick,
    isMultiSelect: params.selection.size > 1,
    selectedCount: params.selection.size,
    isPlaying: resolveTrackIdState(rowModel.track, params.isTrackPlaying),
    isPlaybackLoading: params.isTrackLoading(rowModel.trackUri),
    onPlay: params.playTrack,
    onPause: params.pausePlayback,
    isPlayingFromThisPanel: params.isPlayingFromThisPanel,
    showLikedColumn: true,
    showReleaseYearColumn: params.showReleaseYearColumn,
    showPopularityColumn: params.showPopularityColumn,
    isLiked: resolveTrackIdState(rowModel.track, params.isLiked),
    onToggleLiked: params.handleToggleLiked,
    hasInsertionMarker: markerProps.hasInsertionMarker,
    hasInsertionMarkerAfter: markerProps.hasInsertionMarkerAfter,
    allowInsertionMarkerToggle: params.allowMarkerToggle,
    isDuplicate: rowModel.isRowDuplicate,
    isSoftDuplicate: resolveSoftDuplicate(params.isSoftDuplicate, rowModel.trackUri),
    isOtherInstanceSelected: params.isOtherInstanceSelected(rowModel.trackUri),
    compareColor: params.getCompareColorForTrack(rowModel.trackUri),
    isCollaborative: params.hasMultipleContributors,
    getProfile: params.profileGetter,
    cumulativeDurationMs: params.cumulativeDurations[rowModel.index] || 0,
    crossesHourBoundary: params.hourBoundaries.has(rowModel.index),
    hourNumber: params.hourBoundaries.get(rowModel.index) || 0,
    markerActions: params.panelMarkerActions,
    pendingStatus: resolvePendingStatus(rowModel.pendingState),
    pendingMessage: rowModel.pendingState?.message,
    ...rowModel.rowOptionalProps,
  };
}

export function renderVirtualizedTrackRow(params: RenderVirtualizedTrackRowParams): ReactElement | null {
  const rowModel = buildVirtualizedRowModel(params);
  if (!rowModel) {
    return null;
  }
  const { onSelect, onClick } = buildTrackRowHandlers(
    rowModel.isPendingRow,
    params.handleTrackSelect,
    params.handleTrackClick,
  );
  const trackRowInnerProps = buildTrackRowInnerProps(params, rowModel, onSelect, onClick);

  return (
    <div
      key={`${params.panelId}-${rowModel.selectionId}`}
      style={getRowContainerStyle(params.virtualRow)}
    >
      <TrackRowInner {...trackRowInnerProps} />
    </div>
  );
}
