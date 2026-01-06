/**
 * Hook for creating a new playlist.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

import type { CreatePlaylistParams, CreatePlaylistResponse } from './types';

export function useCreatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreatePlaylistParams): Promise<CreatePlaylistResponse> => {
      return apiFetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: params.name,
          description: params.description,
          isPublic: params.isPublic ?? false,
        }),
      });
    },
    onSuccess: (data: CreatePlaylistResponse) => {
      // Invalidate user playlists to refetch the updated list
      queryClient.invalidateQueries({ queryKey: ['user-playlists'] });
      // Success - no toast needed
      // Return data for caller to use (e.g., optimistic UI update)
      return data;
    },
    onError: (error: Error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create playlist');
    },
  });
}
