/**
 * Hook for deleting a playlist (TIDAL) or unfollowing it (Spotify).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { userPlaylistsByProvider } from '@/lib/api/queryKeys';
import { SYNC_PAIRS_KEY } from '@features/sync/hooks/useSyncPairs';
import { toast } from '@/lib/ui/toast';
import type { Playlist } from '@/lib/music-provider/types';
import type { InfiniteData } from '@tanstack/react-query';
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';

import type { DeletePlaylistParams } from './types';

type UserPlaylistsQuery = InfiniteData<{ items: Playlist[]; nextCursor: string | null; total: number }>;

type DeletePlaylistMutationContext = {
  previousUserPlaylists: UserPlaylistsQuery | undefined;
};

export function useDeletePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeletePlaylistParams): Promise<{ success: boolean }> => {
      const { playlistId, providerId = DEFAULT_MUSIC_PROVIDER_ID } = params;
      return apiFetch(`/api/playlists/${playlistId}?provider=${providerId}`, {
        method: 'DELETE',
        suppressErrorDialog: true,
      });
    },
    onMutate: async (params: DeletePlaylistParams): Promise<DeletePlaylistMutationContext> => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;

      await queryClient.cancelQueries({ queryKey: userPlaylistsByProvider(providerId) });

      const previousUserPlaylists = queryClient.getQueryData<UserPlaylistsQuery>(
        userPlaylistsByProvider(providerId)
      );

      queryClient.setQueryData(
        userPlaylistsByProvider(providerId),
        (current: UserPlaylistsQuery | undefined) => {
          if (!current) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.filter((playlist) => playlist.id !== params.playlistId),
            })),
          };
        }
      );

      return { previousUserPlaylists };
    },
    onSuccess: (_data: { success: boolean }) => {
      queryClient.invalidateQueries({ queryKey: SYNC_PAIRS_KEY });
      toast.success('Playlist removed');
    },
    onError: (_error: Error, params: DeletePlaylistParams, context: DeletePlaylistMutationContext | undefined) => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      if (context?.previousUserPlaylists !== undefined) {
        queryClient.setQueryData(userPlaylistsByProvider(providerId), context.previousUserPlaylists);
      }

      toast.error('Failed to remove playlist. Please try again.');
    },
  });
}
