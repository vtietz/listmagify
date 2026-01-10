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
import type { Track } from '@/lib/spotify/types';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';

interface UsePlaylistMutationsOptions {
  playlistId: string | null | undefined;
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

export function usePlaylistMutations({
  playlistId,
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
      ? { playlistId, tracks: tracksToRemove, snapshotId }
      : { playlistId, tracks: tracksToRemove };

    removeTracks.mutate(mutationParams, {
      onSuccess: () => setSelection(panelId, []),
    });
  }, [
    playlistId,
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
        ? { playlistId, tracks: tracksToRemove, snapshotId }
        : { playlistId, tracks: tracksToRemove };

      removeTracks.mutate(mutationParams, {
        onSuccess: () => {
          if (nextIndexToSelect !== null && nextIndexToSelect >= 0) {
            setTimeout(() => {
              const newTracks = queryClient.getQueryData<{
                pages: Array<{ items: Track[] }>;
              }>(['playlist', playlistId, 'tracks']);
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
      await reorderAllTracks.mutateAsync({ playlistId, trackUris });
      setSort(panelId, 'position', 'asc');
    } catch (error) {
      console.error('[handleSaveCurrentOrder] Failed to save playlist order:', error);
      throw error;
    }
  }, [
    panelId,
    playlistId,
    isEditable,
    getSortedTrackUris,
    sortedTracks,
    reorderAllTracks,
    setSort,
  ]);

  // Build reorder actions for context menu
  const buildReorderActions = useCallback(
    (trackPosition: number) => {
      if (!playlistId || !isEditable) return {};

      const bounds = getSelectionBounds();
      const isMulti = bounds && selection.size > 1;

      const fromIndex = isMulti ? bounds.firstPosition : trackPosition;
      const rangeLength = isMulti ? bounds.lastPosition - bounds.firstPosition + 1 : 1;
      const lastIndex = fromIndex + rangeLength - 1;

      const hasStablePositions = filteredTracks.some(
        (t) => typeof t?.position === 'number'
      );
      const totalTracks = hasStablePositions ? tracks.length : filteredTracks.length;

      return {
        onMoveUp:
          fromIndex > 0
            ? () => {
                reorderTracks.mutate({
                  playlistId,
                  fromIndex,
                  toIndex: fromIndex - 1,
                  rangeLength,
                });
              }
            : undefined,
        onMoveDown:
          lastIndex < totalTracks - 1
            ? () => {
                reorderTracks.mutate({
                  playlistId,
                  fromIndex,
                  toIndex: fromIndex + rangeLength + 1,
                  rangeLength,
                });
              }
            : undefined,
        onMoveToTop:
          fromIndex > 0
            ? () => {
                reorderTracks.mutate({
                  playlistId,
                  fromIndex,
                  toIndex: 0,
                  rangeLength,
                });
              }
            : undefined,
        onMoveToBottom:
          lastIndex < totalTracks - 1
            ? () => {
                reorderTracks.mutate({
                  playlistId,
                  fromIndex,
                  toIndex: totalTracks,
                  rangeLength,
                });
              }
            : undefined,
      };
    },
    [
      playlistId,
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
