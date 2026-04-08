/**
 * Hook for selecting the appropriate playlist data source (liked songs vs regular playlist).
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePlaylistTracksInfinite } from '@features/split-editor/playlist/hooks/usePlaylistTracksInfinite';
import { useLikedVirtualPlaylist, isLikedSongsPlaylist, LIKED_SONGS_METADATA } from '@features/playlists/hooks/useLikedVirtualPlaylist';
import { useSavedTracksIndex } from '@features/playlists/hooks/useSavedTracksIndex';
import { useCapturePlaylist } from '@features/playlists/hooks/useRecommendations';
import { useProviderQueryEnabled } from '@features/auth/hooks/useProviderQueryEnabled';
import type { MusicProviderId } from '@/lib/music-provider/types';

export function usePlaylistDataSource(
  playlistId: string | null | undefined,
  providerId: MusicProviderId
) {
  const isProviderReady = useProviderQueryEnabled(providerId);
  const isLikedPlaylist = isLikedSongsPlaylist(playlistId);

  // Liked songs data source
  const likedPlaylistData = useLikedVirtualPlaylist(providerId, {
    enabled: isLikedPlaylist && isProviderReady,
  });

  // Regular playlist data source — disabled when the provider is not authenticated
  const regularPlaylistData = usePlaylistTracksInfinite({
    playlistId: isLikedPlaylist ? null : playlistId,
    providerId,
    enabled: !!playlistId && !isLikedPlaylist && isProviderReady,
  });

  // Select the appropriate data source
  const {
    allTracks: tracks,
    snapshotId,
    isLoading,
    isFetchingNextPage: isAutoLoading,
    isRefetching,
    hasLoadedAll,
    error,
    dataUpdatedAt,
  } = isLikedPlaylist
    ? {
        allTracks: likedPlaylistData.allTracks,
        snapshotId: 'liked-songs',
        isLoading: likedPlaylistData.isLoading,
        isFetchingNextPage: likedPlaylistData.isFetchingNextPage,
        isRefetching: likedPlaylistData.isRefetching,
        hasLoadedAll: likedPlaylistData.hasLoadedAll,
        error: likedPlaylistData.error,
        dataUpdatedAt: likedPlaylistData.dataUpdatedAt,
      }
    : {
        allTracks: regularPlaylistData.allTracks,
        snapshotId: regularPlaylistData.snapshotId,
        isLoading: regularPlaylistData.isLoading,
        isFetchingNextPage: regularPlaylistData.isFetchingNextPage,
        isRefetching: regularPlaylistData.isRefetching,
        hasLoadedAll: regularPlaylistData.hasLoadedAll,
        error: regularPlaylistData.error,
        dataUpdatedAt: regularPlaylistData.dataUpdatedAt,
      };

  // Saved tracks index for liked status
  const { isLiked, toggleLiked, ensureCoverage } = useSavedTracksIndex(providerId);

  // Keep virtual liked playlist visually consistent with optimistic heart toggles.
  // When a track is unliked, it should disappear from the My Tracks panel immediately.
  const visibleTracks = isLikedPlaylist
    ? tracks.filter((track) => (track.id ? isLiked(track.id) : true))
    : tracks;

  // Ensure saved tracks coverage when tracks load
  useEffect(() => {
    if (playlistId && !isLikedPlaylist && visibleTracks.length > 0 && hasLoadedAll) {
      const trackIds = visibleTracks.map((t) => t.id).filter((id): id is string => id !== null);
      ensureCoverage(trackIds);
    }
  }, [playlistId, isLikedPlaylist, visibleTracks, hasLoadedAll, ensureCoverage]);

  // Capture playlist for recommendations
  const capturePlaylist = useCapturePlaylist();
  const capturedRef = useRef<string | null>(null);

  useEffect(() => {
    const captureKey = snapshotId ? `${playlistId}:${snapshotId}` : (playlistId ?? null);
    if (playlistId && hasLoadedAll && visibleTracks.length > 0 && capturedRef.current !== captureKey) {
      capturedRef.current = captureKey;
      capturePlaylist.mutate(
        { playlistId, tracks: visibleTracks, cooccurrenceOnly: isLikedPlaylist },
        { onError: () => {} }
      );
    }
  }, [playlistId, isLikedPlaylist, hasLoadedAll, visibleTracks, snapshotId, capturePlaylist]);

  return {
    tracks: visibleTracks,
    snapshotId,
    isLoading,
    isAutoLoading,
    isRefetching,
    isReloading: isAutoLoading || isRefetching,
    hasLoadedAll,
    error,
    dataUpdatedAt,
    isLikedPlaylist,
    isLiked,
    toggleLiked,
  };
}

export { LIKED_SONGS_METADATA };
