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
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistTracksInfiniteByProvider } from '@/lib/api/queryKeys';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { Track } from '@/lib/music-provider/types';

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
  providerId?: MusicProviderId;
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
  /** Whether data is being refetched (e.g., manual reload) */
  isRefetching: boolean;
  /** Whether all pages have been loaded */
  hasLoadedAll: boolean;
  /** Error if any */
  error: Error | null;
  /** Raw infinite data for direct cache manipulation */
  data: InfinitePlaylistData | undefined;
  /** Timestamp when data was last updated (for dependency tracking) */
  dataUpdatedAt: number;
}

function getPlaylistTracksQueryKey(
  playlistId: string | null | undefined,
  providerId: MusicProviderId
) {
  return playlistId
    ? playlistTracksInfiniteByProvider(playlistId, providerId)
    : (['playlist-tracks-infinite', null] as const);
}

function shouldPrefetchRemainingPages({
  playlistId,
  data,
  hasNextPage,
  isFetchingNextPage,
  prefetchedPlaylistId,
}: {
  playlistId: string | null | undefined;
  data: InfiniteData<PlaylistTracksPage> | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  prefetchedPlaylistId: string | null;
}) {
  if (!playlistId || !data || !hasNextPage || isFetchingNextPage) {
    return false;
  }

  return prefetchedPlaylistId !== playlistId;
}

function buildPlaylistTracksUrl(
  playlistId: string,
  providerId: MusicProviderId,
  pageParam: string | null
): string {
  if (pageParam) {
    return `/api/playlists/${playlistId}/tracks?nextCursor=${encodeURIComponent(pageParam)}&provider=${providerId}`;
  }

  return `/api/playlists/${playlistId}/tracks?provider=${providerId}`;
}

function createPlaylistTracksQueryFn(
  playlistId: string | null | undefined,
  providerId: MusicProviderId
): ({ pageParam }: { pageParam: string | null }) => Promise<PlaylistTracksPage> {
  return async ({ pageParam = null }) => {
    if (!playlistId) {
      throw new Error('No playlist ID');
    }

    return apiFetch<PlaylistTracksPage>(buildPlaylistTracksUrl(playlistId, providerId, pageParam));
  };
}

async function prefetchRemainingPages(
  fetchNextPage: () => Promise<{
    hasNextPage: boolean;
    data?: InfiniteData<PlaylistTracksPage>;
    error?: Error | null;
  }>
): Promise<void> {
  let hasMore = true;

  while (hasMore) {
    const result = await fetchNextPage();
    hasMore = !!result.hasNextPage;

    if (!result.data || result.error) {
      break;
    }
  }
}

function shouldAutoPrefetch(
  pageCount: number | undefined,
  hasNextPage: boolean,
  isFetchingNextPage: boolean
): boolean {
  return pageCount === 1 && hasNextPage && !isFetchingNextPage;
}

function flattenTracksWithGlobalPositions(pages: PlaylistTracksPage[] | undefined): Track[] {
  if (!pages) {
    return [];
  }

  const tracks: Track[] = [];

  for (const page of pages) {
    for (const track of page.tracks) {
      tracks.push({
        ...track,
        position: tracks.length,
      });
    }
  }

  return tracks;
}

function shouldEnablePlaylistTracksQuery(enabled: boolean, playlistId: string | null | undefined): boolean {
  return enabled && !!playlistId;
}

async function maybePrefetchAllPages(params: {
  playlistId: string | null | undefined;
  data: InfiniteData<PlaylistTracksPage> | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  prefetchedRef: React.MutableRefObject<string | null>;
  fetchNextPage: () => Promise<{
    hasNextPage: boolean;
    data?: InfiniteData<PlaylistTracksPage>;
    error?: Error | null;
  }>;
}): Promise<void> {
  if (!shouldPrefetchRemainingPages({
    playlistId: params.playlistId,
    data: params.data,
    hasNextPage: params.hasNextPage,
    isFetchingNextPage: params.isFetchingNextPage,
    prefetchedPlaylistId: params.prefetchedRef.current,
  })) {
    return;
  }

  params.prefetchedRef.current = params.playlistId ?? null;
  await prefetchRemainingPages(params.fetchNextPage);
}

function triggerPrefetchOnFirstPage(params: {
  pageCount: number | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  prefetchAllPages: () => Promise<void>;
}): void {
  if (!shouldAutoPrefetch(params.pageCount, params.hasNextPage, params.isFetchingNextPage)) {
    return;
  }

  void params.prefetchAllPages();
}

function resetPrefetchTracking(
  prefetchedRef: React.MutableRefObject<string | null>,
  playlistId: string | null | undefined
): void {
  if (playlistId !== prefetchedRef.current) {
    prefetchedRef.current = null;
  }
}

function getSnapshotId(data: InfiniteData<PlaylistTracksPage> | undefined): string | undefined {
  const pages = data?.pages;
  if (!pages || pages.length === 0) {
    return undefined;
  }

  return pages[pages.length - 1]?.snapshotId;
}

function getTotalTracks(data: InfiniteData<PlaylistTracksPage> | undefined): number {
  return data?.pages[0]?.total ?? 0;
}

function getHasLoadedAll(
  data: InfiniteData<PlaylistTracksPage> | undefined,
  hasNextPage: boolean | undefined,
  isFetchingNextPage: boolean
): boolean {
  return !!data && !hasNextPage && !isFetchingNextPage;
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
  providerId = 'spotify',
  enabled = true,
}: UsePlaylistTracksInfiniteOptions): UsePlaylistTracksInfiniteResult {
  const prefetchedRef = useRef<string | null>(null);

  const queryResult = useInfiniteQuery<
    PlaylistTracksPage,
    Error,
    InfiniteData<PlaylistTracksPage>,
    readonly unknown[],
    string | null
  >({
    queryKey: getPlaylistTracksQueryKey(playlistId, providerId),
    queryFn: createPlaylistTracksQueryFn(playlistId, providerId),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: PlaylistTracksPage) => lastPage.nextCursor,
    enabled: shouldEnablePlaylistTracksQuery(enabled, playlistId),
    staleTime: 30000, // 30 seconds
    // Keep previous data only while a playlist is still selected.
    // Avoid carrying stale tracks across provider switches that clear playlistId.
    ...(playlistId
      ? {
          placeholderData: (prev: InfiniteData<PlaylistTracksPage> | undefined) => prev,
        }
      : {}),
    // Disable automatic background refetches to prevent data resets during DnD
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Disable structural sharing to ensure position updates trigger re-renders
    structuralSharing: false,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isRefetching, error, dataUpdatedAt } = queryResult;

  // Prefetch all remaining pages once the first page loads
  const prefetchAllPages = useCallback(async () => {
    await maybePrefetchAllPages({
      playlistId,
      data,
      hasNextPage: Boolean(hasNextPage),
      isFetchingNextPage,
      prefetchedRef,
      fetchNextPage,
    });
  }, [playlistId, data, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Auto-fetch all pages when first page loads
  useEffect(() => {
    triggerPrefetchOnFirstPage({
      pageCount: data?.pages.length,
      hasNextPage: Boolean(hasNextPage),
      isFetchingNextPage,
      prefetchAllPages,
    });
  }, [data?.pages.length, hasNextPage, isFetchingNextPage, prefetchAllPages]);

  // Reset prefetch tracking when playlist changes
  useEffect(() => {
    resetPrefetchTracking(prefetchedRef, playlistId);
  }, [playlistId]);

  // Flatten all pages into a single tracks array with stable reference
  // Include dataUpdatedAt in deps to trigger re-memoization when cache is updated via setQueryData
  const pages = data?.pages;
  const allTracks = useMemo(() => {
    void dataUpdatedAt;
    return flattenTracksWithGlobalPositions(pages);
  }, [pages, dataUpdatedAt]);

  // Get latest snapshot ID from most recent page
  const snapshotId = getSnapshotId(data);
  
  // Get total from first page (Spotify returns total in all pages)
  const total = getTotalTracks(data);
  
  // Check if all pages have been loaded
  const hasLoadedAll = getHasLoadedAll(data, hasNextPage, isFetchingNextPage);

  return {
    allTracks,
    snapshotId,
    total,
    isLoading,
    isFetchingNextPage,
    isRefetching,
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
export function getPlaylistTracksInfiniteKey(
  playlistId: string,
  providerId: MusicProviderId = 'spotify'
) {
  return playlistTracksInfiniteByProvider(playlistId, providerId);
}
