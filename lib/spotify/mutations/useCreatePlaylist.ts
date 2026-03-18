/**
 * Hook for creating a new playlist.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { userPlaylistsByProvider } from '@/lib/api/queryKeys';
import { toast } from '@/lib/ui/toast';

import type { CreatePlaylistParams, CreatePlaylistResponse } from './types';

export function useCreatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreatePlaylistParams): Promise<CreatePlaylistResponse> => {
      const providerId = params.providerId ?? 'spotify';
      return apiFetch(`/api/playlists?provider=${providerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: params.name,
          description: params.description,
          isPublic: params.isPublic ?? false,
        }),
      });
    },
    onSuccess: (data: CreatePlaylistResponse, params: CreatePlaylistParams) => {
      const providerId = params.providerId ?? 'spotify';
      // Invalidate user playlists to refetch the updated list
      queryClient.invalidateQueries({ queryKey: userPlaylistsByProvider(providerId) });
      // Success - no toast needed
      // Return data for caller to use (e.g., optimistic UI update)
      return data;
    },
    onError: (error: Error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create playlist');
    },
  });
}
