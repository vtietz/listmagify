/**
 * Hook for checking if tracks already exist in playlists.
 * Uses React Query's cached data for efficient lookups.
 */

import { useCallback } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { playlistTracksInfinite } from '@/lib/api/queryKeys';
import type { Track } from '@/lib/spotify/types';

interface PlaylistTracksPage {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
}

type InfinitePlaylistData = InfiniteData<PlaylistTracksPage>;

export interface DuplicateCheckResult {
  /** Playlist ID */
  playlistId: string;
  /** Playlist name (if available in cache) */
  playlistName?: string;
  /** Track URIs that already exist in this playlist */
  existingUris: string[];
  /** Track URIs that don't exist in this playlist */
  newUris: string[];
}

/**
 * Hook that provides functions to check if tracks exist in playlists.
 */
export function usePlaylistTrackCheck() {
  const queryClient = useQueryClient();

  /**
   * Get all track URIs currently cached for a playlist.
   */
  const getPlaylistTrackUris = useCallback((playlistId: string): Set<string> => {
    const data = queryClient.getQueryData<InfinitePlaylistData>(
      playlistTracksInfinite(playlistId)
    );

    if (!data?.pages) {
      return new Set();
    }

    const uris = new Set<string>();
    for (const page of data.pages) {
      for (const track of page.tracks) {
        if (track.uri) {
          uris.add(track.uri);
        }
      }
    }

    return uris;
  }, [queryClient]);

  /**
   * Check which track URIs already exist in a playlist.
   */
  const checkDuplicates = useCallback((
    playlistId: string,
    trackUris: string[]
  ): DuplicateCheckResult => {
    const existingUris = getPlaylistTrackUris(playlistId);

    const duplicates: string[] = [];
    const newTracks: string[] = [];

    for (const uri of trackUris) {
      if (existingUris.has(uri)) {
        duplicates.push(uri);
      } else {
        newTracks.push(uri);
      }
    }

    return {
      playlistId,
      existingUris: duplicates,
      newUris: newTracks,
    };
  }, [getPlaylistTrackUris]);

  /**
   * Check duplicates across multiple playlists.
   */
  const checkDuplicatesMultiple = useCallback((
    playlistIds: string[],
    trackUris: string[]
  ): DuplicateCheckResult[] => {
    return playlistIds.map(playlistId => checkDuplicates(playlistId, trackUris));
  }, [checkDuplicates]);

  /**
   * Check if any of the given track URIs exist in any of the given playlists.
   * Returns summary info about duplicates found.
   */
  const checkForAnyDuplicates = useCallback((
    playlistIds: string[],
    trackUris: string[]
  ): {
    hasDuplicates: boolean;
    results: DuplicateCheckResult[];
    totalDuplicateCount: number;
    playlistsWithDuplicates: string[];
  } => {
    const results = checkDuplicatesMultiple(playlistIds, trackUris);
    const playlistsWithDuplicates = results
      .filter(r => r.existingUris.length > 0)
      .map(r => r.playlistId);

    return {
      hasDuplicates: playlistsWithDuplicates.length > 0,
      results,
      totalDuplicateCount: results.reduce((sum, r) => sum + r.existingUris.length, 0),
      playlistsWithDuplicates,
    };
  }, [checkDuplicatesMultiple]);

  return {
    getPlaylistTrackUris,
    checkDuplicates,
    checkDuplicatesMultiple,
    checkForAnyDuplicates,
  };
}
