/**
 * Hook for adding tracks to a playlist (copy operation).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import {
  playlistTracksByProvider,
  playlistTracksInfiniteByProvider,
} from '@/lib/api/queryKeys';
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
      const providerId = params.providerId ?? 'spotify';
      // Intentionally omit snapshotId to avoid stale snapshot errors
      // The Spotify API will operate on the current playlist state
      return apiFetch(`/api/playlists/${params.playlistId}/tracks/add?provider=${providerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackUris: params.trackUris,
          position: params.position,
        }),
      });
    },
    onMutate: async (params: AddTracksParams) => {
      const providerId = params.providerId ?? 'spotify';
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: playlistTracksByProvider(params.playlistId, providerId),
      });

      // Snapshot current data
      const previousData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracksByProvider(params.playlistId, providerId)
      );

      // Optimistically update - we don't have full track data here, so we'll wait for refetch
      // Just emit the event so other panels know to refresh

      return { previousData };
    },
    onSuccess: (_data: MutationResponse, params: AddTracksParams) => {
      const providerId = params.providerId ?? 'spotify';
      // Invalidate the infinite query to refetch with the new tracks
      // We can't do optimistic updates for add because we only have URIs, not full Track objects
      queryClient.invalidateQueries({ 
        queryKey: playlistTracksInfiniteByProvider(params.playlistId, providerId),
      });

      // Also invalidate legacy query if it exists
      const currentData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracksByProvider(params.playlistId, providerId)
      );
      if (currentData) {
        queryClient.invalidateQueries({ 
          queryKey: playlistTracksByProvider(params.playlistId, providerId),
        });
      }

      // Notify other panels to refetch
      eventBus.emit('playlist:update', {
        playlistId: params.playlistId,
        providerId,
        cause: 'add',
      });

      // Success - no toast needed
    },
    onError: (
      error: Error, 
      params: AddTracksParams, 
      context: { previousData?: PlaylistTracksData } | undefined
    ) => {
      const providerId = params.providerId ?? 'spotify';
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(
          playlistTracksByProvider(params.playlistId, providerId),
          context.previousData
        );
      }

      toast.error(error instanceof Error ? error.message : 'Failed to add tracks');
    },
  });
}
