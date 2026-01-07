/**
 * PlaylistPanel component with virtualized track list, search, and DnD support.
 * Each panel can load a playlist independently and sync with other panels showing the same playlist.
 * 
 * Refactored to use VirtualizedTrackListContainer for cleaner separation of concerns.
 */

'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { ApiError, AccessTokenExpiredError } from '@/lib/api/client';
import { SignInButton } from '@/components/auth/SignInButton';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePlaylistPanelState } from '@/hooks/usePlaylistPanelState';
import { PanelToolbar } from './PanelToolbar';
import { TableHeader } from './TableHeader';
import { VirtualizedTrackListContainer } from './VirtualizedTrackListContainer';
import { TRACK_ROW_HEIGHT } from './constants';
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
  const state = usePlaylistPanelState({ panelId, isDragSource });

  // Register virtualizer with parent for drop position calculation
  useEffect(() => {
    if (onRegisterVirtualizer && state.playlistId) {
      onRegisterVirtualizer(panelId, state.virtualizer, state.scrollRef, state.filteredTracks, state.canDrop);
    }
    return () => {
      if (onUnregisterVirtualizer) {
        onUnregisterVirtualizer(panelId);
      }
    };
  }, [panelId, state.virtualizer, state.filteredTracks, state.playlistId, state.canDrop, onRegisterVirtualizer, onUnregisterVirtualizer, state.scrollRef]);

  // Empty panel state
  if (!state.playlistId) {
    return (
      <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-card">
        <PanelToolbar
          panelId={panelId}
          playlistId={null}
          isEditable={false}
          dndMode="copy"
          locked={false}
          searchQuery=""
          isReloading={false}
          onSearchChange={() => {}}
          onReload={() => {}}
          onClose={state.handleClose}
          onSplitHorizontal={state.handleSplitHorizontal}
          onSplitVertical={state.handleSplitVertical}
          onDndModeToggle={() => {}}
          onLockToggle={() => {}}
          onLoadPlaylist={state.handleLoadPlaylist}
        />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Select a playlist to load</p>
        </div>
      </div>
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
      />

      <div
        ref={state.scrollDroppableRef}
        data-testid="track-list-scroll"
        className="flex-1 overflow-auto focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        style={{ paddingBottom: TRACK_ROW_HEIGHT * 2, overscrollBehaviorX: 'none' }}
        role="listbox"
        aria-multiselectable="true"
        aria-activedescendant={state.focusedIndex !== null ? `option-${panelId}-${state.focusedIndex}` : undefined}
        tabIndex={0}
        onKeyDown={state.handleKeyDownNavigation}
      >
        {/* Loading state */}
        {state.isLoading && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {/* Error state */}
        {state.error && (
          <div className="p-4 flex flex-col items-center justify-center text-center gap-3">
            <AlertCircle className="h-8 w-8 text-red-500" />
            {state.error instanceof AccessTokenExpiredError || 
             (state.error instanceof ApiError && (state.error.isUnauthorized || state.error.isForbidden)) ? (
              <>
                <p className="text-red-500 font-medium">Session expired</p>
                <p className="text-sm text-muted-foreground">
                  Please sign in again to access your playlists.
                </p>
                <SignInButton callbackUrl="/split-editor" className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors" />
              </>
            ) : state.error instanceof ApiError && state.error.isNotFound ? (
              <>
                <p className="text-red-500 font-medium">Playlist not found</p>
                <p className="text-sm text-muted-foreground">
                  This playlist may have been deleted or you don&apos;t have access to it.
                </p>
              </>
            ) : (
              <p className="text-red-500">
                Failed to load playlist: {state.error instanceof Error ? state.error.message : 'Unknown error'}
              </p>
            )}
          </div>
        )}

        {/* Empty state */}
        {!state.isLoading && !state.error && state.filteredTracks.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            {state.searchQuery ? 'No tracks match your search' : 'This playlist is empty'}
          </div>
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
                isDragSource={isDragSource}
                dropIndicatorIndex={dropIndicatorIndex}
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
      <AlertDialog open={state.showDeleteConfirmation} onOpenChange={state.setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {state.selection.size} tracks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {state.selection.size} tracks from the playlist. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={state.handleConfirmMultiDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
