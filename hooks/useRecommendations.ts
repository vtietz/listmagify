/**
 * Hook for fetching and managing recommendations.
 * Supports both seed-based (Mode A) and playlist appendix (Mode B) recommendations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { Track } from '@/lib/spotify/types';
import type { Recommendation } from '@/lib/recs';

interface SeedRecommendationsParams {
  seedTrackIds: string[];
  excludeTrackIds?: string[];
  playlistId?: string;
  topN?: number;
}

interface PlaylistAppendixParams {
  playlistId: string;
  trackIds?: string[];
  topN?: number;
}

interface RecommendationsResponse {
  recommendations: Array<Recommendation & { track?: Track }>;
  enabled: boolean;
  message?: string;
}

interface CaptureResponse {
  success: boolean;
  enabled: boolean;
  stats?: {
    tracksCapture: number;
    adjacencyEdges: number;
    cooccurrenceEdges: number;
  };
  message?: string;
}

/**
 * Hook to fetch seed-based recommendations for selected tracks.
 * 
 * @param seedTrackIds - Array of seed track IDs (1-5 tracks)
 * @param excludeTrackIds - Optional array of track IDs to exclude
 * @param playlistId - Optional playlist ID for context
 * @param enabled - Whether to enable the query
 * @param topN - Maximum number of recommendations to fetch (default: 20, max: 50)
 */
export function useSeedRecommendations(
  seedTrackIds: string[],
  excludeTrackIds: string[] = [],
  playlistId?: string,
  enabled: boolean = true,
  topN: number = 20
) {
  return useQuery({
    queryKey: ['recs', 'seed', seedTrackIds, excludeTrackIds, playlistId, topN],
    queryFn: async (): Promise<RecommendationsResponse> => {
      if (seedTrackIds.length === 0) {
        return { recommendations: [], enabled: true };
      }

      return apiFetch<RecommendationsResponse>('/api/recs/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedTrackIds,
          excludeTrackIds,
          playlistId,
          topN,
          includeMetadata: true,
        }),
      });
    },
    enabled: enabled && seedTrackIds.length > 0 && seedTrackIds.length <= 5,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch playlist appendix recommendations.
 * 
 * @param playlistId - The playlist ID
 * @param trackIds - Optional override of track IDs
 * @param enabled - Whether to enable the query
 */
export function usePlaylistAppendixRecommendations(
  playlistId: string | null,
  trackIds?: string[],
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['recs', 'playlist-appendix', playlistId, trackIds],
    queryFn: async (): Promise<RecommendationsResponse> => {
      if (!playlistId) {
        return { recommendations: [], enabled: true };
      }

      return apiFetch<RecommendationsResponse>('/api/recs/playlist-appendix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId,
          trackIds,
          topN: 20,
          includeMetadata: true,
        }),
      });
    },
    enabled: enabled && !!playlistId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to capture a playlist snapshot and update recommendation edges.
 */
export function useCapturePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistId, tracks }: { playlistId: string; tracks: Track[] }) => {
      return apiFetch<CaptureResponse>('/api/recs/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId, tracks }),
      });
    },
    onSuccess: (_data: void, variables: { playlistId: string; tracks: string[] }) => {
      // Invalidate recommendations for this playlist
      queryClient.invalidateQueries({ queryKey: ['recs', 'playlist-appendix', variables.playlistId] });
    },
  });
}

/**
 * Hook to dismiss a recommendation.
 */
export function useDismissRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ trackId, contextId }: { trackId: string; contextId?: string }) => {
      return apiFetch<{ success: boolean }>('/api/recs/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, contextId }),
      });
    },
    onSuccess: (_data: { success: boolean }, variables: { trackId: string; contextId?: string }) => {
      // Invalidate relevant recommendations
      if (variables.contextId) {
        queryClient.invalidateQueries({ queryKey: ['recs', 'playlist-appendix', variables.contextId] });
      }
      queryClient.invalidateQueries({ queryKey: ['recs', 'seed'] });
    },
  });
}

/**
 * Hook to clear all dismissals for a context.
 */
export function useClearDismissals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contextId: string = 'global') => {
      return apiFetch<{ success: boolean }>(`/api/recs/dismiss?contextId=${encodeURIComponent(contextId)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      // Invalidate all recommendations
      queryClient.invalidateQueries({ queryKey: ['recs'] });
    },
  });
}

/**
 * Check if recommendations are enabled.
 */
export function useRecsEnabled() {
  return useQuery({
    queryKey: ['recs', 'enabled'],
    queryFn: async () => {
      // Try to make a simple request to check if recs are enabled
      const response = await apiFetch<RecommendationsResponse>('/api/recs/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedTrackIds: [] }),
      });
      return response.enabled;
    },
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
    gcTime: 60 * 60 * 1000,
    retry: false, // Don't retry on failure
  });
}
