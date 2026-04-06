/**
 * Hook for updating playlist details (name, description, public status).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import {
  playlistMetaByProvider,
  userPlaylistsByProvider,
} from '@/lib/api/queryKeys';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';
import type { Playlist } from '@/lib/music-provider/types';
import type { InfiniteData } from '@tanstack/react-query';
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';

import type { UpdatePlaylistParams } from './types';

type PlaylistMetaQuery = {
  id: string;
  name: string;
  description: string;
  owner: { id: string; displayName: string };
  collaborative: boolean;
  tracksTotal: number;
  isPublic: boolean;
};

type UserPlaylistsQuery = InfiniteData<{ items: Playlist[]; nextCursor: string | null; total: number }>;

type UpdatePlaylistMutationContext = {
  previousMeta: PlaylistMetaQuery | undefined;
  previousUserPlaylists: UserPlaylistsQuery | undefined;
};

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdatePlaylistParams): Promise<{ success: boolean }> => {
      const { playlistId, providerId = DEFAULT_MUSIC_PROVIDER_ID, ...updateData } = params;
      return apiFetch(`/api/playlists/${playlistId}?provider=${providerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
    },
    onMutate: async (params: UpdatePlaylistParams): Promise<UpdatePlaylistMutationContext> => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      const previousMeta = queryClient.getQueryData<PlaylistMetaQuery>(
        playlistMetaByProvider(params.playlistId, providerId)
      );

      const previousUserPlaylists = queryClient.getQueryData<UserPlaylistsQuery>(
        userPlaylistsByProvider(providerId)
      );

      queryClient.setQueryData(
        playlistMetaByProvider(params.playlistId, providerId),
        (current: PlaylistMetaQuery | undefined) => {
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
        userPlaylistsByProvider(providerId),
        (current: UserPlaylistsQuery | undefined) => {
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
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      // Invalidate the specific playlist's metadata
      queryClient.invalidateQueries({
        queryKey: playlistMetaByProvider(params.playlistId, providerId),
      });
      // Also invalidate user playlists to update the grid
      queryClient.invalidateQueries({ queryKey: userPlaylistsByProvider(providerId) });
      
      // Notify other panels
      eventBus.emit('playlist:update', {
        playlistId: params.playlistId,
        providerId,
        cause: 'metadata',
      });
      
      // Success - no toast needed
    },
    onError: (error: Error, params: UpdatePlaylistParams, context: UpdatePlaylistMutationContext | undefined) => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      if (context?.previousMeta !== undefined) {
        queryClient.setQueryData(
          playlistMetaByProvider(params.playlistId, providerId),
          context.previousMeta
        );
      }

      if (context?.previousUserPlaylists !== undefined) {
        queryClient.setQueryData(userPlaylistsByProvider(providerId), context.previousUserPlaylists);
      }

      toast.error(error instanceof Error ? error.message : 'Failed to update playlist');
    },
  });
}
