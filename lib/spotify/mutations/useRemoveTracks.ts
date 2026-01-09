/**
 * Hook for removing tracks from a playlist (move operation - source side).
 * 
 * Note: Spotify's API no longer supports position-based deletion.
 * When positions are provided, the server uses a "rebuild playlist" approach:
 * fetching all tracks, filtering out selected positions, and replacing the playlist.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistTracks, playlistTracksInfinite } from '@/lib/api/queryKeys';
import { applyRemoveToInfinitePages } from '@/lib/dnd/sortUtils';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';

import type { 
  RemoveTracksParams, 
  TrackToRemove,
  MutationResponse,
  PlaylistTracksData,
  InfinitePlaylistData,
} from './types';
import {
  cancelPlaylistQueries,
  snapshotPlaylistCaches,
  rollbackPlaylistCaches,
  updateBothSnapshotIds,
} from './helpers';

export function useRemoveTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RemoveTracksParams): Promise<MutationResponse> => {
      // Send tracks with positions - server handles the rebuild if needed
      return apiFetch(`/api/playlists/${params.playlistId}/tracks/remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: params.tracks }),
      });
    },
    onMutate: async (params: RemoveTracksParams) => {
      // Cancel outgoing refetches for both query keys
      await cancelPlaylistQueries(queryClient, params.playlistId);

      // Snapshot both caches for rollback
      const { previousInfiniteData, previousData } = snapshotPlaylistCaches(
        queryClient, 
        params.playlistId
      );

      // Extract URIs for legacy compatibility
      const trackUris = params.tracks.map((t: TrackToRemove) => t.uri);

      // Optimistically remove tracks from infinite query (primary)
      if (previousInfiniteData) {
        const newData = applyRemoveToInfinitePages(previousInfiniteData, trackUris, params.tracks);
        queryClient.setQueryData(playlistTracksInfinite(params.playlistId), newData);
      }

      // Also update legacy single-page query for backwards compatibility
      if (previousData) {
        // For legacy query, use position-based filtering if available
        const positionsToRemove = new Set<number>();
        params.tracks.forEach(t => {
          if (t.positions) {
            t.positions.forEach(pos => positionsToRemove.add(pos));
          }
        });
        
        const filteredTracks = positionsToRemove.size > 0
          ? previousData.tracks.filter((track, index) => {
              const position = track.position ?? index;
              return !positionsToRemove.has(position);
            })
          : previousData.tracks.filter((track) => !trackUris.includes(track.uri));
        
        queryClient.setQueryData(playlistTracks(params.playlistId), {
          ...previousData,
          tracks: filteredTracks,
          total: filteredTracks.length,
        });
      }

      return { previousInfiniteData, previousData };
    },
    onSuccess: (data: MutationResponse, params: RemoveTracksParams) => {
      // Update snapshotId in both caches without refetching
      updateBothSnapshotIds(queryClient, params.playlistId, data);

      // Update total count in infinite query pages after removal
      const currentData = queryClient.getQueryData<InfinitePlaylistData>(
        playlistTracksInfinite(params.playlistId)
      );
      if (currentData?.pages) {
        const newTotal = currentData.pages.reduce((sum, page) => sum + page.tracks.length, 0);
        const updatedData = {
          ...currentData,
          pages: currentData.pages.map((page) => ({
            ...page,
            total: newTotal,
          })),
        };
        queryClient.setQueryData(playlistTracksInfinite(params.playlistId), updatedData);
      }

      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'remove' });
      // Success - no toast needed
    },
    onError: (
      error: Error, 
      params: RemoveTracksParams, 
      context: { previousInfiniteData?: InfinitePlaylistData; previousData?: PlaylistTracksData } | undefined
    ) => {
      // Rollback both caches
      rollbackPlaylistCaches(queryClient, params.playlistId, context);
      toast.error(error instanceof Error ? error.message : 'Failed to remove tracks');
    },
  });
}
