/**
 * Hook for updating playlist details (name, description, public status).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistMeta } from '@/lib/api/queryKeys';
import { eventBus } from '@/lib/sync/eventBus';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

import type { UpdatePlaylistParams } from './types';

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdatePlaylistParams): Promise<{ success: boolean }> => {
      const { playlistId, ...updateData } = params;
      return apiFetch(`/api/playlists/${playlistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
    },
    onSuccess: (_data: { success: boolean }, params: UpdatePlaylistParams) => {
      // Invalidate the specific playlist's metadata
      queryClient.invalidateQueries({ queryKey: playlistMeta(params.playlistId) });
      // Also invalidate user playlists to update the grid
      queryClient.invalidateQueries({ queryKey: ['user-playlists'] });
      
      // Notify other panels
      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'metadata' });
      
      // Success - no toast needed
    },
    onError: (error: Error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update playlist');
    },
  });
}
