/**
 * Hook for fetching playlist metadata and permissions.
 */

'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import {
  playlistMetaByProvider,
  playlistPermissionsByProvider,
} from '@/lib/api/queryKeys';
import { getLikedPlaylistMetadata, isLikedSongsPlaylist } from '@features/playlists/hooks/useLikedVirtualPlaylist';
import { useProviderQueryEnabled } from '@features/auth/hooks/useProviderQueryEnabled';
import type { MusicProviderId } from '@/lib/music-provider/types';

export function usePlaylistMetaPermissions(
  playlistId: string | null | undefined,
  providerId: MusicProviderId
) {
  const isProviderReady = useProviderQueryEnabled(providerId);
  const isLikedPlaylist = isLikedSongsPlaylist(playlistId);
  const likedPlaylistMetadata = getLikedPlaylistMetadata(providerId);

  const [playlistName, setPlaylistName] = useState<string>('');
  const [playlistDescription, setPlaylistDescription] = useState<string>('');
  const [playlistIsPublic, setPlaylistIsPublic] = useState<boolean>(false);

  // Playlist metadata query
  const { data: playlistMetaData } = useQuery({
    queryKey:
      playlistId && !isLikedPlaylist
        ? playlistMetaByProvider(playlistId, providerId)
        : ['playlist', null],
    queryFn: async () => {
      if (!playlistId || isLikedPlaylist) throw new Error('No playlist ID');
      return apiFetch<{
        id: string;
        name: string;
        description: string;
        owner: { id: string; displayName: string };
        collaborative: boolean;
        tracksTotal: number;
        isPublic: boolean;
      }>(`/api/playlists/${playlistId}?provider=${providerId}`);
    },
    enabled: !!playlistId && !isLikedPlaylist && isProviderReady,
    staleTime: 60000,
  });

  // Update name/description from metadata
  useEffect(() => {
    if (isLikedPlaylist) {
      setPlaylistName(likedPlaylistMetadata.name);
      setPlaylistDescription(likedPlaylistMetadata.description ?? '');
      setPlaylistIsPublic(false);
    } else if (playlistMetaData?.name) {
      setPlaylistName(playlistMetaData.name);
      setPlaylistDescription(playlistMetaData.description ?? '');
      setPlaylistIsPublic(playlistMetaData.isPublic ?? false);
    }
  }, [playlistMetaData, isLikedPlaylist, likedPlaylistMetadata]);

  // Permissions query
  const { data: permissionsData } = useQuery({
    queryKey:
      playlistId && !isLikedPlaylist
        ? playlistPermissionsByProvider(playlistId, providerId)
        : ['playlist-permissions', null],
    queryFn: async () => {
      if (!playlistId || isLikedPlaylist) throw new Error('No playlist ID');
      return apiFetch<{ isEditable: boolean }>(
        `/api/playlists/${playlistId}/permissions?provider=${providerId}`
      );
    },
    enabled: !!playlistId && !isLikedPlaylist && isProviderReady,
    staleTime: 60000,
  });

  // Liked songs are never editable
  const isEditable = isLikedPlaylist ? false : (permissionsData?.isEditable || false);

  return {
    playlistName,
    playlistDescription,
    playlistIsPublic,
    isEditable,
    permissionsData,
    isLikedPlaylist,
  };
}
