'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistMetaByProvider } from '@/lib/api/queryKeys';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { getProviderLikedSongsDisplayName } from '@/lib/music-provider/trackCodec';
import { isLikedSongsPlaylist } from '@/lib/sync/likedSongs';

interface PlaylistMetaResponse {
  id: string;
  name: string;
}

/**
 * Resolve a playlist ID to its display name via the playlist meta API.
 * Shares the same query cache as the panel's usePlaylistMetaPermissions hook.
 * For liked songs, returns the provider-specific name without an API call.
 */
export function usePlaylistName(providerId: MusicProviderId, playlistId: string): string {
  const isLiked = isLikedSongsPlaylist(playlistId);

  const { data } = useQuery({
    queryKey: playlistMetaByProvider(playlistId, providerId),
    queryFn: () => apiFetch<PlaylistMetaResponse>(`/api/playlists/${playlistId}?provider=${providerId}`),
    staleTime: 5 * 60 * 1000,
    enabled: !!playlistId && !isLiked,
  });

  if (isLiked) return getProviderLikedSongsDisplayName(providerId);

  return data?.name ?? (playlistId.length > 20 ? `${playlistId.slice(0, 20)}...` : playlistId);
}
