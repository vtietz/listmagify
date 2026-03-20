/**
 * VirtualizedTrackListContainer component for rendering virtualized track lists.
 * Extracts the virtualization and rendering logic from PlaylistPanel for reusability.
 */

'use client';

import { useCallback, useMemo, type MouseEvent, type ReactElement } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { DropIndicator } from './DropIndicator';
import { InsertionMarkersOverlay } from './InsertionMarker';
import { TrackRowInner } from './track-row';
import { TrackContextMenu, type ReorderActions, type TrackActions } from './TrackContextMenu';
import type { MarkerActions } from './context-menu/types';
import type { TrackRowSharedContext } from './track-row/types';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useAutoScrollTextStore } from '@/hooks/useAutoScrollTextStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useMobileOverlayStore } from './mobile/MobileBottomNav';
import { useDndStateStore } from '@/hooks/dnd/state';
import type { Track, MusicProviderId } from '@/lib/music-provider/types';

interface VirtualizedTrackListContainerProps {
  /** Unique identifier for this panel */
  panelId: string;
  /** Playlist ID for mutations and insertion points */
  playlistId: string;
  /** Whether the panel is editable */
  isEditable: boolean;
  /** Whether drag is allowed from this panel */
  canDrag: boolean;
  /** DnD mode (copy or move) */
  dndMode: 'copy' | 'move';
  /** Whether this panel is the source of an active drag */
  isDragSource?: boolean | undefined;
  /** Search query (used to disable markers during search) */
  searchQuery: string;
  /** Whether the list is sorted (used to disable markers during sort) */
  isSorted: boolean;
  /** Total height of the virtualized list */
  totalSize: number;
  /** Row height for positioning */
  rowHeight: number;
  /** Virtual items to render */
  virtualItems: VirtualItem[];
  /** Filtered tracks being displayed */
  filteredTracks: Track[];
  /** Set of selection IDs that are selected */
  selection: Set<string>;
  /** Set of active insertion marker indices */
  activeMarkerIndices: Set<number>;
  /** Whether the playlist has multiple contributors */
  hasMultipleContributors: boolean;
  /** Map of index -> hour number for hour boundaries */
  hourBoundaries: Map<number, number>;
  /** Array of cumulative durations per track */
  cumulativeDurations: number[];
  /** Function to generate a selection key for a track */
  selectionKey: (track: Track, index: number) => string;
  /** Function to check if a track is liked */
  isLiked: (trackId: string) => boolean;
  /** Function to check if a track is currently playing */
  isTrackPlaying: (trackId: string) => boolean;
  /** Function to check if a track is loading for playback */
  isTrackLoading: (trackUri: string) => boolean;
  /** Function to check if a track URI is a real duplicate (same ID) */
  isDuplicate: (trackUri: string) => boolean;
  /** Function to check if a track URI is a soft duplicate (same title/artist/duration) */
  isSoftDuplicate?: (trackUri: string) => boolean;
  /** Function to check if another instance of a duplicate is selected */
  isOtherInstanceSelected: (trackUri: string) => boolean;
  /** Function to get compare mode color for a track */
  getCompareColorForTrack: (trackUri: string) => string | undefined;
  /** Function to get cached user profile */
  getProfile?: (userId: string) => { displayName?: string | null; imageUrl?: string | null } | undefined;
  /** Handler for track selection */
  handleTrackSelect: (selectionKey: string, index: number, event: React.MouseEvent) => void;
  /** Handler for track click */
  handleTrackClick: (selectionKey: string, index: number) => void;
  /** Handler for toggling liked status */
  handleToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  /** Handler to play a track */
  playTrack: (trackUri: string) => void;
  /** Handler to pause playback */
  pausePlayback: () => void;
  /** Playback context to determine if track is playing from this panel */
  playbackContext?: { sourceId?: string; playlistId?: string } | null;
  /** Optional handler to delete duplicates of a specific track */
  onDeleteTrackDuplicates?: (track: Track, position: number) => void | Promise<void>;
  /** Optional track actions for context menu (e.g., remove from playlist) */
  contextTrackActions?: Partial<TrackActions>;
  /** Optional handler to add selected tracks to all markers */
  onAddToAllMarkers?: () => void;
  /** Whether there are any active insertion markers */
  hasAnyMarkers?: boolean;
  /** Build reorder actions for a track at given position */
  buildReorderActions?: (trackPosition: number, playPosition?: number) => ReorderActions;
  /** Current playing track position for playback-aware reorder actions */
  activePlayPosition?: number;
  /** Whether to show release year/date column */
  showReleaseYearColumn?: boolean;
  /** Whether to show popularity column */
  showPopularityColumn?: boolean;
  /** Music provider ID for this panel (used to set browse panel provider) */
  providerId?: MusicProviderId;
}

// ── Helpers ────────────────────────────────────────────────────────────

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

function buildPanelMarkerActions(
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

function shouldRenderInsertionMarkers(
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

function shouldRenderContextMenu(
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

function buildContextMenuOptionalProps(contextMenu: {
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
}

function renderVirtualizedTrackRow(params: RenderVirtualizedTrackRowParams): ReactElement | null {
  const track = params.filteredTracks[params.virtualRow.index];
  if (!track) {
    return null;
  }

  const index = params.virtualRow.index;
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

  return (
    <div
      key={`${params.panelId}-${selectionId}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${params.virtualRow.size}px`,
        transform: `translateY(${params.virtualRow.start}px)`,
        contain: 'layout style paint',
        contentVisibility: 'auto',
      }}
    >
      <TrackRowInner
        ctx={params.sharedCtx}
        track={track}
        index={index}
        selectionKey={selectionId}
        isSelected={params.selection.has(selectionId)}
        isEditable={params.isEditable}
        locked={!params.canDrag}
        panelId={params.panelId}
        playlistId={params.playlistId}
        dndMode={params.dndMode}
        isDragSourceSelected={Boolean(params.isDragSource && params.selection.has(selectionId))}
        onSelect={params.handleTrackSelect}
        onClick={params.handleTrackClick}
        isMultiSelect={params.selection.size > 1}
        selectedCount={params.selection.size}
        isPlaying={resolveTrackIdState(track, params.isTrackPlaying)}
        isPlaybackLoading={params.isTrackLoading(trackUri)}
        onPlay={params.playTrack}
        onPause={params.pausePlayback}
        isPlayingFromThisPanel={params.isPlayingFromThisPanel}
        showLikedColumn
        showReleaseYearColumn={params.showReleaseYearColumn}
        showPopularityColumn={params.showPopularityColumn}
        isLiked={resolveTrackIdState(track, params.isLiked)}
        onToggleLiked={params.handleToggleLiked}
        hasInsertionMarker={params.allowMarkerToggle && params.activeMarkerIndices.has(trackPosition)}
        hasInsertionMarkerAfter={params.allowMarkerToggle && params.activeMarkerIndices.has(trackPosition + 1)}
        allowInsertionMarkerToggle={params.allowMarkerToggle}
        isDuplicate={isRowDuplicate}
        isSoftDuplicate={params.isSoftDuplicate ? params.isSoftDuplicate(trackUri) : false}
        isOtherInstanceSelected={params.isOtherInstanceSelected(trackUri)}
        compareColor={params.getCompareColorForTrack(trackUri)}
        isCollaborative={params.hasMultipleContributors}
        getProfile={params.profileGetter}
        cumulativeDurationMs={params.cumulativeDurations[index] || 0}
        crossesHourBoundary={params.hourBoundaries.has(index)}
        hourNumber={params.hourBoundaries.get(index) || 0}
        markerActions={params.panelMarkerActions}
        {...rowOptionalProps}
      />
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export function VirtualizedTrackListContainer({
  panelId,
  playlistId,
  isEditable,
  canDrag,
  dndMode,
  isDragSource,
  searchQuery,
  isSorted,
  totalSize,
  rowHeight,
  virtualItems,
  filteredTracks,
  selection,
  activeMarkerIndices,
  hasMultipleContributors,
  hourBoundaries,
  cumulativeDurations,
  selectionKey,
  isLiked,
  isTrackPlaying,
  isTrackLoading,
  isDuplicate,
  isSoftDuplicate,
  isOtherInstanceSelected,
  getCompareColorForTrack,
  getProfile,
  handleTrackSelect,
  handleTrackClick,
  handleToggleLiked,
  playTrack,
  pausePlayback,
  playbackContext,
  onDeleteTrackDuplicates,
  contextTrackActions,
  onAddToAllMarkers,
  hasAnyMarkers,
  buildReorderActions,
  activePlayPosition,
  showReleaseYearColumn = true,
  showPopularityColumn = true,
  providerId,
}: VirtualizedTrackListContainerProps) {
  // ── Context menu (global store) ──────────────────────────────────────
  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);

  // ── Shared store subscriptions (once per panel, not per row) ─────────
  // Every TrackRow previously created ~10 Zustand/externalStore
  // subscriptions for values identical across all rows.
  const isCompact = useCompactModeStore((s) => s.isCompact);
  const isAutoScrollEnabled = useAutoScrollTextStore((s) => s.isEnabled);
  const openBrowsePanel = useBrowsePanelStore((s) => s.open);
  const setBrowseActiveTab = useBrowsePanelStore((s) => s.setActiveTab);
  const setSearchQuery = useBrowsePanelStore((s) => s.setSearchQuery);
  const setSearchFilter = useBrowsePanelStore((s) => s.setSearchFilter);
  const setProviderId = useBrowsePanelStore((s) => s.setProviderId);
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  const hasActiveMarkersSelector = useInsertionPointsStore((s) => s.hasActiveMarkers);
  const hasAnyMarkersGlobal = hasActiveMarkersSelector();
  const { isPhone, hasTouch, isDesktop } = useDeviceType();
  const setMobileOverlay = useMobileOverlayStore((s) => s.setActiveOverlay);
  const isDndActive = useDndStateStore((s) => s.activeId !== null);
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  const showHandle = hasTouch || !isDesktop;
  const handleOnlyDrag = hasTouch;

  const openBrowsePanelForProvider = useCallback(() => {
    setBrowseActiveTab('browse');
    if (providerId) {
      setProviderId(providerId);
    }
    openBrowsePanel();
  }, [setBrowseActiveTab, openBrowsePanel, providerId, setProviderId]);

  // Stable values computed once, not per row
  const allowMarkerToggle = !searchQuery && !isSorted;
  const isPlayingFromThisPanel = playbackContext?.sourceId === panelId;
  const profileGetter = hasMultipleContributors ? getProfile : undefined;

  const panelMarkerActions: MarkerActions = useMemo(
    () => buildPanelMarkerActions(hasAnyMarkers, onAddToAllMarkers),
    [hasAnyMarkers, onAddToAllMarkers],
  );

  const sharedCtx = useMemo(() => ({
    isCompact,
    isAutoScrollEnabled,
    openBrowsePanel: openBrowsePanelForProvider,
    providerId: providerId ?? 'spotify',
    setSearchQuery,
    setSearchFilter,
    togglePoint, hasAnyMarkersGlobal: hasAnyMarkersGlobal, isPhone,
    setMobileOverlay, isDndActive, openContextMenu, showHandle, handleOnlyDrag,
  }), [
    isCompact,
    isAutoScrollEnabled,
    openBrowsePanelForProvider,
    providerId,
    setSearchQuery,
    setSearchFilter,
    togglePoint, hasAnyMarkersGlobal, isPhone, setMobileOverlay,
    isDndActive, openContextMenu, showHandle, handleOnlyDrag,
  ]);

  const showInsertionMarkers = shouldRenderInsertionMarkers(
    playlistId,
    isEditable,
    activeMarkerIndices,
    searchQuery,
    isSorted,
  );

  const shouldShowContextMenu = shouldRenderContextMenu(
    contextMenu.isOpen,
    contextMenu.panelId,
    panelId,
    Boolean(contextMenu.track),
  );

  const contextMenuOptionalProps = buildContextMenuOptionalProps({
    position: contextMenu.position,
    reorderActions: contextMenu.reorderActions,
    markerActions: contextMenu.markerActions,
    trackActions: contextMenu.trackActions,
  });

  return (
    <>
      <div
        style={{
          height: `${totalSize}px`,
          position: 'relative',
        }}
      >
        {/* Visual drop indicator line */}
        <DropIndicator
          panelId={panelId}
          filteredTracksCount={filteredTracks.length}
        />

        {/* Insertion point markers — hidden when sorted since positions don't match visual order */}
        {showInsertionMarkers && (
          <InsertionMarkersOverlay
            playlistId={playlistId}
            totalTracks={filteredTracks.length}
            rowHeight={rowHeight}
            showToggles={!isDragSource}
            activeIndices={activeMarkerIndices}
          />
        )}

        {virtualItems.map((virtualRow) => {
          return renderVirtualizedTrackRow({
            panelId,
            playlistId,
            virtualRow,
            filteredTracks,
            selection,
            selectionKey,
            isEditable,
            canDrag,
            dndMode,
            isDragSource,
            handleTrackSelect,
            handleTrackClick,
            isTrackPlaying,
            isTrackLoading,
            playTrack,
            pausePlayback,
            isPlayingFromThisPanel,
            isLiked,
            handleToggleLiked,
            allowMarkerToggle,
            activeMarkerIndices,
            isDuplicate,
            isSoftDuplicate,
            isOtherInstanceSelected,
            getCompareColorForTrack,
            hasMultipleContributors,
            profileGetter,
            cumulativeDurations,
            hourBoundaries,
            panelMarkerActions,
            buildReorderActions,
            activePlayPosition,
            contextTrackActions,
            onDeleteTrackDuplicates,
            showReleaseYearColumn,
            showPopularityColumn,
            sharedCtx,
          });
        })}
      </div>

      {/* Global context menu for this panel */}
      {shouldShowContextMenu && contextMenu.track && (
        <TrackContextMenu
          track={contextMenu.track}
          isOpen
          onClose={closeContextMenu}
          {...contextMenuOptionalProps}
          isMultiSelect={contextMenu.isMultiSelect}
          selectedCount={contextMenu.selectedCount}
          isEditable={contextMenu.isEditable}
        />
      )}
    </>
  );
}
