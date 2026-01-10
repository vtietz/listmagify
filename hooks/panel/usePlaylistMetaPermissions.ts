/**
 * Hook for fetching playlist metadata and permissions.
 */

'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistMeta, playlistPermissions } from '@/lib/api/queryKeys';
import { isLikedSongsPlaylist, LIKED_SONGS_METADATA } from '@/hooks/useLikedVirtualPlaylist';

export function usePlaylistMetaPermissions(playlistId: string | null | undefined) {
  const isLikedPlaylist = isLikedSongsPlaylist(playlistId);
  
  const [playlistName, setPlaylistName] = useState<string>('');
  const [playlistDescription, setPlaylistDescription] = useState<string>('');

  // Playlist metadata query
  const { data: playlistMetaData } = useQuery({
    queryKey: playlistId && !isLikedPlaylist ? playlistMeta(playlistId) : ['playlist', null],
    queryFn: async () => {
      if (!playlistId || isLikedPlaylist) throw new Error('No playlist ID');
      return apiFetch<{
        id: string;
        name: string;
        description: string;
        owner: { id: string; displayName: string };
        collaborative: boolean;
        tracksTotal: number;
      }>(`/api/playlists/${playlistId}`);
    },
    enabled: !!playlistId && !isLikedPlaylist,
    staleTime: 60000,
  });

  // Update name/description from metadata
  useEffect(() => {
    if (isLikedPlaylist) {
      setPlaylistName(LIKED_SONGS_METADATA.name);
      setPlaylistDescription(LIKED_SONGS_METADATA.description ?? '');
    } else if (playlistMetaData?.name) {
      setPlaylistName(playlistMetaData.name);
      setPlaylistDescription(playlistMetaData.description ?? '');
    }
  }, [playlistMetaData, isLikedPlaylist]);

  // Permissions query
  const { data: permissionsData } = useQuery({
    queryKey: playlistId && !isLikedPlaylist ? playlistPermissions(playlistId) : ['playlist-permissions', null],
    queryFn: async () => {
      if (!playlistId || isLikedPlaylist) throw new Error('No playlist ID');
      return apiFetch<{ isEditable: boolean }>(`/api/playlists/${playlistId}/permissions`);
    },
    enabled: !!playlistId && !isLikedPlaylist,
    staleTime: 60000,
  });

  // Liked songs are never editable
  const isEditable = isLikedPlaylist ? false : (permissionsData?.isEditable || false);

  return {
    playlistName,
    playlistDescription,
    isEditable,
    permissionsData,
    isLikedPlaylist,
  };
}
