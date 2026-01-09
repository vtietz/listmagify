/**
 * VirtualizedTrackListContainer component for rendering virtualized track lists.
 * Extracts the virtualization and rendering logic from PlaylistPanel for reusability.
 */

'use client';

import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { VirtualItem } from '@tanstack/react-virtual';
import { DropIndicator } from './DropIndicator';
import { InsertionMarkersOverlay } from './InsertionMarker';
import { TrackRow } from './TrackRow';
import { TrackContextMenu, type TrackActions } from './TrackContextMenu';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import type { Track } from '@/lib/spotify/types';

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
  /** Index where to show drop indicator */
  dropIndicatorIndex?: number | null;
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
  /** Context items for SortableContext */
  contextItems: string[];
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
  /** Function to check if a track URI is a duplicate */
  isDuplicate: (trackUri: string) => boolean;
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
  /** Optional handler to delete duplicates of a specific track */
  onDeleteTrackDuplicates?: (track: Track, position: number) => void | Promise<void>;
  /** Optional track actions for context menu (e.g., remove from playlist) */
  contextTrackActions?: Partial<TrackActions>;
}

export function VirtualizedTrackListContainer({
  panelId,
  playlistId,
  isEditable,
  canDrag,
  dndMode,
  isDragSource,
  dropIndicatorIndex,
  searchQuery,
  isSorted,
  totalSize,
  rowHeight,
  virtualItems,
  filteredTracks,
  contextItems,
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
  isOtherInstanceSelected,
  getCompareColorForTrack,
  getProfile,
  handleTrackSelect,
  handleTrackClick,
  handleToggleLiked,
  playTrack,
  pausePlayback,
  onDeleteTrackDuplicates,
  contextTrackActions,
}: VirtualizedTrackListContainerProps) {
  // Get context menu state from global store
  const contextMenu = useContextMenuStore();
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);

  // Only render context menu if it belongs to this panel
  const shouldShowContextMenu = contextMenu.isOpen && contextMenu.panelId === panelId;

  return (
    <>
      <SortableContext
      items={contextItems}
      strategy={verticalListSortingStrategy}
    >
      <div
        style={{
          height: `${totalSize}px`,
          position: 'relative',
        }}
      >
        {/* Visual drop indicator line */}
        <DropIndicator
          panelId={panelId}
          dropIndicatorIndex={dropIndicatorIndex}
          virtualItems={virtualItems}
          filteredTracksCount={filteredTracks.length}
        />

        {/* Insertion point markers - hidden when sorted since positions don't match visual order */}
        {playlistId && isEditable && activeMarkerIndices.size > 0 && !searchQuery && !isSorted && (
          <InsertionMarkersOverlay
            playlistId={playlistId}
            totalTracks={filteredTracks.length}
            rowHeight={rowHeight}
            showToggles={!isDragSource}
            activeIndices={activeMarkerIndices}
          />
        )}

        {virtualItems.map((virtualRow) => {
          const track = filteredTracks[virtualRow.index];
          if (!track) return null;
          
          const selectionId = selectionKey(track, virtualRow.index);
          const trackId = track.id || track.uri;
          const positionActual = track.position ?? virtualRow.index;

          return (
            <div
              key={`${panelId}-${trackId}-${virtualRow.index}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <TrackRow
                track={track}
                index={virtualRow.index}
                selectionKey={selectionId}
                isSelected={selection.has(selectionId)}
                isEditable={isEditable}
                locked={!canDrag}
                onSelect={handleTrackSelect}
                onClick={handleTrackClick}
                panelId={panelId}
                playlistId={playlistId}
                dndMode={dndMode}
                isDragSourceSelected={Boolean(isDragSource && selection.has(selectionId))}
                showLikedColumn={true}
                isLiked={track.id ? isLiked(track.id) : false}
                onToggleLiked={handleToggleLiked}
                isPlaying={track.id ? isTrackPlaying(track.id) : false}
                isPlaybackLoading={isTrackLoading(track.uri)}
                onPlay={playTrack}
                onPause={pausePlayback}
                hasInsertionMarker={!searchQuery && !isSorted && activeMarkerIndices.has(positionActual)}
                hasInsertionMarkerAfter={!searchQuery && !isSorted && activeMarkerIndices.has(positionActual + 1)}
                allowInsertionMarkerToggle={!searchQuery && !isSorted}
                isCollaborative={hasMultipleContributors}
                getProfile={hasMultipleContributors ? getProfile : undefined}
                cumulativeDurationMs={cumulativeDurations[virtualRow.index] || 0}
                crossesHourBoundary={hourBoundaries.has(virtualRow.index)}
                hourNumber={hourBoundaries.get(virtualRow.index) || 0}
                isDuplicate={isDuplicate(track.uri)}
                isOtherInstanceSelected={isOtherInstanceSelected(track.uri)}
                compareColor={getCompareColorForTrack(track.uri)}
                isMultiSelect={selection.size > 1}
                selectedCount={selection.size}
                {...(onDeleteTrackDuplicates || contextTrackActions ? { contextTrackActions: {
                  ...contextTrackActions,
                  ...(onDeleteTrackDuplicates ? { onDeleteTrackDuplicates: () => onDeleteTrackDuplicates(track, positionActual) } : {}),
                } } : {})}
              />
            </div>
          );
        })}
      </div>
    </SortableContext>

    {/* Global context menu for this panel */}
    {shouldShowContextMenu && contextMenu.track && (
      <TrackContextMenu
        track={contextMenu.track}
        isOpen={true}
        onClose={closeContextMenu}
        {...(contextMenu.position ? { position: contextMenu.position } : {})}
        {...(contextMenu.reorderActions ? { reorderActions: contextMenu.reorderActions } : {})}
        {...(contextMenu.markerActions ? { markerActions: contextMenu.markerActions } : {})}
        {...(contextMenu.trackActions ? { trackActions: contextMenu.trackActions } : {})}
        isMultiSelect={contextMenu.isMultiSelect}
        selectedCount={contextMenu.selectedCount}
        isEditable={contextMenu.isEditable}
      />
    )}
    </>
  );
}
