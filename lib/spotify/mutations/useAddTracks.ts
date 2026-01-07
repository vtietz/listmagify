/**
 * Hook for adding tracks to a playlist (copy operation).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistTracks, playlistTracksInfinite } from '@/lib/api/queryKeys';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';

import type { 
  AddTracksParams, 
  MutationResponse,
  PlaylistTracksData,
} from './types';

export function useAddTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddTracksParams): Promise<MutationResponse> => {
      // Intentionally omit snapshotId to avoid stale snapshot errors
      // The Spotify API will operate on the current playlist state
      return apiFetch(`/api/playlists/${params.playlistId}/tracks/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackUris: params.trackUris,
          position: params.position,
        }),
      });
    },
    onMutate: async (params: AddTracksParams) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: playlistTracks(params.playlistId) });

      // Snapshot current data
      const previousData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
      );

      // Optimistically update - we don't have full track data here, so we'll wait for refetch
      // Just emit the event so other panels know to refresh

      return { previousData };
    },
    onSuccess: (_data: MutationResponse, params: AddTracksParams) => {
      // Invalidate the infinite query to refetch with the new tracks
      // We can't do optimistic updates for add because we only have URIs, not full Track objects
      queryClient.invalidateQueries({ 
        queryKey: playlistTracksInfinite(params.playlistId),
      });

      // Also invalidate legacy query if it exists
      const currentData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
      );
      if (currentData) {
        queryClient.invalidateQueries({ 
          queryKey: playlistTracks(params.playlistId),
        });
      }

      // Notify other panels to refetch
      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'add' });

      // Success - no toast needed
    },
    onError: (
      error: Error, 
      params: AddTracksParams, 
      context: { previousData?: PlaylistTracksData } | undefined
    ) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(
          playlistTracks(params.playlistId),
          context.previousData
        );
      }

      toast.error(error instanceof Error ? error.message : 'Failed to add tracks');
    },
  });
}
