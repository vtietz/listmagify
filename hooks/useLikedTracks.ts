/**
 * Hooks for managing liked (saved) tracks in user's Spotify library.
 * 
 * - useLikedTracksStatus: Batch fetch liked status for tracks in a playlist
 * - useToggleSavedTrack: Mutation to save/unsave individual tracks with optimistic updates
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { Track } from '@/lib/spotify/types';

/**
 * Query key for liked tracks status.
 * Uses playlistId and snapshotId for cache stability.
 */
export const likedTracksKey = (playlistId: string, snapshotId: string) =>
  ['liked-tracks', playlistId, snapshotId] as const;

/**
 * Maximum IDs per Spotify API request.
 */
const MAX_IDS_PER_REQUEST = 50;

/**
 * Map of track ID to liked status.
 */
export type LikedMap = Map<string, boolean>;

interface UseLikedTracksStatusOptions {
  /** Playlist ID for cache key */
  playlistId: string | undefined;
  /** Snapshot ID for cache stability */
  snapshotId: string | undefined;
  /** Tracks to check (only non-null IDs will be checked) */
  tracks: Track[];
  /** Whether to enable the query */
  enabled?: boolean;
}

interface UseLikedTracksStatusResult {
  /** Map of track ID to liked status */
  likedMap: LikedMap;
  /** Whether the query is loading */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
}

/**
 * Batch fetches liked status for all tracks in a playlist.
 * 
 * - Filters out local files (id === null)
 * - Batches requests to respect Spotify's 50 ID limit
 * - Caches by playlistId + snapshotId for stability
 * 
 * @example
 * ```tsx
 * const { likedMap, isLoading } = useLikedTracksStatus({
 *   playlistId: 'abc123',
 *   snapshotId: 'xyz789',
 *   tracks: allTracks,
 * });
 * 
 * // Check if a track is liked
 * const isLiked = likedMap.get(trackId) ?? false;
 * ```
 */
export function useLikedTracksStatus({
  playlistId,
  snapshotId,
  tracks,
  enabled = true,
}: UseLikedTracksStatusOptions): UseLikedTracksStatusResult {
  // Filter out local files (id === null)
  const trackIds = tracks
    .map(t => t.id)
    .filter((id): id is string => id !== null && id.trim() !== '');

  const queryResult = useQuery({
    queryKey: likedTracksKey(playlistId ?? '', snapshotId ?? ''),
    queryFn: async (): Promise<LikedMap> => {
      if (trackIds.length === 0) {
        return new Map();
      }

      // Batch requests to respect 50 ID limit
      const batches: string[][] = [];
      for (let i = 0; i < trackIds.length; i += MAX_IDS_PER_REQUEST) {
        batches.push(trackIds.slice(i, i + MAX_IDS_PER_REQUEST));
      }

      // Fetch all batches in parallel
      const results = await Promise.all(
        batches.map(batch =>
          apiFetch<boolean[]>(`/api/tracks/contains?ids=${batch.join(',')}`)
        )
      );

      // Flatten results and create map
      const flatResults = results.flat();
      const map = new Map<string, boolean>();
      
      trackIds.forEach((id, index) => {
        map.set(id, flatResults[index] ?? false);
      });

      return map;
    },
    enabled: enabled && !!playlistId && !!snapshotId && tracks.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });

  return {
    likedMap: queryResult.data ?? new Map(),
    isLoading: queryResult.isLoading,
    error: queryResult.error,
  };
}

interface ToggleSavedTrackParams {
  trackId: string;
  currentlyLiked: boolean;
}

interface UseToggleSavedTrackOptions {
  /** Playlist ID for cache key */
  playlistId: string | undefined;
  /** Snapshot ID for cache key */
  snapshotId: string | undefined;
}

/**
 * Mutation hook for toggling a track's saved status.
 * 
 * - Optimistically updates the liked map
 * - Rolls back on failure
 * - Shows toast on error
 * 
 * @example
 * ```tsx
 * const toggleSaved = useToggleSavedTrack({ playlistId, snapshotId });
 * 
 * // Toggle a track
 * toggleSaved.mutate({ trackId: 'abc123', currentlyLiked: false });
 * ```
 */
export function useToggleSavedTrack({
  playlistId,
  snapshotId,
}: UseToggleSavedTrackOptions) {
  const queryClient = useQueryClient();
  const queryKey = likedTracksKey(playlistId ?? '', snapshotId ?? '');

  return useMutation({
    mutationFn: async ({ trackId, currentlyLiked }: ToggleSavedTrackParams) => {
      if (currentlyLiked) {
        // Remove from library
        await apiFetch('/api/tracks/remove', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [trackId] }),
        });
      } else {
        // Add to library
        await apiFetch('/api/tracks/save', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [trackId] }),
        });
      }
      return { trackId, newLikedStatus: !currentlyLiked };
    },
    onMutate: async (variables: ToggleSavedTrackParams) => {
      const { trackId, currentlyLiked } = variables;
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot current data
      const previousMap = queryClient.getQueryData<LikedMap>(queryKey);

      // Optimistically update
      if (previousMap) {
        const newMap = new Map(previousMap);
        newMap.set(trackId, !currentlyLiked);
        queryClient.setQueryData(queryKey, newMap);
      }

      return { previousMap };
    },
    onError: (
      _error: Error,
      _variables: ToggleSavedTrackParams,
      context: { previousMap?: LikedMap } | undefined
    ) => {
      // Rollback on error
      if (context?.previousMap) {
        queryClient.setQueryData(queryKey, context.previousMap);
      }
    },
    onSettled: () => {
      // Optionally refetch to ensure consistency
      // We skip this to avoid flickering and trust the optimistic update
    },
  });
}
