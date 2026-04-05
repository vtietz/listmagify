/**
 * VirtualizedTrackListContainer component for rendering virtualized track lists.
 * Extracts the virtualization and rendering logic from PlaylistPanel for reusability.
 */

'use client';

import { useCallback, useMemo } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { DropIndicator } from '@features/dnd/ui/DropIndicator';
import { InsertionMarkersOverlay } from './InsertionMarker';
import { TrackContextMenu, type ReorderActions, type TrackActions } from './TrackContextMenu';
import type { MarkerActions } from './context-menu/types';
import {
  buildContextMenuOptionalProps,
  buildPanelMarkerActions,
  renderVirtualizedTrackRow,
  shouldRenderContextMenu,
  shouldRenderInsertionMarkers,
} from './virtualizedTrackListRendering';
import { useContextMenuStore } from '@features/split-editor/stores/useContextMenuStore';
import { useCompactModeStore } from '@features/split-editor/stores/useCompactModeStore';
import { useAutoScrollTextStore } from '@features/split-editor/hooks/useAutoScrollTextStore';
import { useBrowsePanelStore } from '@features/split-editor/browse/hooks/useBrowsePanelStore';
import { useInsertionPointsStore } from '@features/split-editor/playlist/hooks/useInsertionPointsStore';
import { useDeviceType } from '@shared/hooks/useDeviceType';
import { useMobileOverlayStore } from './mobile/MobileBottomNav';
import { useDndStateStore } from '@features/dnd/model/state';
import { usePendingStateStore } from '@features/split-editor/hooks/state';
import { usePendingActions } from '@features/split-editor/hooks/usePendingActions';
import type { MatchCandidate } from '@/lib/matching/providers';
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
  const setDrillDown = useBrowsePanelStore((s) => s.setDrillDown);
  const setProviderId = useBrowsePanelStore((s) => s.setProviderId);
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  const hasActiveMarkersSelector = useInsertionPointsStore((s) => s.hasActiveMarkers);
  const hasAnyMarkersGlobal = hasActiveMarkersSelector();
  const { isPhone, hasTouch, isDesktop } = useDeviceType();
  const setMobileOverlay = useMobileOverlayStore((s) => s.setActiveOverlay);
  const isDndActive = useDndStateStore((s) => s.activeId !== null);
  const pendingForPlaylist = usePendingStateStore((s) => s.byPlaylist[playlistId]?.pending);
  const { cancelPendingById, resolvePendingWithCandidate } = usePendingActions();
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  const showHandle = hasTouch || !isDesktop;
  const handleOnlyDrag = hasTouch;

  const pendingById = useMemo(() => {
    const map = new Map<string, {
      status: 'matching' | 'unresolved' | 'matched' | 'cancelled';
      message?: string;
      candidates?: MatchCandidate[];
      sourceQuery?: string;
      targetProvider?: MusicProviderId;
    }>();
    if (!pendingForPlaylist) return map;
    pendingForPlaylist.forEach((row) => {
      map.set(
        row.tempId,
        {
          status: row.status,
          ...(row.errorMessage ? { message: row.errorMessage } : {}),
          ...(row.candidateOptions?.length ? { candidates: row.candidateOptions } : {}),
          sourceQuery: [row.sourceMeta.title, row.sourceMeta.artists.join(' ')].filter(Boolean).join(' ').trim(),
          targetProvider: row.targetProvider,
        },
      );
    });

    return map;
  }, [pendingForPlaylist]);

  const openBrowsePanelForProvider = useCallback((nextProviderId?: MusicProviderId) => {
    setBrowseActiveTab('browse');
    const providerForBrowse = nextProviderId ?? providerId;
    if (providerForBrowse) {
      setProviderId(providerForBrowse);
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
    setDrillDown,
    togglePoint, hasAnyMarkersGlobal: hasAnyMarkersGlobal, isPhone,
    setMobileOverlay, isDndActive, openContextMenu, setProviderId, showHandle, handleOnlyDrag,
  }), [
    isCompact,
    isAutoScrollEnabled,
    openBrowsePanelForProvider,
    providerId,
    setSearchQuery,
    setSearchFilter,
    setDrillDown,
    togglePoint, hasAnyMarkersGlobal, isPhone, setMobileOverlay,
    isDndActive, openContextMenu, setProviderId, showHandle, handleOnlyDrag,
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
    pendingActions: contextMenu.pendingActions,
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
            pendingById,
            cancelPending: cancelPendingById,
            resolvePending: resolvePendingWithCandidate,
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
