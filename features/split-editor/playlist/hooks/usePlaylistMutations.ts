/**
 * Hook for playlist mutations (remove, reorder, save order).
 */

'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getTrackSelectionKey } from '@/lib/dnd/selection';
import {
  useRemoveTracks,
  useReorderAllTracks,
  useReorderTracks,
} from '@/lib/spotify/playlistMutations';
import { getSortedValidTrackUris } from './panelUtils';
import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SortKey, SortDirection } from '@features/split-editor/playlist/hooks/usePlaylistSort';

interface UsePlaylistMutationsOptions {
  playlistId: string | null | undefined;
  providerId: MusicProviderId;
  panelId: string;
  isEditable: boolean;
  snapshotId: string | undefined;
  filteredTracks: Track[];
  sortedTracks: Track[];
  tracks: Track[];
  selection: Set<string>;
  setSelection: (panelId: string, keys: string[]) => void;
  setSort: (panelId: string, key: SortKey, direction: SortDirection) => void;
  getSelectionBounds: () => {
    firstIndex: number;
    lastIndex: number;
    firstPosition: number;
    lastPosition: number;
  } | null;
}

type ReorderWindow = {
  fromIndex: number;
  rangeLength: number;
  lastIndex: number;
};

function getReorderWindow(
  trackPosition: number,
  bounds: ReturnType<UsePlaylistMutationsOptions['getSelectionBounds']>,
  selectionSize: number
): ReorderWindow {
  const hasMultiSelection = Boolean(bounds) && selectionSize > 1;
  const fromIndex = hasMultiSelection && bounds ? bounds.firstPosition : trackPosition;
  const rangeLength = hasMultiSelection && bounds ? bounds.lastPosition - bounds.firstPosition + 1 : 1;
  const lastIndex = fromIndex + rangeLength - 1;

  return { fromIndex, rangeLength, lastIndex };
}

function getTotalTracks(filteredTracks: Track[], tracksLength: number): number {
  const hasStablePositions = filteredTracks.some((t) => typeof t?.position === 'number');
  return hasStablePositions ? tracksLength : filteredTracks.length;
}

function canMoveBelowPlayPosition({
  playPosition,
  totalTracks,
  fromIndex,
  lastIndex,
}: {
  playPosition: number | undefined;
  totalTracks: number;
  fromIndex: number;
  lastIndex: number;
}) {
  if (typeof playPosition !== 'number') {
    return false;
  }

  if (playPosition < 0 || playPosition >= totalTracks) {
    return false;
  }

  return !(playPosition >= fromIndex && playPosition <= lastIndex);
}

function getMoveBelowTargetIndex(playPosition: number, fromIndex: number, rangeLength: number): number {
  const targetFirstIndex =
    playPosition < fromIndex
      ? playPosition + 1
      : playPosition - rangeLength + 1;

  if (targetFirstIndex > fromIndex) {
    return targetFirstIndex + rangeLength;
  }

  return targetFirstIndex;
}

export function usePlaylistMutations({
  playlistId,
  providerId,
  panelId,
  isEditable,
  snapshotId,
  filteredTracks,
  sortedTracks,
  tracks,
  selection,
  setSelection,
  setSort,
  getSelectionBounds,
}: UsePlaylistMutationsOptions) {
  const queryClient = useQueryClient();
  const removeTracks = useRemoveTracks();
  const reorderAllTracks = useReorderAllTracks();
  const reorderTracks = useReorderTracks();

  // Delete selected tracks
  const handleDeleteSelected = useCallback(() => {
    if (!playlistId || selection.size === 0) return;
    const uriToPositions = new Map<string, number[]>();
    filteredTracks.forEach((track: Track, index: number) => {
      const key = getTrackSelectionKey(track, index);
      if (selection.has(key)) {
        const position = track.position ?? index;
        const positions = uriToPositions.get(track.uri) || [];
        positions.push(position);
        uriToPositions.set(track.uri, positions);
      }
    });

    const tracksToRemove: Array<{ uri: string; positions: number[] }> = [];
    uriToPositions.forEach((positions, uri) => {
      tracksToRemove.push({ uri, positions });
    });

    if (tracksToRemove.length === 0) return;
    const mutationParams = snapshotId
      ? { playlistId, providerId, tracks: tracksToRemove, snapshotId }
      : { playlistId, providerId, tracks: tracksToRemove };

    removeTracks.mutate(mutationParams, {
      onSuccess: () => setSelection(panelId, []),
    });
  }, [
    playlistId,
    providerId,
    selection,
    filteredTracks,
    removeTracks,
    snapshotId,
    panelId,
    setSelection,
  ]);

  // Delete handler that auto-selects next track after deletion
  const handleDeleteWithAutoSelect = useCallback(
    (nextIndexToSelect: number | null) => {
      if (!playlistId || selection.size === 0) return;
      const uriToPositions = new Map<string, number[]>();
      filteredTracks.forEach((track: Track, index: number) => {
        const key = getTrackSelectionKey(track, index);
        if (selection.has(key)) {
          const position = track.position ?? index;
          const positions = uriToPositions.get(track.uri) || [];
          positions.push(position);
          uriToPositions.set(track.uri, positions);
        }
      });

      const tracksToRemove: Array<{ uri: string; positions: number[] }> = [];
      uriToPositions.forEach((positions, uri) => {
        tracksToRemove.push({ uri, positions });
      });

      if (tracksToRemove.length === 0) return;
      const mutationParams = snapshotId
        ? { playlistId, providerId, tracks: tracksToRemove, snapshotId }
        : { playlistId, providerId, tracks: tracksToRemove };

      removeTracks.mutate(mutationParams, {
        onSuccess: () => {
          if (nextIndexToSelect !== null && nextIndexToSelect >= 0) {
            setTimeout(() => {
              const newTracks = queryClient.getQueryData<{
                pages: Array<{ items: Track[] }>;
              }>(['playlist', providerId, playlistId, 'tracks']);
              const allTracks = newTracks?.pages?.flatMap((p) => p.items) || [];
              if (allTracks.length > 0 && nextIndexToSelect < allTracks.length) {
                const trackToSelect = allTracks[nextIndexToSelect];
                if (trackToSelect) {
                  const newKey = getTrackSelectionKey(
                    trackToSelect,
                    nextIndexToSelect
                  );
                  setSelection(panelId, [newKey]);
                }
              } else if (allTracks.length > 0) {
                const lastIndex = allTracks.length - 1;
                const trackToSelect = allTracks[lastIndex];
                if (trackToSelect) {
                  const newKey = getTrackSelectionKey(trackToSelect, lastIndex);
                  setSelection(panelId, [newKey]);
                }
              } else {
                setSelection(panelId, []);
              }
            }, 100);
          } else {
            setSelection(panelId, []);
          }
        },
      });
    },
    [
      playlistId,
      providerId,
      selection,
      filteredTracks,
      removeTracks,
      snapshotId,
      panelId,
      setSelection,
      queryClient,
    ]
  );

  // Get URIs for saving order
  const getSortedTrackUris = useCallback(
    (): string[] => getSortedValidTrackUris(sortedTracks),
    [sortedTracks]
  );

  // Save current sorted order as the new playlist order
  const handleSaveCurrentOrder = useCallback(async () => {
    if (!playlistId || !isEditable) return;

    const trackUris = getSortedTrackUris();
    if (trackUris.length === 0) {
      console.warn('[handleSaveCurrentOrder] No valid track URIs found to save');
      return;
    }

    const totalTracks = sortedTracks.length;
    if (trackUris.length < totalTracks) {
      console.warn(
        `[handleSaveCurrentOrder] ${totalTracks - trackUris.length} track(s) filtered out ` +
          `(local files, episodes, or tracks without valid URIs). Saving ${trackUris.length} valid tracks.`
      );
    }

    try {
      await reorderAllTracks.mutateAsync({ playlistId, providerId, trackUris });
      setSort(panelId, 'position', 'asc');
    } catch (error) {
      console.error('[handleSaveCurrentOrder] Failed to save playlist order:', error);
      throw error;
    }
  }, [
    panelId,
    playlistId,
    providerId,
    isEditable,
    getSortedTrackUris,
    sortedTracks,
    reorderAllTracks,
    setSort,
  ]);

  // Build reorder actions for context menu
  const buildReorderActions = useCallback(
    (trackPosition: number, playPosition?: number) => {
      if (!playlistId || !isEditable) return {};

      const bounds = getSelectionBounds();
      const { fromIndex, rangeLength, lastIndex } = getReorderWindow(trackPosition, bounds, selection.size);
      const totalTracks = getTotalTracks(filteredTracks, tracks.length);
      const canMoveBelow = canMoveBelowPlayPosition({
        playPosition,
        totalTracks,
        fromIndex,
        lastIndex,
      });

      const makeReorderAction = (toIndex: number) => () => {
        reorderTracks.mutate({
          playlistId,
          providerId,
          fromIndex,
          toIndex,
          rangeLength,
        });
      };

      const actions: {
        onMoveUp?: () => void;
        onMoveDown?: () => void;
        onMoveToTop?: () => void;
        onMoveToBottom?: () => void;
        onMoveBelowPlayPosition?: () => void;
      } = {};

      if (fromIndex > 0) {
        actions.onMoveUp = makeReorderAction(fromIndex - 1);
        actions.onMoveToTop = makeReorderAction(0);
      }

      if (lastIndex < totalTracks - 1) {
        actions.onMoveDown = makeReorderAction(fromIndex + rangeLength + 1);
        actions.onMoveToBottom = makeReorderAction(totalTracks);
      }

      if (canMoveBelow && typeof playPosition === 'number') {
        actions.onMoveBelowPlayPosition = () => {
          const targetFirstIndex =
            playPosition < fromIndex ? playPosition + 1 : playPosition - rangeLength + 1;
          if (targetFirstIndex === fromIndex) {
            return;
          }

          const toIndex = getMoveBelowTargetIndex(playPosition, fromIndex, rangeLength);

          reorderTracks.mutate({
            playlistId,
            fromIndex,
            toIndex,
            rangeLength,
          });
        };
      }

      return actions;
    },
    [
      playlistId,
      providerId,
      isEditable,
      selection,
      getSelectionBounds,
      filteredTracks,
      tracks.length,
      reorderTracks,
    ]
  );

  return {
    removeTracks,
    reorderAllTracks,
    reorderTracks,
    handleDeleteSelected,
    handleDeleteWithAutoSelect,
    getSortedTrackUris,
    handleSaveCurrentOrder,
    buildReorderActions,
    isSavingOrder: reorderAllTracks.isPending,
  };
}
