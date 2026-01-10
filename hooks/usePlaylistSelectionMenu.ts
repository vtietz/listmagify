'use client';

import { useCallback } from 'react';

import type { Track } from '@/lib/spotify/types';
import type { MarkerActions } from '@/components/split-editor/TrackContextMenu';

type SelectionBounds = {
  firstPosition: number;
  lastPosition: number;
};

type FirstSelected = {
  track: Track;
};

type OpenContextMenuArgs = {
  track: Track;
  position: { x: number; y: number };
  isMultiSelect: boolean;
  selectedCount: number;
  isEditable: boolean;
  panelId: string;
  markerActions: MarkerActions;
  trackActions: {
    onRemoveFromPlaylist?: () => void;
    canRemove?: boolean;
    onClearSelection?: () => void;
    onDeleteTrackDuplicates?: () => void;
    onToggleLiked?: () => void;
    isLiked?: boolean;
    onLikeAll?: () => void;
    onUnlikeAll?: () => void;
  };
  reorderActions: Record<string, (() => void) | undefined>;
};

type PlaylistPanelStateLike = {
  playlistId: string | null;
  isEditable: boolean;

  activeMarkerIndices: Set<number>;

  selection: Set<string>;
  focusedIndex: number | null;

  filteredTracks: Track[];

  selectionKey: (track: Track, index: number) => string;

  getFirstSelectedTrack: () => FirstSelected | null;
  getSelectionBounds: () => SelectionBounds | null;
  clearSelection: () => void;

  handleDeleteSelected: () => void;

  buildReorderActions: (trackPosition: number) => Record<string, (() => void) | undefined>;

  // Liked actions
  handleToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  isLiked: (trackId: string) => boolean;

  // Duplicates
  isDuplicate: (trackUri: string) => boolean;
  handleDeleteTrackDuplicates?: (track: Track, position: number) => void | Promise<void>;
};

type UsePlaylistSelectionMenuArgs = {
  panelId: string;
  state: PlaylistPanelStateLike;
  openContextMenu: (args: OpenContextMenuArgs) => void;
  togglePoint: (playlistId: string, position: number) => void;
  hasActiveMarkers: boolean;
  handleAddToAllMarkers: () => void;
};

export function usePlaylistSelectionMenu({
  panelId,
  state,
  openContextMenu,
  togglePoint,
  hasActiveMarkers,
  handleAddToAllMarkers,
}: UsePlaylistSelectionMenuArgs) {
  return useCallback(
    (position: { x: number; y: number }) => {
      const selected = state.getFirstSelectedTrack();
      const bounds = state.getSelectionBounds();
      if (!selected || !bounds) return;

      const showMulti = state.selection.size > 1;

      // Prefer focused selected track as primary (title + keep-target)
      const focusedIndex = state.focusedIndex;
      const focusedTrack =
        focusedIndex !== null && focusedIndex >= 0 && focusedIndex < state.filteredTracks.length
          ? state.filteredTracks[focusedIndex]
          : null;
      const focusedKey =
        focusedTrack && focusedIndex !== null ? state.selectionKey(focusedTrack, focusedIndex) : null;
      const primaryTrack =
        focusedTrack && focusedKey && state.selection.has(focusedKey) ? focusedTrack : selected.track;
      const primaryPosition =
        focusedTrack && focusedKey && state.selection.has(focusedKey) && focusedIndex !== null
          ? (focusedTrack.position ?? focusedIndex)
          : bounds.firstPosition;

      const trackActions: {
        onRemoveFromPlaylist?: () => void;
        canRemove?: boolean;
        onClearSelection?: () => void;
        onDeleteTrackDuplicates?: () => void;
        onToggleLiked?: () => void;
        isLiked?: boolean;
        onLikeAll?: () => void;
        onUnlikeAll?: () => void;
      } = {
        onClearSelection: state.clearSelection,
      };

      if (state.isEditable) {
        trackActions.onRemoveFromPlaylist = state.handleDeleteSelected;
        trackActions.canRemove = true;
      }

      if (!showMulti) {
        const trackId = primaryTrack.id;
        if (trackId) {
          trackActions.onToggleLiked = () => state.handleToggleLiked(trackId, state.isLiked(trackId));
          trackActions.isLiked = state.isLiked(trackId);
        }

        if (state.isEditable && state.handleDeleteTrackDuplicates && state.isDuplicate(primaryTrack.uri)) {
          trackActions.onDeleteTrackDuplicates = () =>
            state.handleDeleteTrackDuplicates?.(primaryTrack, primaryPosition);
        }
      } else {
        const selectedTrackIds = state.filteredTracks
          .map((track, index) => ({ track, key: state.selectionKey(track, index) }))
          .filter(({ key }) => state.selection.has(key))
          .map(({ track }) => track.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

        trackActions.onLikeAll = () => {
          for (const trackId of selectedTrackIds) {
            if (!state.isLiked(trackId)) {
              state.handleToggleLiked(trackId, false);
            }
          }
        };

        trackActions.onUnlikeAll = () => {
          for (const trackId of selectedTrackIds) {
            if (state.isLiked(trackId)) {
              state.handleToggleLiked(trackId, true);
            }
          }
        };

        // Remove duplicates for each duplicated URI in the selection
        // Keeps one selected instance per URI (the primary selected track for its URI).
        if (state.isEditable && state.handleDeleteTrackDuplicates) {
          const selectedTracksWithPositions = state.filteredTracks
            .map((track, index) => ({ track, key: state.selectionKey(track, index), index }))
            .filter(({ key }) => state.selection.has(key))
            .map(({ track, index }) => ({ track, position: track.position ?? index }));

          const primaryUri = primaryTrack.uri;
          const primaryItem = selectedTracksWithPositions.find(
            (item) => item.track.uri === primaryUri && item.position === primaryPosition
          );

          const keepByUri = new Map<string, { track: Track; position: number }>();

          if (primaryItem && state.isDuplicate(primaryItem.track.uri)) {
            keepByUri.set(primaryItem.track.uri, primaryItem);
          }

          for (const item of selectedTracksWithPositions) {
            if (!state.isDuplicate(item.track.uri)) continue;
            const existing = keepByUri.get(item.track.uri);
            if (!existing || item.position < existing.position) {
              keepByUri.set(item.track.uri, item);
            }
          }

          if (keepByUri.size > 0) {
            trackActions.onDeleteTrackDuplicates = () => {
              const items = Array.from(keepByUri.values()).sort((a, b) => b.position - a.position);
              void (async () => {
                for (const item of items) {
                  await state.handleDeleteTrackDuplicates?.(item.track, item.position);
                }
              })();
            };
          }
        }
      }

      const markerActions: MarkerActions = {
        hasAnyMarkers: hasActiveMarkers,
      };

      if (state.playlistId && state.isEditable) {
        const markers = state.activeMarkerIndices;
        markerActions.hasMarkerBefore = markers.has(bounds.firstPosition);
        markerActions.hasMarkerAfter = markers.has(bounds.lastPosition + 1);

        markerActions.onAddMarkerBefore = () => togglePoint(state.playlistId!, bounds.firstPosition);
        markerActions.onAddMarkerAfter = () => togglePoint(state.playlistId!, bounds.lastPosition + 1);
      }

      if (hasActiveMarkers) {
        markerActions.onAddToAllMarkers = handleAddToAllMarkers;
      }

      const reorderActions = state.buildReorderActions(bounds.firstPosition);

      openContextMenu({
        track: primaryTrack,
        position,
        isMultiSelect: showMulti,
        selectedCount: showMulti ? state.selection.size : 1,
        isEditable: state.isEditable,
        panelId,
        markerActions,
        trackActions,
        reorderActions,
      });
    },
    [
      panelId,
      state,
      openContextMenu,
      togglePoint,
      hasActiveMarkers,
      handleAddToAllMarkers,
    ]
  );
}
