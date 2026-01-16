/**
 * Custom hook that encapsulates all state and logic for PlaylistPanel.
 * 
 * Refactored to compose smaller, focused hooks for better testability and maintainability.
 * This orchestrator assembles outputs from subhooks while preserving the existing public API.
 */

'use no memo';

import { useEffect, useCallback } from 'react';
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
  useScrollPersistence,
  useScrollRestoration,
  usePlaylistMutations,
} from './panel';

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
    handleSort,
  } = storeBindings;

  // --- Data source (tracks, loading, error) ---
  const dataSource = usePlaylistDataSource(playlistId);
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

  // --- Metadata and permissions ---
  const metaPermissions = usePlaylistMetaPermissions(playlistId);
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
    tracks,
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
    contextItems,
    rowHeight,
    isCompact,
  } = useVirtualizerState(filteredTracks, scrollRef, panelId);

  // --- Playlist mutations ---
  const mutations = usePlaylistMutations({
    playlistId,
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
  } = usePlaylistMutations({
    playlistId,
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
  } = usePlaybackControls(filteredTracks, playlistId, isLikedPlaylist, sortedTracks);

  // --- Event subscriptions ---
  usePlaylistEvents({
    panelId,
    playlistId,
    scrollRef,
    setScroll,
    queryClient,
  });

  // --- Auto reload ---
  useAutoReload(playlistId, isLikedPlaylist);

  // --- Scroll persistence ---
  useScrollPersistence({
    panelId,
    scrollRef,
    setScroll,
  });

  // --- Scroll restoration ---
  useScrollRestoration({
    scrollRef,
    targetScrollOffset: scrollOffset,
    dataUpdatedAt,
  });

  // --- Return the same shape as before for API compatibility ---
  return {
    // Refs
    scrollRef,
    scrollDroppableRef,
    virtualizerRef,

    // State
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
    contextItems,
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
    handleClose,
    handleSplitHorizontal,
    handleSplitVertical,
    handleDndModeToggle,
    handleLockToggle,
    handleLoadPlaylist,
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

    // Save current order
    isSorted,
    isSavingOrder,
    getSortedTrackUris,
    handleSaveCurrentOrder,

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
