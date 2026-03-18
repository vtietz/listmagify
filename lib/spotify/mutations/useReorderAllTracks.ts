/**
 * Hook for replacing the entire track order of a playlist.
 * Used to save the current visual order (after sorting) as the new permanent order.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import {
  playlistTracksByProvider,
  playlistTracksInfiniteByProvider,
} from '@/lib/api/queryKeys';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';

import type { ReorderAllTracksParams, MutationResponse } from './types';

export function useReorderAllTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderAllTracksParams): Promise<MutationResponse> => {
      const providerId = params.providerId ?? 'spotify';
      return apiFetch(`/api/playlists/${params.playlistId}/reorder-all?provider=${providerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackUris: params.trackUris,
        }),
      });
    },
    onSuccess: (_data: MutationResponse, params: ReorderAllTracksParams) => {
      const providerId = params.providerId ?? 'spotify';
      // Invalidate the playlist tracks to refetch with the new order
      queryClient.invalidateQueries({ 
        queryKey: playlistTracksInfiniteByProvider(params.playlistId, providerId),
      });
      
      // Also invalidate legacy query if it exists
      queryClient.invalidateQueries({ 
        queryKey: playlistTracksByProvider(params.playlistId, providerId),
      });

      // Notify other panels to refetch
      eventBus.emit('playlist:update', {
        playlistId: params.playlistId,
        providerId,
        cause: 'reorder',
      });
      
      toast.success('Playlist order saved');
    },
    onError: (_error: Error) => {
      // Global error interceptor in apiFetch will show the error dialog
      // Just show a brief toast for immediate feedback
      toast.error('Failed to save playlist order');
    },
  });
}

