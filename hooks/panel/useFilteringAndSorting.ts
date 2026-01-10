/**
 * Hook for filtering and sorting playlist tracks.
 */

'use client';

import { useMemo } from 'react';
import { matchesAllWords } from '@/lib/utils';
import { usePlaylistSort, type SortKey, type SortDirection } from '@/hooks/usePlaylistSort';
import type { Track } from '@/lib/spotify/types';

export function useFilteringAndSorting(
  tracks: Track[],
  sortKey: SortKey,
  sortDirection: SortDirection,
  searchQuery: string
) {
  // Sort tracks
  const sortedTracks = usePlaylistSort({ tracks: tracks || [], sortKey, sortDirection });

  // Track if the playlist is sorted in a non-default order
  const isSorted = sortKey !== 'position' || sortDirection !== 'asc';

  // Filter tracks based on search query
  const filteredTracks = useMemo(() => {
    if (sortedTracks.length === 0) return [];
    const query = searchQuery.trim();
    if (!query) return sortedTracks;
    return sortedTracks.filter(
      (track: Track) =>
        matchesAllWords(track.name, query) ||
        track.artists.some((artist: string) => matchesAllWords(artist, query)) ||
        (track.album?.name ? matchesAllWords(track.album.name, query) : false)
    );
  }, [sortedTracks, searchQuery]);

  return {
    sortedTracks,
    filteredTracks,
    isSorted,
  };
}

export type { SortKey, SortDirection };
