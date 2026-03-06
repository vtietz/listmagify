/**
 * VirtualizedTrackListContainer component for rendering virtualized track lists.
 * Extracts the virtualization and rendering logic from PlaylistPanel for reusability.
 */

'use client';

import { useMemo } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { DropIndicator } from './DropIndicator';
import { InsertionMarkersOverlay } from './InsertionMarker';
import { TrackRowInner } from './track-row';
import { TrackContextMenu, type TrackActions } from './TrackContextMenu';
import type { MarkerActions } from './context-menu/types';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useAutoScrollTextStore } from '@/hooks/useAutoScrollTextStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useMobileOverlayStore } from './mobile/MobileBottomNav';
import { useDndStateStore } from '@/hooks/dnd/state';
import type { Track } from '@/lib/music-provider/types';

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
  buildReorderActions?: (trackPosition: number) => Record<string, (() => void) | undefined>;
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
  const setSearchQuery = useBrowsePanelStore((s) => s.setSearchQuery);
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  const hasActiveMarkersSelector = useInsertionPointsStore((s) => s.hasActiveMarkers);
  const hasAnyMarkersGlobal = hasActiveMarkersSelector();
  const { isPhone, hasTouch, isDesktop } = useDeviceType();
  const setMobileOverlay = useMobileOverlayStore((s) => s.setActiveOverlay);
  const isDndActive = useDndStateStore((s) => s.activeId !== null);
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  const showHandle = hasTouch || !isDesktop;
  const handleOnlyDrag = hasTouch;

  // Stable values computed once, not per row
  const allowMarkerToggle = !searchQuery && !isSorted;
  const isPlayingFromThisPanel = playbackContext?.sourceId === panelId;
  const profileGetter = hasMultipleContributors ? getProfile : undefined;

  const panelMarkerActions: MarkerActions = useMemo(() => ({
    ...(hasAnyMarkers ? { hasAnyMarkers } : undefined),
    ...(onAddToAllMarkers ? { onAddToAllMarkers } : undefined),
  }), [hasAnyMarkers, onAddToAllMarkers]);

  const sharedCtx = useMemo(() => ({
    isCompact, isAutoScrollEnabled, openBrowsePanel, setSearchQuery,
    togglePoint, hasAnyMarkersGlobal: hasAnyMarkersGlobal, isPhone,
    setMobileOverlay, isDndActive, openContextMenu, showHandle, handleOnlyDrag,
  }), [
    isCompact, isAutoScrollEnabled, openBrowsePanel, setSearchQuery,
    togglePoint, hasAnyMarkersGlobal, isPhone, setMobileOverlay,
    isDndActive, openContextMenu, showHandle, handleOnlyDrag,
  ]);

  const shouldShowContextMenu = contextMenu.isOpen && contextMenu.panelId === panelId;

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

          const idx = virtualRow.index;
          const selectionId = selectionKey(track, idx);
          const pos = track.position ?? idx;
          const trackUri = track.uri;
          const isRowDuplicate = isDuplicate(trackUri);

          return (
            <div
              key={`${panelId}-${selectionId}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                contain: 'layout style paint',
                contentVisibility: 'auto',
              }}
            >
              <TrackRowInner
                ctx={sharedCtx}
                track={track}
                index={idx}
                selectionKey={selectionId}
                isSelected={selection.has(selectionId)}
                isEditable={isEditable}
                locked={!canDrag}
                panelId={panelId}
                playlistId={playlistId}
                dndMode={dndMode}
                isDragSourceSelected={Boolean(isDragSource && selection.has(selectionId))}
                onSelect={handleTrackSelect}
                onClick={handleTrackClick}
                isMultiSelect={selection.size > 1}
                selectedCount={selection.size}
                isPlaying={track.id ? isTrackPlaying(track.id) : false}
                isPlaybackLoading={isTrackLoading(trackUri)}
                onPlay={playTrack}
                onPause={pausePlayback}
                isPlayingFromThisPanel={isPlayingFromThisPanel}
                showLikedColumn
                isLiked={track.id ? isLiked(track.id) : false}
                onToggleLiked={handleToggleLiked}
                hasInsertionMarker={allowMarkerToggle && activeMarkerIndices.has(pos)}
                hasInsertionMarkerAfter={allowMarkerToggle && activeMarkerIndices.has(pos + 1)}
                allowInsertionMarkerToggle={allowMarkerToggle}
                isDuplicate={isRowDuplicate}
                isSoftDuplicate={isSoftDuplicate ? isSoftDuplicate(trackUri) : false}
                isOtherInstanceSelected={isOtherInstanceSelected(trackUri)}
                compareColor={getCompareColorForTrack(trackUri)}
                isCollaborative={hasMultipleContributors}
                getProfile={profileGetter}
                cumulativeDurationMs={cumulativeDurations[idx] || 0}
                crossesHourBoundary={hourBoundaries.has(idx)}
                hourNumber={hourBoundaries.get(idx) || 0}
                markerActions={panelMarkerActions}
                {...(buildReorderActions ? { reorderActions: buildReorderActions(pos) } : {})}
                {...(contextTrackActions || onDeleteTrackDuplicates ? { contextTrackActions: buildRowContextActions(
                  contextTrackActions, onDeleteTrackDuplicates, track, pos, isRowDuplicate,
                )! } : {})}
              />
            </div>
          );
        })}
      </div>

      {/* Global context menu for this panel */}
      {shouldShowContextMenu && contextMenu.track && (
        <TrackContextMenu
          track={contextMenu.track}
          isOpen
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
