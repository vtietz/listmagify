/**
 * Custom hook for sorting playlist tracks with memoization
 */
import { useMemo } from "react";
import type { Track } from "@/lib/spotify/types";
import {
  sortTracks,
  type SortKey,
  type SortDirection,
} from "@/lib/utils/sort";

// Re-export types for convenience
export type { SortKey, SortDirection };

export interface UsePlaylistSortOptions {
  tracks: Track[];
  sortKey: SortKey;
  sortDirection?: SortDirection;
}

/**
 * Hook to sort playlist tracks by the given key and direction
 * Returns memoized sorted array to avoid unnecessary re-sorting
 * 
 * @param options - Sorting options
 * @param options.tracks - Array of tracks to sort
 * @param options.sortKey - Column to sort by
 * @param options.sortDirection - Sort direction (default: "asc")
 * @returns Sorted array of tracks
 */
export function usePlaylistSort({
  tracks,
  sortKey,
  sortDirection = "asc",
}: UsePlaylistSortOptions): Track[] {
  return useMemo(
    () => sortTracks(tracks, sortKey, sortDirection),
    [tracks, sortKey, sortDirection]
  );
}
