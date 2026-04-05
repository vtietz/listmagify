'use client';

import { useCallback } from 'react';
import { usePlaylistPanelState } from '@features/split-editor/playlist/hooks/usePlaylistPanelState';
import { useContextMenuStore } from '@features/split-editor/stores/useContextMenuStore';
import { useInsertionPointsStore } from '@features/split-editor/playlist/hooks/useInsertionPointsStore';
import { useAddToMarkers } from '@features/split-editor/playlist/hooks/useAddToMarkers';
import { usePlaylistSelectionMenu } from '@features/split-editor/playlist/hooks/usePlaylistSelectionMenu';
import { useVirtualizerRegistration } from '@features/split-editor/hooks/useVirtualizerRegistration';
import { usePlayerStore } from '@features/player/hooks/usePlayerStore';
import { useHydratedAutoScrollPlay } from '@features/split-editor/hooks/useAutoScrollPlayStore';
import { useAutoScrollPlayback } from '@features/split-editor/hooks/useAutoScrollPlayback';
import { useDndStateStore } from '@features/dnd';
import { useProviderPanelGuardState } from '@/components/auth/ProviderPanelGuard';
import { OverlaySignInCTA } from '@/components/auth/OverlaySignInCTA';
import { PanelToolbar } from './PanelToolbar';
import { TableHeader } from '@features/split-editor/playlist/ui/TableHeader';
import { VirtualizedTrackListContainer } from '../VirtualizedTrackListContainer';
import { TRACK_ROW_HEIGHT } from '../constants';
import { getTrackColumnVisibility } from '../columns/providerTrackColumns';
import {
  LoadingSkeletonList,
  ErrorPanel,
  EmptyPanel,
  EmptyTrackList,
  ConfirmDeleteDialog,
} from '../panel';
import { SaveOrderDialog } from '../panel/SaveOrderDialog';
import { cn } from '@/lib/utils';
import type { Track } from '@/lib/music-provider/types';
import { getActivePlayPosition, resolvePlayingPanelState } from './playlistPanelPlayback';
import { MoveProgressBar } from './MoveProgressBar';

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
  return isActiveDropTarget
    ? 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-primary bg-primary/10'
    : isPlayingPanel
      ? 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
      : 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-border bg-card';
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
  isInteractionBlocked,
}: {
  panelId: string;
  state: PlaylistPanelViewState;
  playbackContext: ReturnType<typeof usePlayerStore.getState>['playbackContext'];
  isDragSource: boolean;
  hasActiveMarkers: boolean;
  handleAddToAllMarkers: () => void;
  activePlayPosition: number;
  isInteractionBlocked: boolean;
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

  const trackColumnVisibility = getTrackColumnVisibility(state.providerId);

  const optionalProps = buildTrackListOptionalProps({
    isDragSource: isInteractionBlocked ? false : isDragSource,
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
        showReleaseYearColumn={trackColumnVisibility.showReleaseYearColumn}
        showPopularityColumn={trackColumnVisibility.showPopularityColumn}
        providerId={state.providerId}
      />
      <VirtualizedTrackListContainer
        panelId={panelId}
        playlistId={state.playlistId!}
        providerId={state.providerId}
        isEditable={state.isEditable}
        canDrag={isInteractionBlocked ? false : state.canDrag}
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
        showReleaseYearColumn={trackColumnVisibility.showReleaseYearColumn}
        showPopularityColumn={trackColumnVisibility.showPopularityColumn}
        {...optionalProps}
      />
    </div>
  );
}

function PlaylistPanelTrackArea({
  panelId,
  state,
  scrollDroppableRef,
  panelBlocked,
  playbackContext,
  isDragSource,
  hasActiveMarkers,
  handleAddToAllMarkers,
  activePlayPosition,
}: {
  panelId: string;
  state: PlaylistPanelViewState;
  scrollDroppableRef: PlaylistPanelState['scrollDroppableRef'];
  panelBlocked: boolean;
  playbackContext: ReturnType<typeof usePlayerStore.getState>['playbackContext'];
  isDragSource: boolean;
  hasActiveMarkers: boolean;
  handleAddToAllMarkers: () => void;
  activePlayPosition: number;
}) {
  return (
    <div
      ref={scrollDroppableRef}
      data-testid="track-list-scroll"
      className={cn('flex-1 overflow-auto focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0', panelBlocked && 'pointer-events-none')}
      aria-hidden={panelBlocked ? true : undefined}
      style={{
        paddingBottom: TRACK_ROW_HEIGHT * 2,
        overscrollBehaviorX: 'none',
        overscrollBehaviorY: 'contain',
        willChange: 'scroll-position',
        touchAction: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
      role="listbox"
      aria-disabled={panelBlocked}
      aria-multiselectable="true"
      aria-activedescendant={state.focusedIndex !== null ? `option-${panelId}-${state.focusedIndex}` : undefined}
      tabIndex={panelBlocked ? -1 : 0}
      onKeyDown={panelBlocked ? undefined : state.handleKeyDownNavigation}
    >
      <PlaylistTrackListState
        panelId={panelId}
        state={state}
        playbackContext={playbackContext}
        isDragSource={isDragSource}
        hasActiveMarkers={hasActiveMarkers}
        handleAddToAllMarkers={handleAddToAllMarkers}
        activePlayPosition={activePlayPosition}
        isInteractionBlocked={panelBlocked}
      />

      {state.isAutoLoading && (
        <div className="p-3 text-center text-xs text-muted-foreground">
          Loading all tracks for this playlist… ({state.tracks.length} loaded)
        </div>
      )}
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
  isInteractionBlocked,
  guardProvider,
  guardReason,
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
  isInteractionBlocked: boolean;
  guardProvider: 'spotify' | 'tidal';
  guardReason: 'unauthenticated' | 'expired' | null;
}) {
  const isSequentialMoving = state.sequentialMoveState.isMoving;
  const panelBlocked = isInteractionBlocked || isSequentialMoving;
  const showOverlay = isInteractionBlocked && !!guardReason;
  return (
    <div
      data-testid="playlist-panel"
      data-editable={state.isEditable}
      data-auth-blocked={isInteractionBlocked ? 'true' : 'false'}
      className={cn(getPlaylistPanelClassName({ isPlayingPanel, isActiveDropTarget }), 'relative')}
      onMouseEnter={() => state.setIsMouseOver(true)}
      onMouseLeave={() => state.setIsMouseOver(false)}
    >
      {showOverlay && (
        <OverlaySignInCTA providerId={guardProvider} reason={guardReason} />
      )}
      <div className="flex min-h-0 flex-1 flex-col">
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

        {isSequentialMoving && state.sequentialMoveState.progress && (
          <MoveProgressBar
            current={state.sequentialMoveState.progress.current}
            total={state.sequentialMoveState.progress.total}
            onCancel={state.handleCancelMoves}
          />
        )}

        <PlaylistPanelTrackArea
          panelId={panelId}
          state={state}
          scrollDroppableRef={scrollDroppableRef}
          panelBlocked={panelBlocked}
          playbackContext={playbackContext}
          isDragSource={isDragSource}
          hasActiveMarkers={hasActiveMarkers}
          handleAddToAllMarkers={handleAddToAllMarkers}
          activePlayPosition={activePlayPosition}
        />

        <ConfirmDeleteDialog
          open={state.showDeleteConfirmation}
          count={state.selection.size}
          onOpenChange={state.setShowDeleteConfirmation}
          onConfirm={state.handleConfirmMultiDelete}
        />

        <SaveOrderDialog
          open={state.saveOrderDialogOpen}
          onOpenChange={state.setSaveOrderDialogOpen}
          moveCount={state.movePlan?.totalMoves ?? 0}
          onReplace={state.handleSaveWithReplace}
          onPreserveDates={state.handleSaveWithPreserveDates}
        />
      </div>
    </div>
  );
}

export function PlaylistPanel({
  panelId,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
}: PlaylistPanelProps) {
  const {
    provider,
    reason,
    isOverlayActive: isInteractionBlocked,
  } = useProviderPanelGuardState();
  const isActiveDropTarget = useDndStateStore((s) => s.activePanelId === panelId);
  const isDragSource = useDndStateStore((s) => s.sourcePanelId === panelId);
  const panelState = usePlaylistPanelState({ panelId, isDragSource });
  const { scrollRef, scrollDroppableRef, virtualizerRef: _virtualizerRef, ...state } = panelState;
  const openContextMenu = useContextMenuStore((s) => s.openMenu);

  const playbackContext = usePlayerStore((s) => s.playbackContext);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const isPlayingPanel = resolvePlayingPanelState({
    panelId,
    playlistId: state.playlistId,
    playbackContext,
    playbackState,
    filteredTracks: state.filteredTracks,
    isTrackPlaying: state.isTrackPlaying,
  });
  const activePlayPosition = getActivePlayPosition({
    isPlayingPanel,
    playbackState,
    filteredTracks: state.filteredTracks,
  });

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

  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);

  const { hasActiveMarkers, addToMarkers } = useAddToMarkers({
    excludePlaylistId: state.playlistId !== null ? state.playlistId : undefined
  });

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
    canDrop: !isInteractionBlocked && state.canDrop,
    onRegisterVirtualizer,
    onUnregisterVirtualizer,
  });

  // Empty panel state
  if (!state.playlistId) {
    return (
      <EmptyPanel
        panelId={panelId}
        panelCount={state.panelCount}
        providerId={state.providerId}
        onLoadPlaylist={state.handleLoadPlaylist}
        onClose={state.handleClose}
        onSplitHorizontal={state.handleSplitHorizontal}
        onSplitVertical={state.handleSplitVertical}
        onProviderChange={state.handleProviderChange}
        isInteractionBlocked={isInteractionBlocked}
        guardProvider={provider}
        guardReason={reason}
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
      isInteractionBlocked={isInteractionBlocked}
      guardProvider={provider}
      guardReason={reason}
    />
  );
}
