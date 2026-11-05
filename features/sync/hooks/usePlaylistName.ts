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

function formatPlaylistIdFallback(playlistId: string): string {
  return playlistId.length > 20 ? `${playlistId.slice(0, 20)}...` : playlistId;
}

/**
 * Resolve a playlist ID to its real display name via the playlist meta API.
 * Returns null while loading or when the lookup fails, so callers never mistake
 * the ID placeholder for a name (e.g. when persisting it).
 * Shares the same query cache as the panel's usePlaylistMetaPermissions hook.
 * For liked songs, returns the provider-specific name without an API call.
 */
export function useResolvedPlaylistName(providerId: MusicProviderId, playlistId: string): string | null {
  const isLiked = isLikedSongsPlaylist(playlistId);

  const { data } = useQuery({
    queryKey: playlistMetaByProvider(playlistId, providerId),
    queryFn: () => apiFetch<PlaylistMetaResponse>(`/api/playlists/${playlistId}?provider=${providerId}`),
    staleTime: 5 * 60 * 1000,
    enabled: !!playlistId && !isLiked,
  });

  if (isLiked) return getProviderLikedSongsDisplayName(providerId);

  return data?.name || null;
}

/**
 * Display name for a playlist: the resolved name, else the stored name, else a shortened ID.
 */
export function usePlaylistName(providerId: MusicProviderId, playlistId: string, storedName?: string): string {
  const resolvedName = useResolvedPlaylistName(providerId, playlistId);
  return resolvedName ?? (storedName || formatPlaylistIdFallback(playlistId));
}
