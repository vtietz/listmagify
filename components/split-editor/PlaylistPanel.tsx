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
import { PanelToolbar } from './PanelToolbar';
import { TableHeader } from './TableHeader';
import { VirtualizedTrackListContainer } from './VirtualizedTrackListContainer';
import { TRACK_ROW_HEIGHT } from './constants';
import {
  LoadingSkeletonList,
  ErrorPanel,
  EmptyPanel,
  EmptyTrackList,
  ConfirmDeleteDialog,
} from './panel';
import type { Track } from '@/lib/spotify/types';

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
  isActiveDropTarget?: boolean | undefined;
  isDragSource?: boolean | undefined;
  dropIndicatorIndex?: number | null | undefined;
  ephemeralInsertion?:
    | {
        activeId: string;
        sourcePanelId: string;
        targetPanelId: string;
        insertionIndex: number;
      }
    | null
    | undefined;
}

export function PlaylistPanel({
  panelId,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
  isActiveDropTarget,
  isDragSource,
  dropIndicatorIndex,
}: PlaylistPanelProps) {
  const panelState = usePlaylistPanelState({ panelId, isDragSource });
  const { scrollRef, scrollDroppableRef, virtualizerRef: _virtualizerRef, ...state } = panelState;
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  
  // Get togglePoint from insertion points store (for marker actions)
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  
  // Hook to add tracks to all markers
  const { hasActiveMarkers, addToMarkers } = useAddToMarkers({ 
    excludePlaylistId: state.playlistId ?? undefined 
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
    <div 
      data-testid="playlist-panel"
      data-editable={state.isEditable}
      className={`flex flex-col h-full border border-border rounded-lg overflow-hidden transition-all ${
        isActiveDropTarget ? 'bg-primary/10' : 'bg-card'
      }`}
      onMouseEnter={() => state.setIsMouseOver(true)}
      onMouseLeave={() => state.setIsMouseOver(false)}
    >
      <PanelToolbar
        panelId={panelId}
        playlistId={state.playlistId}
        playlistName={state.playlistName}
        playlistDescription={state.playlistDescription}
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
          contain: 'strict',
        }}
        role="listbox"
        aria-multiselectable="true"
        aria-activedescendant={state.focusedIndex !== null ? `option-${panelId}-${state.focusedIndex}` : undefined}
        tabIndex={0}
        onKeyDown={state.handleKeyDownNavigation}
      >
        {/* Loading state */}
        {state.isLoading && <LoadingSkeletonList />}

        {/* Error state */}
        {state.error && <ErrorPanel error={state.error} />}

        {/* Empty state */}
        {!state.isLoading && !state.error && state.filteredTracks.length === 0 && (
          <EmptyTrackList searchQuery={state.searchQuery} />
        )}

        {/* Track list */}
        {!state.isLoading && !state.error && state.filteredTracks.length > 0 && (
          <>
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
                {...(isDragSource !== undefined ? { isDragSource } : {})}
                dropIndicatorIndex={dropIndicatorIndex ?? null}
                searchQuery={state.searchQuery}
                isSorted={state.isSorted}
                totalSize={state.virtualizer.getTotalSize()}
                rowHeight={state.rowHeight}
                virtualItems={state.items}
                filteredTracks={state.filteredTracks}
                contextItems={state.contextItems}
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
                isOtherInstanceSelected={state.isOtherInstanceSelected}
                getCompareColorForTrack={state.getCompareColorForTrack}
                getProfile={state.getProfile}
                handleTrackSelect={state.handleTrackSelect}
                handleTrackClick={state.handleTrackClick}
                handleToggleLiked={state.handleToggleLiked}
                playTrack={state.playTrack}
                pausePlayback={state.pausePlayback}
                {...(hasActiveMarkers ? { hasAnyMarkers: hasActiveMarkers, onAddToAllMarkers: handleAddToAllMarkers } : {})}
                {...(state.isEditable ? { buildReorderActions: state.buildReorderActions } : {})}
                {...(state.isEditable && state.handleDeleteTrackDuplicates ? { onDeleteTrackDuplicates: state.handleDeleteTrackDuplicates } : {})}
                {...(state.isEditable ? { contextTrackActions: {
                  onRemoveFromPlaylist: state.handleDeleteSelected,
                  canRemove: true,
                } } : {})}
              />
            </div>
          </>
        )}

        {/* Auto-loading indicator */}
        {state.isAutoLoading && (
          <div className="p-3 text-center text-xs text-muted-foreground">
            Loading all tracks for this playlist… ({state.tracks.length} loaded)
          </div>
        )}
      </div>

      {/* Delete confirmation dialog for keyboard-triggered multi-track delete */}
      <ConfirmDeleteDialog
        open={state.showDeleteConfirmation}
        count={state.selection.size}
        onOpenChange={state.setShowDeleteConfirmation}
        onConfirm={state.handleConfirmMultiDelete}
      />
    </div>
  );
}
