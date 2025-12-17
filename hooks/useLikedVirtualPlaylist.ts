/**
 * Hook for the virtual "Liked Songs" playlist.
 * 
 * Uses the same saved tracks API endpoint as the index service,
 * providing infinite query pagination for the virtual playlist panel.
 */

'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useSavedTracksStore } from './useSavedTracksIndex';
import type { Track } from '@/lib/spotify/types';

/**
 * Virtual playlist ID constant
 */
export const LIKED_SONGS_PLAYLIST_ID = 'liked';

/**
 * Virtual playlist metadata
 */
export const LIKED_SONGS_METADATA = {
  id: LIKED_SONGS_PLAYLIST_ID,
  name: 'Liked Songs',
  description: 'Your saved tracks',
  ownerName: 'You',
  image: null, // Could use a heart icon or Spotify's liked songs artwork
  isPublic: false,
};

interface LikedTracksPage {
  tracks: Track[];
  total: number;
  nextCursor: string | null;
}

interface UseLikedVirtualPlaylistResult {
  /** All tracks flattened from all pages */
  allTracks: Track[];
  /** Total track count */
  total: number;
  /** Whether initial page is loading */
  isLoading: boolean;
  /** Whether additional pages are being fetched */
  isFetchingNextPage: boolean;
  /** Whether all pages have been loaded */
  hasLoadedAll: boolean;
  /** Error if any */
  error: Error | null;
  /** Fetch next page manually */
  fetchNextPage: () => void;
  /** Whether there's a next page */
  hasNextPage: boolean;
  /** Timestamp when data was last updated */
  dataUpdatedAt: number;
}

/**
 * Query key for liked virtual playlist
 */
export const likedPlaylistKey = () => ['liked-virtual-playlist'] as const;

/**
 * Hook for loading the virtual "Liked Songs" playlist with infinite pagination.
 * 
 * This provides the track data for the virtual playlist panel while also
 * feeding the global saved tracks index for heart icon rendering.
 * 
 * @example
 * ```tsx
 * const { allTracks, isLoading, hasLoadedAll } = useLikedVirtualPlaylist();
 * ```
 */
export function useLikedVirtualPlaylist(): UseLikedVirtualPlaylistResult {
  const addToLikedSet = useSavedTracksStore((state) => state.addToLikedSet);
  const setTotal = useSavedTracksStore((state) => state.setTotal);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    dataUpdatedAt,
  } = useInfiniteQuery({
    queryKey: likedPlaylistKey(),
    queryFn: async ({ pageParam }): Promise<LikedTracksPage> => {
      const url = pageParam
        ? `/api/liked/tracks?limit=50&nextCursor=${encodeURIComponent(pageParam)}`
        : '/api/liked/tracks?limit=50';

      const response = await apiFetch<LikedTracksPage>(url);

      // Also feed the global liked set for heart icon rendering
      const ids = response.tracks
        .map(t => t.id)
        .filter((id): id is string => id !== null);
      
      if (ids.length > 0) {
        addToLikedSet(ids);
      }
      setTotal(response.total);

      return response;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Flatten all pages into a single track array with positions
  const allTracks = useMemo(() => {
    if (!data?.pages) return [];
    
    let position = 0;
    return data.pages.flatMap((page) =>
      page.tracks.map((track) => ({
        ...track,
        position: position++,
        originalPosition: track.position ?? position - 1,
      }))
    );
  }, [data?.pages]);

  // Get total from the latest page
  const total = data?.pages?.[data.pages.length - 1]?.total ?? 0;

  // Determine if all pages are loaded
  const hasLoadedAll = !hasNextPage && !isLoading;

  // Auto-fetch remaining pages after initial load
  const autoFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Trigger auto-fetch when current page finishes
  useMemo(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      // Use setTimeout to avoid calling during render
      setTimeout(autoFetchNextPage, 100);
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, autoFetchNextPage]);

  return {
    allTracks,
    total,
    isLoading,
    isFetchingNextPage,
    hasLoadedAll,
    error: error as Error | null,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    dataUpdatedAt,
  };
}

/**
 * Check if a playlist ID is the virtual liked songs playlist
 */
export function isLikedSongsPlaylist(playlistId: string | null | undefined): boolean {
  return playlistId === LIKED_SONGS_PLAYLIST_ID;
}
