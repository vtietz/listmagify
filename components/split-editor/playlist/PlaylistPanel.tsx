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
import { useProviderPanelGuardState } from '@/components/auth/ProviderPanelGuard';
import { OverlaySignInCTA } from '@/components/auth/OverlaySignInCTA';
import { PanelToolbar } from './PanelToolbar';
import { TableHeader } from '../TableHeader';
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
import { cn } from '@/lib/utils';
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
  return isPlayingPanel
    ? 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
    : isActiveDropTarget
      ? 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-primary bg-primary/10'
      : 'flex flex-col h-full border-2 rounded-lg overflow-hidden transition-all border-border bg-card';
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

function hasPlayingTrackInPanel({
  filteredTracks,
  isTrackPlaying,
}: {
  filteredTracks: Track[];
  isTrackPlaying: (trackId: string | null) => boolean;
}): boolean {
  return filteredTracks.some((track) => isTrackPlaying(track.id));
}
function matchesCurrentTrackId(playbackState: ReturnType<typeof usePlayerStore.getState>['playbackState'], filteredTracks: Track[]): boolean {
  const currentlyPlayingTrackId = playbackState?.track?.id;
  return Boolean(currentlyPlayingTrackId && filteredTracks.some((track) => track.id === currentlyPlayingTrackId));
}
function matchesCurrentContextTrack(playbackContext: ReturnType<typeof usePlayerStore.getState>['playbackContext'], filteredTracks: Track[]): boolean {
  const currentContextTrackUri = getCurrentContextTrackUri(playbackContext);
  return Boolean(currentContextTrackUri && filteredTracks.some((track) => track.uri === currentContextTrackUri));
}

function matchesPlaybackStateContextPlaylist(
  playbackState: ReturnType<typeof usePlayerStore.getState>['playbackState'],
  playlistId: string | null | undefined,
): boolean {
  if (!playlistId) {
    return false;
  }

  return playbackState?.context?.uri === `spotify:playlist:${playlistId}`;
}

function getCurrentContextTrackUri(playbackContext: ReturnType<typeof usePlayerStore.getState>['playbackContext']): string | undefined {
  if (!playbackContext) {
    return undefined;
  }

  return playbackContext.trackUris[playbackContext.currentIndex];
}

function resolvePlayingPanelState({
  panelId,
  playlistId,
  playbackContext,
  playbackState,
  filteredTracks,
  isTrackPlaying,
}: {
  panelId: string;
  playlistId: string | null | undefined;
  playbackContext: ReturnType<typeof usePlayerStore.getState>['playbackContext'];
  playbackState: ReturnType<typeof usePlayerStore.getState>['playbackState'];
  filteredTracks: Track[];
  isTrackPlaying: (trackId: string | null) => boolean;
}): boolean {
  return Boolean(
    playbackContext?.sourceId === panelId
    || (playlistId && playbackContext?.playlistId === playlistId)
    || matchesPlaybackStateContextPlaylist(playbackState, playlistId)
    || (playbackState?.isPlaying && hasPlayingTrackInPanel({ filteredTracks, isTrackPlaying }))
    || matchesCurrentTrackId(playbackState, filteredTracks)
    || matchesCurrentContextTrack(playbackContext, filteredTracks)
  );
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
  return (
    <div
      data-testid="playlist-panel"
      data-editable={state.isEditable}
      data-auth-blocked={isInteractionBlocked ? 'true' : 'false'}
      className={cn(getPlaylistPanelClassName({ isPlayingPanel, isActiveDropTarget }), 'relative')}
      onMouseEnter={() => state.setIsMouseOver(true)}
      onMouseLeave={() => state.setIsMouseOver(false)}
    >
      {isInteractionBlocked && guardReason && (
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

        <div
          ref={scrollDroppableRef}
          data-testid="track-list-scroll"
          className={cn('flex-1 overflow-auto focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0', isInteractionBlocked && 'pointer-events-none')}
          aria-hidden={isInteractionBlocked ? true : undefined}
          style={{
            paddingBottom: TRACK_ROW_HEIGHT * 2,
            overscrollBehaviorX: 'none',
            overscrollBehaviorY: 'contain',
            willChange: 'scroll-position',
            touchAction: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
          role="listbox"
          aria-disabled={isInteractionBlocked}
          aria-multiselectable="true"
          aria-activedescendant={state.focusedIndex !== null ? `option-${panelId}-${state.focusedIndex}` : undefined}
          tabIndex={isInteractionBlocked ? -1 : 0}
          onKeyDown={isInteractionBlocked ? undefined : state.handleKeyDownNavigation}
        >
          <PlaylistTrackListState
            panelId={panelId}
            state={state}
            playbackContext={playbackContext}
            isDragSource={isDragSource}
            hasActiveMarkers={hasActiveMarkers}
            handleAddToAllMarkers={handleAddToAllMarkers}
            activePlayPosition={activePlayPosition}
            isInteractionBlocked={isInteractionBlocked}
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
