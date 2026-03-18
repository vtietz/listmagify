/**
 * PlaylistPanel component with virtualized track list, search, and DnD support.
 * Each panel can load a playlist independently and sync with other panels showing the same playlist.
 *
 * Refactored to use VirtualizedTrackListContainer for cleaner separation of concerns.
 * UI state subcomponents (Loading, Error, Empty, ConfirmDialog) are extracted into panel/.
 */

'use client';

import { useCallback } from 'react';
import { usePlaylistPanelState } from '@/hooks/usePlaylistPanelState';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useAddToMarkers } from '@/hooks/useAddToMarkers';
import { usePlaylistSelectionMenu } from '@/hooks/usePlaylistSelectionMenu';
import { useVirtualizerRegistration } from '@/hooks/useVirtualizerRegistration';
import { usePlayerStore } from '@/hooks/usePlayerStore';
import { useHydratedAutoScrollPlay } from '@/hooks/useAutoScrollPlayStore';
import { useAutoScrollPlayback } from '@/hooks/useAutoScrollPlayback';
import { useDndStateStore } from '@/hooks/dnd';
import { PanelToolbar } from './PanelToolbar';
import { TableHeader } from '../TableHeader';
import { VirtualizedTrackListContainer } from '../VirtualizedTrackListContainer';
import { TRACK_ROW_HEIGHT } from '../constants';
import {
  LoadingSkeletonList,
  ErrorPanel,
  EmptyPanel,
  EmptyTrackList,
  ConfirmDeleteDialog,
} from '../panel';
import type { Track } from '@/lib/music-provider/types';

interface PlaylistPanelProps {
  panelId: string;
  onRegisterVirtualizer:
    | ((
        panelId: string,
        virtualizer: any,
        scrollRef: { current: HTMLDivElement | null },
        filteredTracks: Track[],
        canDrop: boolean
      ) => void)
    | undefined;
  onUnregisterVirtualizer: ((panelId: string) => void) | undefined;
}

type PlaylistPanelState = ReturnType<typeof usePlaylistPanelState>;
type PlaylistPanelViewState = Omit<PlaylistPanelState, 'scrollRef' | 'scrollDroppableRef' | 'virtualizerRef'>;

function getPlaylistPanelClassName({
  isPlayingPanel,
  isActiveDropTarget,
}: {
  isPlayingPanel: boolean;
  isActiveDropTarget: boolean;
}) {
  if (isPlayingPanel) {
    return 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
  }

  if (isActiveDropTarget) {
    return 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-primary bg-primary/10';
  }

  return 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-border bg-card';
}

function getActivePlayPosition({
  isPlayingPanel,
  playbackState,
  filteredTracks,
}: {
  isPlayingPanel: boolean;
  playbackState: ReturnType<typeof usePlayerStore.getState>['playbackState'];
  filteredTracks: Track[];
}) {
  if (!isPlayingPanel || !playbackState?.isPlaying || !playbackState.track?.id) {
    return -1;
  }

  const activeTrackIndex = filteredTracks.findIndex((track) => track.id === playbackState.track?.id);
  return filteredTracks[activeTrackIndex]?.position ?? activeTrackIndex;
}

function buildTrackListOptionalProps({
  isDragSource,
  hasActiveMarkers,
  handleAddToAllMarkers,
  isEditable,
  buildReorderActions,
  activePlayPosition,
  handleDeleteTrackDuplicates,
  handleDeleteSelected,
}: {
  isDragSource: boolean;
  hasActiveMarkers: boolean;
  handleAddToAllMarkers: () => void;
  isEditable: boolean;
  buildReorderActions: PlaylistPanelViewState['buildReorderActions'];
  activePlayPosition: number;
  handleDeleteTrackDuplicates: PlaylistPanelViewState['handleDeleteTrackDuplicates'];
  handleDeleteSelected: PlaylistPanelViewState['handleDeleteSelected'];
}) {
  const optionalProps: Record<string, unknown> = { isDragSource };

  if (hasActiveMarkers) {
    optionalProps.hasAnyMarkers = hasActiveMarkers;
    optionalProps.onAddToAllMarkers = handleAddToAllMarkers;
  }

  if (isEditable) {
    optionalProps.buildReorderActions = buildReorderActions;
    optionalProps.contextTrackActions = {
      onRemoveFromPlaylist: handleDeleteSelected,
      canRemove: true,
    };
  }

  if (activePlayPosition >= 0) {
    optionalProps.activePlayPosition = activePlayPosition;
  }

  if (isEditable && handleDeleteTrackDuplicates) {
    optionalProps.onDeleteTrackDuplicates = handleDeleteTrackDuplicates;
  }

  return optionalProps;
}

function PlaylistTrackListState({
  panelId,
  state,
  playbackContext,
  isDragSource,
  hasActiveMarkers,
  handleAddToAllMarkers,
  activePlayPosition,
}: {
  panelId: string;
  state: PlaylistPanelViewState;
  playbackContext: ReturnType<typeof usePlayerStore.getState>['playbackContext'];
  isDragSource: boolean;
  hasActiveMarkers: boolean;
  handleAddToAllMarkers: () => void;
  activePlayPosition: number;
}) {
  if (state.isLoading) {
    return <LoadingSkeletonList />;
  }

  if (state.error) {
    return <ErrorPanel error={state.error} />;
  }

  if (state.filteredTracks.length === 0) {
    return <EmptyTrackList searchQuery={state.searchQuery} />;
  }

  const optionalProps = buildTrackListOptionalProps({
    isDragSource,
    hasActiveMarkers,
    handleAddToAllMarkers,
    isEditable: state.isEditable,
    buildReorderActions: state.buildReorderActions,
    activePlayPosition,
    handleDeleteTrackDuplicates: state.handleDeleteTrackDuplicates,
    handleDeleteSelected: state.handleDeleteSelected,
  });

  return (
    <div className="relative min-w-fit">
      <TableHeader
        isEditable={state.isEditable}
        sortKey={state.sortKey}
        sortDirection={state.sortDirection}
        onSort={state.handleSort}
        showLikedColumn={true}
        isCollaborative={state.hasMultipleContributors}
      />
      <VirtualizedTrackListContainer
        panelId={panelId}
        playlistId={state.playlistId!}
        isEditable={state.isEditable}
        canDrag={state.canDrag}
        dndMode={state.dndMode}
        searchQuery={state.searchQuery}
        isSorted={state.isSorted}
        totalSize={state.virtualizer.getTotalSize()}
        rowHeight={state.rowHeight}
        virtualItems={state.items}
        filteredTracks={state.filteredTracks}
        selection={state.selection}
        activeMarkerIndices={state.activeMarkerIndices}
        hasMultipleContributors={state.hasMultipleContributors}
        hourBoundaries={state.hourBoundaries}
        cumulativeDurations={state.cumulativeDurations}
        selectionKey={state.selectionKey}
        isLiked={state.isLiked}
        isTrackPlaying={state.isTrackPlaying}
        isTrackLoading={state.isTrackLoading}
        isDuplicate={state.isDuplicate}
        isSoftDuplicate={state.isSoftDuplicate}
        isOtherInstanceSelected={state.isOtherInstanceSelected}
        getCompareColorForTrack={state.getCompareColorForTrack}
        getProfile={state.getProfile}
        handleTrackSelect={state.handleTrackSelect}
        handleTrackClick={state.handleTrackClick}
        handleToggleLiked={state.handleToggleLiked}
        playTrack={state.playTrack}
        pausePlayback={state.pausePlayback}
        playbackContext={playbackContext}
        {...optionalProps}
      />
    </div>
  );
}

function PlaylistPanelBody({
  panelId,
  state,
  isPlayingPanel,
  isActiveDropTarget,
  isDragSource,
  scrollDroppableRef,
  playbackContext,
  handleOpenSelectionMenu,
  handleAddToAllMarkers,
  hasActiveMarkers,
  activePlayPosition,
}: {
  panelId: string;
  state: PlaylistPanelViewState;
  isPlayingPanel: boolean;
  isActiveDropTarget: boolean;
  isDragSource: boolean;
  scrollDroppableRef: PlaylistPanelState['scrollDroppableRef'];
  playbackContext: ReturnType<typeof usePlayerStore.getState>['playbackContext'];
  handleOpenSelectionMenu: (position: { x: number; y: number }) => void;
  handleAddToAllMarkers: () => void;
  hasActiveMarkers: boolean;
  activePlayPosition: number;
}) {
  return (
    <div
      data-testid="playlist-panel"
      data-editable={state.isEditable}
      className={getPlaylistPanelClassName({ isPlayingPanel, isActiveDropTarget })}
      onMouseEnter={() => state.setIsMouseOver(true)}
      onMouseLeave={() => state.setIsMouseOver(false)}
    >
      <PanelToolbar
        panelId={panelId}
        providerId={state.providerId}
        playlistId={state.playlistId ?? null}
        playlistName={state.playlistName}
        playlistDescription={state.playlistDescription}
        playlistIsPublic={state.playlistIsPublic}
        isEditable={state.isEditable}
        dndMode={state.dndMode}
        locked={state.locked}
        searchQuery={state.searchQuery}
        isReloading={state.isReloading}
        sortKey={state.sortKey}
        sortDirection={state.sortDirection}
        insertionMarkerCount={state.activeMarkerIndices.size}
        isSorted={state.isSorted}
        isSavingOrder={state.isSavingOrder}
        selectionCount={state.selection.size}
        panelCount={state.panelCount}
        hasTracks={state.hasTracks}
        hasDuplicates={state.hasDuplicates}
        isDeletingDuplicates={state.isDeletingDuplicates}
        isPlayingPanel={isPlayingPanel}
        onOpenSelectionMenu={handleOpenSelectionMenu}
        onClearSelection={state.clearSelection}
        onSearchChange={state.handleSearchChange}
        onSortChange={(key, direction) => {
          state.setSortKey(key);
          state.setSortDirection(direction);
        }}
        onReload={state.handleReload}
        onClose={state.handleClose}
        onSplitHorizontal={state.handleSplitHorizontal}
        onSplitVertical={state.handleSplitVertical}
        onDndModeToggle={state.handleDndModeToggle}
        onLockToggle={state.handleLockToggle}
        onProviderChange={state.handleProviderChange}
        onLoadPlaylist={state.handleLoadPlaylist}
        onClearInsertionMarkers={() => state.playlistId && state.clearInsertionMarkers(state.playlistId)}
        onSaveCurrentOrder={state.handleSaveCurrentOrder}
        onPlayFirst={state.handlePlayFirst}
        onDeleteDuplicates={state.handleDeleteAllDuplicates}
      />

      <div
        ref={scrollDroppableRef}
        data-testid="track-list-scroll"
        className="flex-1 overflow-auto focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        style={{
          paddingBottom: TRACK_ROW_HEIGHT * 2,
          overscrollBehaviorX: 'none',
          overscrollBehaviorY: 'contain',
          willChange: 'scroll-position',
          touchAction: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
        role="listbox"
        aria-multiselectable="true"
        aria-activedescendant={state.focusedIndex !== null ? `option-${panelId}-${state.focusedIndex}` : undefined}
        tabIndex={0}
        onKeyDown={state.handleKeyDownNavigation}
      >
        <PlaylistTrackListState
          panelId={panelId}
          state={state}
          playbackContext={playbackContext}
          isDragSource={isDragSource}
          hasActiveMarkers={hasActiveMarkers}
          handleAddToAllMarkers={handleAddToAllMarkers}
          activePlayPosition={activePlayPosition}
        />

        {state.isAutoLoading && (
          <div className="p-3 text-center text-xs text-muted-foreground">
            Loading all tracks for this playlist… ({state.tracks.length} loaded)
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={state.showDeleteConfirmation}
        count={state.selection.size}
        onOpenChange={state.setShowDeleteConfirmation}
        onConfirm={state.handleConfirmMultiDelete}
      />
    </div>
  );
}

export function PlaylistPanel({
  panelId,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
}: PlaylistPanelProps) {
  const isActiveDropTarget = useDndStateStore((s) => s.activePanelId === panelId);
  const isDragSource = useDndStateStore((s) => s.sourcePanelId === panelId);
  const panelState = usePlaylistPanelState({ panelId, isDragSource });
  const { scrollRef, scrollDroppableRef, virtualizerRef: _virtualizerRef, ...state } = panelState;
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  
  // Check if this panel is the active playback source
  const playbackContext = usePlayerStore((s) => s.playbackContext);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const isPlayingPanel = playbackContext?.sourceId === panelId;
  const activePlayPosition = getActivePlayPosition({
    isPlayingPanel,
    playbackState,
    filteredTracks: state.filteredTracks,
  });
  
  // Auto-scroll during playback toggle (user preference)
  const autoScrollEnabled = useHydratedAutoScrollPlay();

  useAutoScrollPlayback({
    panelId,
    isPlayingPanel,
    autoScrollEnabled,
    playbackState,
    filteredTracks: state.filteredTracks,
    virtualizer: state.virtualizer,
    playlistId: state.playlistId,
  });
  
  // Get togglePoint from insertion points store (for marker actions)
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  
  // Hook to add tracks to all markers
  const { hasActiveMarkers, addToMarkers } = useAddToMarkers({ 
    excludePlaylistId: state.playlistId !== null ? state.playlistId : undefined 
  });
  
  // Handler to add selected tracks to all markers (used in context menu)
  const handleAddToAllMarkers = useCallback(() => {
    const uris = state.getSelectedTrackUris();
    if (uris.length > 0) {
      addToMarkers(uris);
    }
  }, [state, addToMarkers]);

  const handleOpenSelectionMenu = usePlaylistSelectionMenu({
    panelId,
    state,
    openContextMenu,
    togglePoint,
    hasActiveMarkers,
    handleAddToAllMarkers,
  });

  useVirtualizerRegistration({
    panelId,
    playlistId: state.playlistId,
    virtualizer: state.virtualizer,
    scrollRef,
    filteredTracks: state.filteredTracks,
    canDrop: state.canDrop,
    onRegisterVirtualizer,
    onUnregisterVirtualizer,
  });

  // Empty panel state
  if (!state.playlistId) {
    return (
      <EmptyPanel
        panelId={panelId}
        panelCount={state.panelCount}
        onLoadPlaylist={state.handleLoadPlaylist}
        onClose={state.handleClose}
        onSplitHorizontal={state.handleSplitHorizontal}
        onSplitVertical={state.handleSplitVertical}
      />
    );
  }

  return (
    <PlaylistPanelBody
      panelId={panelId}
      state={state}
      isPlayingPanel={isPlayingPanel}
      isActiveDropTarget={isActiveDropTarget}
      isDragSource={isDragSource}
      scrollDroppableRef={scrollDroppableRef}
      playbackContext={playbackContext}
      handleOpenSelectionMenu={handleOpenSelectionMenu}
      handleAddToAllMarkers={handleAddToAllMarkers}
      hasActiveMarkers={hasActiveMarkers}
      activePlayPosition={activePlayPosition}
    />
  );
}
