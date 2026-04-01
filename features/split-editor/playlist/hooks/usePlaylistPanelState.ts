/**
 * Custom hook that encapsulates all state and logic for PlaylistPanel.
 * 
 * Refactored to compose smaller, focused hooks for better testability and maintainability.
 * This orchestrator assembles outputs from subhooks while preserving the existing public API.
 */

'use no memo';

import { useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePanelStoreBindings,
  usePlaylistDataSource,
  usePlaylistMetaPermissions,
  useLastfmConfig,
  useDroppableScroll,
  useDndModePreview,
  useFilteringAndSorting,
  useSelectionManagement,
  useInsertionMarkers,
  useDuplicates,
  useCompareModeIntegration,
  useContributorsPrefetch,
  useCumulativeDurations,
  usePlaybackControls,
  useVirtualizerState,
  usePlaylistEvents,
  useAutoReload,
  usePanelScrollSync,
  flushAllPanelScrollPositions,
  usePlaylistMutations,
} from './panel';
import { toPendingTrackUri, usePendingStateStore } from '@features/split-editor/hooks/state';
import type { PendingTrack } from '@features/split-editor/hooks/state';
import type { Track } from '@/lib/music-provider/types';

const EMPTY_PENDING_TRACKS: PendingTrack[] = [];

interface UsePlaylistPanelStateProps {
  panelId: string;
  isDragSource?: boolean | undefined;
}

export function usePlaylistPanelState({ panelId, isDragSource }: UsePlaylistPanelStateProps) {
  const queryClient = useQueryClient();

  // --- Store bindings and panel operations ---
  // Note: We need dndMode early but it depends on canMove which depends on isEditable
  // So we get storedDndMode first, then compute the preview later
  const storeBindings = usePanelStoreBindings(panelId, 'copy'); // placeholder, will use actual dndMode below
  const {
    panel: _panel,
    panelCount,
    providerId,
    playlistId,
    searchQuery,
    selection,
    locked,
    sortKey,
    sortDirection,
    storedDndMode,
    scrollOffset,
    setSelection,
    toggleSelection,
    setScroll,
    setSort,
    loadPlaylist,
    setSortKey,
    setSortDirection,
    setPanelDnDMode,
    handleSearchChange,
    handleReload,
    handleClose,
    handleSplitHorizontal,
    handleSplitVertical,
    handleLockToggle,
    handleLoadPlaylist,
    handleProviderChange,
    handleSort,
  } = storeBindings;

  // --- Data source (tracks, loading, error) ---
  const dataSource = usePlaylistDataSource(playlistId, providerId);
  const {
    tracks,
    snapshotId,
    isLoading,
    isAutoLoading,
    isReloading,
    hasLoadedAll: _hasLoadedAll,
    error,
    dataUpdatedAt,
    isLikedPlaylist,
    isLiked,
    toggleLiked,
  } = dataSource;

  const pendingForPlaylist = usePendingStateStore(
    (state) => (playlistId ? state.byPlaylist[playlistId]?.pending : undefined),
  );

  const tracksWithPending = useMemo(() => {
    const pendingRows = pendingForPlaylist ?? EMPTY_PENDING_TRACKS;

    if (!playlistId || pendingRows.length === 0) {
      return tracks;
    }

    const activePending = pendingRows.filter(
      (pending) =>
        !pending.hidden
        && (pending.status === 'matching' || pending.status === 'unresolved'),
    );

    if (activePending.length === 0) {
      return tracks;
    }

    const existingUris = new Set(tracks.map((track) => track.uri));
    const syntheticPending: Array<{ track: Track; position: number }> = activePending
      .filter((pending) => !existingUris.has(toPendingTrackUri(pending.tempId)))
      .map((pending) => ({
        position: pending.position,
        track: {
          id: null,
          uri: toPendingTrackUri(pending.tempId),
          name: pending.sourceMeta.title,
          artists: pending.sourceMeta.artists,
          durationMs: Math.max(0, pending.sourceMeta.durationSec * 1000),
          position: pending.position,
          album: pending.sourceMeta.album
            ? {
                name: pending.sourceMeta.album,
                image: pending.sourceMeta.coverUrl ? { url: pending.sourceMeta.coverUrl } : null,
                releaseDate: pending.sourceMeta.year ? String(pending.sourceMeta.year) : null,
                releaseDatePrecision: pending.sourceMeta.year ? ('year' as const) : null,
              }
            : null,
        },
      }))
      .sort((a, b) => a.position - b.position);

    if (syntheticPending.length === 0) {
      return tracks;
    }

    const merged = [...tracks];
    for (const pending of syntheticPending) {
      const insertAt = Math.max(0, Math.min(pending.position, merged.length));
      merged.splice(insertAt, 0, pending.track);
    }

    return merged;
  }, [playlistId, pendingForPlaylist, tracks]);

  // --- Metadata and permissions ---
  const metaPermissions = usePlaylistMetaPermissions(playlistId, providerId);
  const {
    playlistName,
    playlistDescription,
    playlistIsPublic,
    isEditable,
    permissionsData,
  } = metaPermissions;

  // --- Last.fm config ---
  const { lastfmEnabled } = useLastfmConfig();

  // --- Compute permissions and DnD state ---
  const canDrag = true;
  const canDropBasic = !locked && sortKey === 'position' && sortDirection === 'asc';
  const canDrop = isEditable && canDropBasic;
  const canMove = isEditable && !locked;
  const actualStoredDndMode = canMove ? storedDndMode : 'copy';

  // --- DnD mode preview ---
  const { isMouseOver, setIsMouseOver, dndMode } = useDndModePreview(
    canMove,
    isDragSource,
    actualStoredDndMode
  );

  // --- Droppable scroll area ---
  const { scrollRef, scrollDroppableRef } = useDroppableScroll(
    panelId,
    playlistId,
    canDropBasic
  );

  // Re-bind handleDndModeToggle with actual dndMode
  const handleDndModeToggle = useCallback(() => {
    setPanelDnDMode(panelId, dndMode === 'move' ? 'copy' : 'move');
  }, [panelId, dndMode, setPanelDnDMode]);

  // Load playlist when permissions change
  useEffect(() => {
    if (playlistId && permissionsData) {
      loadPlaylist(panelId, playlistId, permissionsData.isEditable);
    }
  }, [playlistId, panelId, permissionsData, loadPlaylist]);

  // --- Insertion markers ---
  const { activeMarkerIndices, clearInsertionMarkers } = useInsertionMarkers(playlistId);

  // --- Filtering and sorting ---
  const { sortedTracks, filteredTracks, isSorted } = useFilteringAndSorting(
    tracksWithPending,
    sortKey,
    sortDirection,
    searchQuery
  );

  // --- Toggle liked handler ---
  const handleToggleLiked = useCallback(
    (trackId: string, currentlyLiked: boolean) => {
      toggleLiked(trackId, currentlyLiked);
    },
    [toggleLiked]
  );

  // --- Virtualization ---
  const {
    virtualizer,
    virtualizerRef,
    items,
    rowHeight,
    isCompact,
  } = useVirtualizerState(filteredTracks, scrollRef, panelId, scrollOffset);

  // --- Playlist mutations ---
  const mutations = usePlaylistMutations({
    playlistId,
    providerId,
    panelId,
    isEditable,
    snapshotId,
    filteredTracks,
    sortedTracks,
    tracks,
    selection,
    setSelection,
    setSort,
    getSelectionBounds: () => null, // Will be overwritten after selection hook
  });

  // --- Selection management ---
  const canDelete = isEditable && !locked && playlistId !== null;
  const selectionMgmt = useSelectionManagement({
    filteredTracks,
    selection,
    panelId,
    setSelection,
    toggleSelection,
    virtualizer,
    isCompact,
    canDelete,
    onDeleteWithAutoSelect: mutations.handleDeleteWithAutoSelect,
  });

  // Re-create mutations with actual getSelectionBounds
  const {
    removeTracks,
    handleDeleteSelected,
    handleDeleteWithAutoSelect: _handleDeleteWithAutoSelect,
    getSortedTrackUris,
    handleSaveCurrentOrder,
    buildReorderActions,
    isSavingOrder,
    saveOrderDialogOpen,
    setSaveOrderDialogOpen,
    movePlan,
    sequentialMoveState,
    handleSaveWithReplace,
    handleSaveWithPreserveDates,
    handleCancelMoves,
  } = usePlaylistMutations({
    playlistId,
    providerId,
    panelId,
    isEditable,
    snapshotId,
    filteredTracks,
    sortedTracks,
    tracks,
    selection,
    setSelection,
    setSort,
    getSelectionBounds: selectionMgmt.getSelectionBounds,
  });

  // --- Duplicates ---
  const duplicates = useDuplicates({
    playlistId,
    providerId,
    isEditable,
    filteredTracks,
    selection,
    removeTracks,
  });

  // --- Compare mode ---
  const { isCompareEnabled, getCompareColorForTrack } = useCompareModeIntegration(
    panelId,
    playlistId,
    tracks
  );

  // --- Contributors ---
  const { hasMultipleContributors, getProfile } = useContributorsPrefetch(tracks);

  // --- Cumulative durations ---
  const { cumulativeDurations, hourBoundaries } = useCumulativeDurations(filteredTracks);

  // --- Playback ---
  // Pass sortedTracks to maintain playback continuity when text filtering changes
  const {
    isTrackPlaying,
    isTrackLoading,
    playTrack,
    pausePlayback,
    handlePlayFirst,
  } = usePlaybackControls(filteredTracks, playlistId, isLikedPlaylist, sortedTracks, panelId);

  // --- Event subscriptions ---
  usePlaylistEvents({
    playlistId,
    providerId,
    queryClient,
  });

  // --- Auto reload ---
  useAutoReload(playlistId, providerId, isLikedPlaylist);

  // --- Unified scroll sync (save and restore) ---
  usePanelScrollSync({
    panelId,
    scrollRef,
    virtualizerRef,
    targetScrollOffset: scrollOffset,
    dataUpdatedAt,
    setScroll,
  });

  // --- Wrap split/close handlers to save scroll synchronously before mutation ---
  // This ensures the store has the correct scrollOffset BEFORE the tree mutation,
  // so both the clone (on split) and the original (after remount) can restore correctly.
  const handleSplitHorizontalWithScroll = useCallback(() => {
    flushAllPanelScrollPositions();
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    setScroll(panelId, scrollTop);
    handleSplitHorizontal();
  }, [scrollRef, setScroll, panelId, handleSplitHorizontal]);

  const handleSplitVerticalWithScroll = useCallback(() => {
    flushAllPanelScrollPositions();
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    setScroll(panelId, scrollTop);
    handleSplitVertical();
  }, [scrollRef, setScroll, panelId, handleSplitVertical]);

  const handleCloseWithScroll = useCallback(() => {
    // Closing one panel can remount surviving siblings (group collapses).
    // Flush all mounted panel scroll positions so the survivor restores correctly.
    flushAllPanelScrollPositions();
    // Save this panel's scroll position before the structural change.
    // Sibling panels will flush via their unmount effect if they remount.
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    setScroll(panelId, scrollTop);
    handleClose();
  }, [scrollRef, setScroll, panelId, handleClose]);

  // --- Return the same shape as before for API compatibility ---
  return {
    // Refs
    scrollRef,
    scrollDroppableRef,
    virtualizerRef,

    // State
    providerId,
    playlistId,
    playlistName,
    playlistDescription,
    playlistIsPublic,
    searchQuery,
    selection,
    locked,
    sortKey,
    sortDirection,
    setSortKey,
    setSortDirection,

    // Data
    tracks,
    filteredTracks,
    snapshotId,
    isLoading,
    isAutoLoading,
    isReloading,
    error,
    isLikedPlaylist,
    hasMultipleContributors,
    cumulativeDurations,
    hourBoundaries,
    duplicateUris: duplicates.duplicateUris,
    softDuplicateUris: duplicates.softDuplicateUris,
    selectedDuplicateUris: duplicates.selectedDuplicateUris,
    isDuplicate: duplicates.isDuplicate,
    isSoftDuplicate: duplicates.isSoftDuplicate,
    getDuplicateType: duplicates.getDuplicateType,
    isOtherInstanceSelected: duplicates.isOtherInstanceSelected,

    // Compare mode
    isCompareEnabled,
    getCompareColorForTrack,

    // Permissions
    isEditable,
    canDrag,
    canDrop,
    dndMode,

    // Virtualization
    virtualizer,
    items,
    rowHeight,
    activeMarkerIndices,

    // Playback
    isTrackPlaying,
    isTrackLoading,
    playTrack,
    pausePlayback,
    isLiked,
    handleToggleLiked,
    getProfile,

    // Mutations
    removeTracks,
    lastfmEnabled,

    // Handlers
    handleSearchChange,
    handleReload,
    handleClose: handleCloseWithScroll,
    handleSplitHorizontal: handleSplitHorizontalWithScroll,
    handleSplitVertical: handleSplitVerticalWithScroll,
    handleDndModeToggle,
    handleLockToggle,
    handleLoadPlaylist,
    handleProviderChange,
    handleDeleteSelected,
    handleSort,
    handleTrackClick: selectionMgmt.handleTrackClick,
    handleTrackSelect: selectionMgmt.handleTrackSelect,
    handleKeyDownNavigation: selectionMgmt.handleKeyDownNavigation,
    selectionKey: selectionMgmt.selectionKey,
    clearInsertionMarkers,
    focusedIndex: selectionMgmt.focusedIndex,
    getSelectedTrackUris: selectionMgmt.getSelectedTrackUris,

    // Panel info
    panelCount,
    scrollOffset,

    // Save current order
    isSorted,
    isSavingOrder,
    getSortedTrackUris,
    handleSaveCurrentOrder,
    saveOrderDialogOpen,
    setSaveOrderDialogOpen,
    movePlan,
    sequentialMoveState,
    handleSaveWithReplace,
    handleSaveWithPreserveDates,
    handleCancelMoves,

    // Delete with confirmation for multi-track (keyboard DEL)
    showDeleteConfirmation: selectionMgmt.showDeleteConfirmation,
    setShowDeleteConfirmation: selectionMgmt.setShowDeleteConfirmation,
    handleConfirmMultiDelete: selectionMgmt.handleConfirmMultiDelete,

    // Mouse/keyboard state
    isMouseOver,
    setIsMouseOver,

    // Selection actions
    clearSelection: selectionMgmt.clearSelection,
    getFirstSelectedTrack: selectionMgmt.getFirstSelectedTrack,
    getSelectionBounds: selectionMgmt.getSelectionBounds,

    // Reorder actions
    buildReorderActions,

    // New actions
    handlePlayFirst,
    handleDeleteAllDuplicates: duplicates.handleDeleteAllDuplicates,
    handleDeleteTrackDuplicates: duplicates.handleDeleteTrackDuplicates,
    isDeletingDuplicates: duplicates.isDeletingDuplicates,
    hasTracks: filteredTracks.length > 0,
    hasDuplicates: duplicates.duplicateUris.size > 0,
  };
}
