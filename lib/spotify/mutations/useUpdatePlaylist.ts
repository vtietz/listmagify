/**
 * Hook for updating playlist details (name, description, public status).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistMeta, userPlaylists } from '@/lib/api/queryKeys';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';
import type { Playlist } from '@/lib/music-provider/types';
import type { InfiniteData } from '@tanstack/react-query';

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
    onMutate: async (params: UpdatePlaylistParams) => {
      const previousMeta = queryClient.getQueryData<{
        id: string;
        name: string;
        description: string;
        owner: { id: string; displayName: string };
        collaborative: boolean;
        tracksTotal: number;
        isPublic: boolean;
      }>(playlistMeta(params.playlistId));

      const previousUserPlaylists = queryClient.getQueryData<
        InfiniteData<{ items: Playlist[]; nextCursor: string | null; total: number }>
      >(userPlaylists());

      queryClient.setQueryData(
        playlistMeta(params.playlistId),
        (current:
          | {
              id: string;
              name: string;
              description: string;
              owner: { id: string; displayName: string };
              collaborative: boolean;
              tracksTotal: number;
              isPublic: boolean;
            }
          | undefined) => {
          if (!current) return current;

          return {
            ...current,
            ...(params.name !== undefined ? { name: params.name } : {}),
            ...(params.description !== undefined ? { description: params.description } : {}),
            ...(params.isPublic !== undefined ? { isPublic: params.isPublic } : {}),
          };
        }
      );

      queryClient.setQueryData(
        userPlaylists(),
        (current: InfiniteData<{ items: Playlist[]; nextCursor: string | null; total: number }> | undefined) => {
          if (!current) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((playlist) => {
                if (playlist.id !== params.playlistId) {
                  return playlist;
                }

                return {
                  ...playlist,
                  ...(params.name !== undefined ? { name: params.name } : {}),
                  ...(params.description !== undefined ? { description: params.description } : {}),
                  ...(params.isPublic !== undefined ? { isPublic: params.isPublic } : {}),
                };
              }),
            })),
          };
        }
      );

      return { previousMeta, previousUserPlaylists };
    },
    onSuccess: (_data: { success: boolean }, params: UpdatePlaylistParams) => {
      // Invalidate the specific playlist's metadata
      queryClient.invalidateQueries({ queryKey: playlistMeta(params.playlistId) });
      // Also invalidate user playlists to update the grid
      queryClient.invalidateQueries({ queryKey: userPlaylists() });
      
      // Notify other panels
      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'metadata' });
      
      // Success - no toast needed
    },
    onError: (error: Error, params: UpdatePlaylistParams, context) => {
      if (context?.previousMeta !== undefined) {
        queryClient.setQueryData(playlistMeta(params.playlistId), context.previousMeta);
      }

      if (context?.previousUserPlaylists !== undefined) {
        queryClient.setQueryData(userPlaylists(), context.previousUserPlaylists);
      }

      toast.error(error instanceof Error ? error.message : 'Failed to update playlist');
    },
  });
}
