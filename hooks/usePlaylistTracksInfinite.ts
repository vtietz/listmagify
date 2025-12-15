/**
 * Infinite query hook for loading all playlist tracks.
 * 
 * This hook uses TanStack Query's useInfiniteQuery as the single source of truth
 * for playlist track data. Key features:
 * 
 * 1. Prefetches all pages on initial load for instant search
 * 2. Uses placeholderData to prevent undefined flashes during refetch
 * 3. Disables background refetches to prevent data resets during DnD
 * 4. Supports optimistic updates for reorder/add/remove operations
 */

'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistTracksInfinite } from '@/lib/api/queryKeys';
import type { Track } from '@/lib/spotify/types';

interface PlaylistTracksPage {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
}

// Re-export the InfiniteData type for use in mutations
export interface InfinitePlaylistData {
  pages: PlaylistTracksPage[];
  pageParams: (string | null)[];
}

interface UsePlaylistTracksInfiniteOptions {
  playlistId: string | null | undefined;
  enabled?: boolean;
}

interface UsePlaylistTracksInfiniteResult {
  /** All tracks flattened from all pages */
  allTracks: Track[];
  /** Current snapshot ID from the latest page */
  snapshotId: string | undefined;
  /** Total track count from server */
  total: number;
  /** Whether initial page is loading */
  isLoading: boolean;
  /** Whether additional pages are being fetched */
  isFetchingNextPage: boolean;
  /** Whether all pages have been loaded */
  hasLoadedAll: boolean;
  /** Error if any */
  error: Error | null;
  /** Raw infinite data for direct cache manipulation */
  data: InfinitePlaylistData | undefined;
  /** Timestamp when data was last updated (for dependency tracking) */
  dataUpdatedAt: number;
}

/**
 * Hook for loading all playlist tracks using infinite query.
 * 
 * Uses TanStack Query's useInfiniteQuery as the authoritative data source.
 * Automatically prefetches all pages on initial load for instant client-side search.
 * 
 * @example
 * ```tsx
 * const { allTracks, isLoading, hasLoadedAll } = usePlaylistTracksInfinite({
 *   playlistId: 'abc123',
 * });
 * ```
 */
export function usePlaylistTracksInfinite({
  playlistId,
  enabled = true,
}: UsePlaylistTracksInfiniteOptions): UsePlaylistTracksInfiniteResult {
  const queryClient = useQueryClient();
  const prefetchedRef = useRef<string | null>(null);

  const queryResult = useInfiniteQuery({
    queryKey: playlistId ? playlistTracksInfinite(playlistId) : ['playlist-tracks-infinite', null],
    queryFn: async ({ pageParam = null }): Promise<PlaylistTracksPage> => {
      if (!playlistId) throw new Error('No playlist ID');
      
      const url = pageParam 
        ? `/api/playlists/${playlistId}/tracks?nextCursor=${encodeURIComponent(pageParam as string)}`
        : `/api/playlists/${playlistId}/tracks`;
      
      return apiFetch<PlaylistTracksPage>(url);
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && !!playlistId,
    staleTime: 30000, // 30 seconds
    // CRITICAL: Keep previous data during refetch to prevent undefined flashes
    placeholderData: (prev) => prev,
    // Disable automatic background refetches to prevent data resets during DnD
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Disable structural sharing to ensure position updates trigger re-renders
    structuralSharing: false,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error, dataUpdatedAt } = queryResult;

  // Prefetch all remaining pages once the first page loads
  const prefetchAllPages = useCallback(async () => {
    if (!playlistId || !data || !hasNextPage || isFetchingNextPage) return;
    if (prefetchedRef.current === playlistId) return; // Already prefetched this playlist
    
    prefetchedRef.current = playlistId;
    
    // Fetch all remaining pages sequentially
    let hasMore: boolean = !!hasNextPage;
    while (hasMore) {
      const result = await fetchNextPage();
      hasMore = !!result.hasNextPage;
      
      // Safety check: break if no more pages or fetch failed
      if (!result.data || result.error) break;
    }
  }, [playlistId, data, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Auto-fetch all pages when first page loads
  useEffect(() => {
    if (data?.pages.length === 1 && hasNextPage && !isFetchingNextPage) {
      prefetchAllPages();
    }
  }, [data?.pages.length, hasNextPage, isFetchingNextPage, prefetchAllPages]);

  // Reset prefetch tracking when playlist changes
  useEffect(() => {
    if (playlistId !== prefetchedRef.current) {
      prefetchedRef.current = null;
    }
  }, [playlistId]);

  // Flatten all pages into a single tracks array with stable reference
  const allTracks = useMemo(() => {
    if (!data?.pages) return [];
    
    const tracks: Track[] = [];
    const seenKeys = new Set<string>();
    
    for (const page of data.pages) {
      for (const track of page.tracks) {
        // De-duplicate based on URI (same track can appear on page boundaries)
        const key = track.uri;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        tracks.push(track);
      }
    }
    
    return tracks;
  }, [data?.pages]);

  // Get latest snapshot ID from most recent page
  const snapshotId = data?.pages[data.pages.length - 1]?.snapshotId;
  
  // Get total from first page (Spotify returns total in all pages)
  const total = data?.pages[0]?.total ?? 0;
  
  // Check if all pages have been loaded
  const hasLoadedAll = !hasNextPage && !isFetchingNextPage && !!data;

  return {
    allTracks,
    snapshotId,
    total,
    isLoading,
    isFetchingNextPage,
    hasLoadedAll,
    error: error as Error | null,
    data,
    dataUpdatedAt,
  };
}

/**
 * Helper to get the query key for a playlist's infinite tracks query.
 * Useful for cache manipulation in mutations.
 */
export function getPlaylistTracksInfiniteKey(playlistId: string) {
  return playlistTracksInfinite(playlistId);
}
