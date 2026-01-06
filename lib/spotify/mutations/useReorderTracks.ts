/**
 * Hook for reordering tracks within a playlist.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistTracks, playlistTracksInfinite } from '@/lib/api/queryKeys';
import { applyReorderToInfinitePages } from '@/lib/dnd/sortUtils';
import { eventBus } from '@/lib/sync/eventBus';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

import type { 
  ReorderTracksParams, 
  MutationResponse,
  PlaylistTracksData,
  InfinitePlaylistData,
} from './types';
import {
  cancelPlaylistQueries,
  snapshotPlaylistCaches,
  rollbackPlaylistCaches,
  updateLegacySnapshotId,
} from './helpers';

export function useReorderTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderTracksParams): Promise<MutationResponse> => {
      return apiFetch(`/api/playlists/${params.playlistId}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromIndex: params.fromIndex,
          toIndex: params.toIndex,
          rangeLength: params.rangeLength ?? 1,
          snapshotId: params.snapshotId,
        }),
      });
    },
    onMutate: async (params: ReorderTracksParams) => {
      // Cancel outgoing refetches for both query keys
      await cancelPlaylistQueries(queryClient, params.playlistId);

      // Snapshot both caches for rollback
      const { previousInfiniteData, previousData } = snapshotPlaylistCaches(
        queryClient, 
        params.playlistId
      );

      const rangeLength = params.rangeLength ?? 1;

      // Optimistically reorder in infinite query (primary)
      if (previousInfiniteData) {
        const newData = applyReorderToInfinitePages(
          previousInfiniteData, 
          params.fromIndex, 
          params.toIndex, 
          rangeLength
        );
        queryClient.setQueryData(playlistTracksInfinite(params.playlistId), newData);
      }

      // Also update legacy single-page query for backwards compatibility
      if (previousData) {
        const newTracks = [...previousData.tracks];
        const movedItems = newTracks.splice(params.fromIndex, rangeLength);
        const insertAt = params.toIndex > params.fromIndex 
          ? params.toIndex - rangeLength 
          : params.toIndex;
        newTracks.splice(insertAt, 0, ...movedItems);

        queryClient.setQueryData(playlistTracks(params.playlistId), {
          ...previousData,
          tracks: newTracks,
        });
      }

      return { previousInfiniteData, previousData };
    },
    onSuccess: async (data: MutationResponse, params: ReorderTracksParams) => {
      // Refetch from server to get correct positions
      // This ensures the UI reflects the exact server state after reorder
      await queryClient.refetchQueries({
        queryKey: playlistTracksInfinite(params.playlistId),
      });

      // Also update legacy query snapshotId
      updateLegacySnapshotId(queryClient, params.playlistId, data.snapshotId);

      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'reorder' });
      // Success - no toast needed
    },
    onError: (
      error: Error, 
      params: ReorderTracksParams, 
      context: { previousInfiniteData?: InfinitePlaylistData; previousData?: PlaylistTracksData } | undefined
    ) => {
      // Rollback both caches
      rollbackPlaylistCaches(queryClient, params.playlistId, context);
      toast.error(error instanceof Error ? error.message : 'Failed to reorder tracks');
    },
  });
}
