'use client';

import { useCallback } from 'react';

import type { Track } from '@/lib/music-provider/types';
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
  playlistId: string | null | undefined;
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

type PrimarySelection = {
  track: Track;
  position: number;
  bounds: SelectionBounds;
  isMultiSelect: boolean;
  selectedCount: number;
};

type FocusedSelection = {
  track: Track;
  position: number;
};

function getFocusedSelection(state: PlaylistPanelStateLike): FocusedSelection | null {
  const focusedIndex = state.focusedIndex;

  if (focusedIndex === null || focusedIndex < 0 || focusedIndex >= state.filteredTracks.length) {
    return null;
  }

  const focusedTrack = state.filteredTracks[focusedIndex];
  if (!focusedTrack) {
    return null;
  }

  const focusedKey = state.selectionKey(focusedTrack, focusedIndex);
  if (!state.selection.has(focusedKey)) {
    return null;
  }

  return {
    track: focusedTrack,
    position: focusedTrack.position ?? focusedIndex,
  };
}

function getPrimarySelection(state: PlaylistPanelStateLike): PrimarySelection | null {
  const selected = state.getFirstSelectedTrack();
  const bounds = state.getSelectionBounds();

  if (!selected || !bounds) {
    return null;
  }

  const focusedSelection = getFocusedSelection(state);
  const primaryTrack = focusedSelection?.track ?? selected.track;
  const primaryPosition = focusedSelection?.position ?? bounds.firstPosition;

  return {
    track: primaryTrack,
    position: primaryPosition,
    bounds,
    isMultiSelect: state.selection.size > 1,
    selectedCount: state.selection.size > 1 ? state.selection.size : 1,
  };
}

function buildBaseTrackActions(state: PlaylistPanelStateLike): OpenContextMenuArgs['trackActions'] {
  const baseActions: OpenContextMenuArgs['trackActions'] = {
    onClearSelection: state.clearSelection,
  };

  if (state.isEditable) {
    baseActions.onRemoveFromPlaylist = state.handleDeleteSelected;
    baseActions.canRemove = true;
  }

  return baseActions;
}

function getSelectedTrackIds(state: PlaylistPanelStateLike): string[] {
  return state.filteredTracks
    .map((track, index) => ({ track, key: state.selectionKey(track, index) }))
    .filter(({ key }) => state.selection.has(key))
    .map(({ track }) => track.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function createSingleSelectionActions(
  state: PlaylistPanelStateLike,
  primaryTrack: Track,
  primaryPosition: number
): Pick<OpenContextMenuArgs['trackActions'], 'onToggleLiked' | 'isLiked' | 'onDeleteTrackDuplicates'> {
  const actions: Pick<OpenContextMenuArgs['trackActions'], 'onToggleLiked' | 'isLiked' | 'onDeleteTrackDuplicates'> = {};
  const trackId = primaryTrack.id;

  if (trackId) {
    actions.onToggleLiked = () => state.handleToggleLiked(trackId, state.isLiked(trackId));
    actions.isLiked = state.isLiked(trackId);
  }

  if (state.isEditable && state.handleDeleteTrackDuplicates && state.isDuplicate(primaryTrack.uri)) {
    actions.onDeleteTrackDuplicates = () => state.handleDeleteTrackDuplicates?.(primaryTrack, primaryPosition);
  }

  return actions;
}

function getDuplicateSelectionKeepMap(
  state: PlaylistPanelStateLike,
  primaryTrack: Track,
  primaryPosition: number
): Map<string, { track: Track; position: number }> {
  const selectedTracksWithPositions = state.filteredTracks
    .map((track, index) => ({ track, key: state.selectionKey(track, index), index }))
    .filter(({ key }) => state.selection.has(key))
    .map(({ track, index }) => ({ track, position: track.position ?? index }));

  const keepByUri = new Map<string, { track: Track; position: number }>();
  const primaryUri = primaryTrack.uri;
  const primaryItem = selectedTracksWithPositions.find(
    (item) => item.track.uri === primaryUri && item.position === primaryPosition
  );

  if (primaryItem && state.isDuplicate(primaryItem.track.uri)) {
    keepByUri.set(primaryItem.track.uri, primaryItem);
  }

  for (const item of selectedTracksWithPositions) {
    if (!state.isDuplicate(item.track.uri)) {
      continue;
    }

    const existing = keepByUri.get(item.track.uri);
    if (!existing || item.position < existing.position) {
      keepByUri.set(item.track.uri, item);
    }
  }

  return keepByUri;
}

function createMultiSelectionActions(
  state: PlaylistPanelStateLike,
  primaryTrack: Track,
  primaryPosition: number
): Pick<OpenContextMenuArgs['trackActions'], 'onLikeAll' | 'onUnlikeAll' | 'onDeleteTrackDuplicates'> {
  const selectedTrackIds = getSelectedTrackIds(state);

  const actions: Pick<OpenContextMenuArgs['trackActions'], 'onLikeAll' | 'onUnlikeAll' | 'onDeleteTrackDuplicates'> = {
    onLikeAll: () => {
      for (const trackId of selectedTrackIds) {
        if (!state.isLiked(trackId)) {
          state.handleToggleLiked(trackId, false);
        }
      }
    },
    onUnlikeAll: () => {
      for (const trackId of selectedTrackIds) {
        if (state.isLiked(trackId)) {
          state.handleToggleLiked(trackId, true);
        }
      }
    },
  };

  if (!state.isEditable || !state.handleDeleteTrackDuplicates) {
    return actions;
  }

  const keepByUri = getDuplicateSelectionKeepMap(state, primaryTrack, primaryPosition);
  if (keepByUri.size === 0) {
    return actions;
  }

  actions.onDeleteTrackDuplicates = () => {
    const items = Array.from(keepByUri.values()).sort((a, b) => b.position - a.position);
    void (async () => {
      for (const item of items) {
        await state.handleDeleteTrackDuplicates?.(item.track, item.position);
      }
    })();
  };

  return actions;
}

function buildTrackActions(
  state: PlaylistPanelStateLike,
  primaryTrack: Track,
  primaryPosition: number,
  isMultiSelect: boolean
): OpenContextMenuArgs['trackActions'] {
  if (isMultiSelect) {
    return {
      ...buildBaseTrackActions(state),
      ...createMultiSelectionActions(state, primaryTrack, primaryPosition),
    };
  }

  return {
    ...buildBaseTrackActions(state),
    ...createSingleSelectionActions(state, primaryTrack, primaryPosition),
  };
}

function buildMarkerActions(
  state: PlaylistPanelStateLike,
  bounds: SelectionBounds,
  hasActiveMarkers: boolean,
  togglePoint: (playlistId: string, position: number) => void,
  handleAddToAllMarkers: () => void
): MarkerActions {
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

  return markerActions;
}

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
      const selection = getPrimarySelection(state);
      if (!selection) {
        return;
      }

      const trackActions = buildTrackActions(
        state,
        selection.track,
        selection.position,
        selection.isMultiSelect
      );

      const markerActions = buildMarkerActions(
        state,
        selection.bounds,
        hasActiveMarkers,
        togglePoint,
        handleAddToAllMarkers
      );

      const reorderActions = state.buildReorderActions(selection.bounds.firstPosition);

      openContextMenu({
        track: selection.track,
        position,
        isMultiSelect: selection.isMultiSelect,
        selectedCount: selection.selectedCount,
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
