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
import { isLikedSongsPlaylist, LIKED_SONGS_METADATA } from '@/hooks/useLikedVirtualPlaylist';
import type { MusicProviderId } from '@/lib/music-provider/types';

export function usePlaylistMetaPermissions(
  playlistId: string | null | undefined,
  providerId: MusicProviderId
) {
  const isLikedPlaylist = isLikedSongsPlaylist(playlistId);
  
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
    enabled: !!playlistId && !isLikedPlaylist,
    staleTime: 60000,
  });

  // Update name/description from metadata
  useEffect(() => {
    if (isLikedPlaylist) {
      setPlaylistName(LIKED_SONGS_METADATA.name);
      setPlaylistDescription(LIKED_SONGS_METADATA.description ?? '');
      setPlaylistIsPublic(false);
    } else if (playlistMetaData?.name) {
      setPlaylistName(playlistMetaData.name);
      setPlaylistDescription(playlistMetaData.description ?? '');
      setPlaylistIsPublic(playlistMetaData.isPublic ?? false);
    }
  }, [playlistMetaData, isLikedPlaylist]);

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
    enabled: !!playlistId && !isLikedPlaylist,
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
