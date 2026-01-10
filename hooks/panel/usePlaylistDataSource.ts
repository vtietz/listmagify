/**
 * Hook for selecting the appropriate playlist data source (liked songs vs regular playlist).
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePlaylistTracksInfinite } from '@/hooks/usePlaylistTracksInfinite';
import { useLikedVirtualPlaylist, isLikedSongsPlaylist, LIKED_SONGS_METADATA } from '@/hooks/useLikedVirtualPlaylist';
import { useSavedTracksIndex, usePrefetchSavedTracks } from '@/hooks/useSavedTracksIndex';
import { useCapturePlaylist } from '@/hooks/useRecommendations';

export function usePlaylistDataSource(playlistId: string | null | undefined) {
  const isLikedPlaylist = isLikedSongsPlaylist(playlistId);
  
  // Liked songs data source
  const likedPlaylistData = useLikedVirtualPlaylist();
  
  // Regular playlist data source
  const regularPlaylistData = usePlaylistTracksInfinite({
    playlistId: isLikedPlaylist ? null : playlistId,
    enabled: !!playlistId && !isLikedPlaylist,
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
        isRefetching: false,
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
  usePrefetchSavedTracks();
  const { isLiked, toggleLiked, ensureCoverage } = useSavedTracksIndex();

  // Ensure saved tracks coverage when tracks load
  useEffect(() => {
    if (tracks.length > 0 && hasLoadedAll) {
      const trackIds = tracks.map((t) => t.id).filter((id): id is string => id !== null);
      ensureCoverage(trackIds);
    }
  }, [tracks, hasLoadedAll, ensureCoverage]);

  // Capture playlist for recommendations
  const capturePlaylist = useCapturePlaylist();
  const capturedRef = useRef<string | null>(null);

  useEffect(() => {
    const captureKey = snapshotId ? `${playlistId}:${snapshotId}` : (playlistId ?? null);
    if (playlistId && hasLoadedAll && tracks.length > 0 && capturedRef.current !== captureKey) {
      capturedRef.current = captureKey;
      capturePlaylist.mutate(
        { playlistId, tracks, cooccurrenceOnly: isLikedPlaylist },
        { onError: () => {} }
      );
    }
  }, [playlistId, isLikedPlaylist, hasLoadedAll, tracks, snapshotId, capturePlaylist]);

  return {
    tracks,
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
