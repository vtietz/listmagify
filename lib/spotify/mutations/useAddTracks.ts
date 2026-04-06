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
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';

import type { 
  AddTracksParams, 
  MutationResponse,
  PlaylistTracksData,
} from './types';

export function useAddTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddTracksParams): Promise<MutationResponse> => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
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
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      // Cancel outgoing refetches for both query types to prevent stale reads
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: playlistTracksByProvider(params.playlistId, providerId),
        }),
        queryClient.cancelQueries({
          queryKey: playlistTracksInfiniteByProvider(params.playlistId, providerId),
        }),
      ]);

      // Snapshot current data
      const previousData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracksByProvider(params.playlistId, providerId)
      );

      return { previousData };
    },
    onSuccess: async (_data: MutationResponse, params: AddTracksParams) => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      // Await refetch so the cache is guaranteed fresh before subsequent reads
      await queryClient.refetchQueries({ 
        queryKey: playlistTracksInfiniteByProvider(params.playlistId, providerId),
      });

      // Also refetch legacy query if it exists
      const currentData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracksByProvider(params.playlistId, providerId)
      );
      if (currentData) {
        await queryClient.refetchQueries({ 
          queryKey: playlistTracksByProvider(params.playlistId, providerId),
        });
      }

      // Notify other panels to refetch
      eventBus.emit('playlist:update', {
        playlistId: params.playlistId,
        providerId,
        cause: 'add',
      });
    },
    onError: (
      error: Error, 
      params: AddTracksParams, 
      context: { previousData?: PlaylistTracksData } | undefined
    ) => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
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
