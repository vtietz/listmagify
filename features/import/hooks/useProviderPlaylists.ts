import { useState, useMemo, useCallback, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { matchesAllWords } from '@/lib/utils';
import type { Playlist } from '@/lib/music-provider/types';

interface PlaylistsResponse {
  items: Playlist[];
  nextCursor: string | null;
  total: number;
}

/**
 * Fetches playlists for a specific provider regardless of the "current" provider context.
 * Passes `?provider=X` explicitly so `apiFetch` does not override it.
 */
export function useProviderPlaylists(providerId: string | null) {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['import-playlists', providerId],
    queryFn: async ({
      pageParam,
    }: {
      pageParam: string | null;
    }): Promise<PlaylistsResponse> => {
      const params = new URLSearchParams({ provider: providerId! });
      if (pageParam) params.set('nextCursor', pageParam);
      return apiFetch<PlaylistsResponse>(`/api/me/playlists?${params.toString()}`);
    },
    getNextPageParam: (lastPage: PlaylistsResponse) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled: providerId !== null,
    staleTime: 60_000,
  });

  // Auto-fetch remaining pages
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allPlaylists = useMemo(() => {
    if (!data?.pages) return [];
    const all = data.pages.flatMap((page) => page.items);
    const seen = new Set<string>();
    return all.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [data]);

  return {
    allPlaylists,
    isLoading,
    isFetchingNextPage,
  };
}

/**
 * Manages playlist selection state with toggle and toggle-all support.
 */
export function usePlaylistSelection(filteredPlaylists: Playlist[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const togglePlaylist = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const allFilteredIds = filteredPlaylists.map((p) => p.id);
    const allSelected = allFilteredIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.delete(id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.add(id);
        return next;
      });
    }
  }, [filteredPlaylists, selectedIds]);

  const allFilteredSelected =
    filteredPlaylists.length > 0 &&
    filteredPlaylists.every((p) => selectedIds.has(p.id));

  return { selectedIds, togglePlaylist, toggleAll, allFilteredSelected };
}

/**
 * Filters playlists by search query using word-matching.
 */
export function useFilteredPlaylists(allPlaylists: Playlist[], searchQuery: string) {
  return useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return allPlaylists;
    return allPlaylists.filter((p) => matchesAllWords(p.name, q));
  }, [allPlaylists, searchQuery]);
}
