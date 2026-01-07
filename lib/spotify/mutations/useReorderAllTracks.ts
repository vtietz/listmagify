/**
 * Hook for replacing the entire track order of a playlist.
 * Used to save the current visual order (after sorting) as the new permanent order.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistTracks, playlistTracksInfinite } from '@/lib/api/queryKeys';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';

import type { ReorderAllTracksParams, MutationResponse } from './types';

export function useReorderAllTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderAllTracksParams): Promise<MutationResponse> => {
      return apiFetch(`/api/playlists/${params.playlistId}/reorder-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackUris: params.trackUris,
        }),
      });
    },
    onSuccess: (_data: MutationResponse, params: ReorderAllTracksParams) => {
      // Invalidate the playlist tracks to refetch with the new order
      queryClient.invalidateQueries({ 
        queryKey: playlistTracksInfinite(params.playlistId),
      });
      
      // Also invalidate legacy query if it exists
      queryClient.invalidateQueries({ 
        queryKey: playlistTracks(params.playlistId),
      });

      // Notify other panels to refetch
      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'reorder' });
      
      toast.success('Playlist order saved');
    },
    onError: (error: Error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save playlist order');
    },
  });
}
