/**
 * Hook for removing tracks from a playlist (move operation - source side).
 * 
 * When positions are provided, the server removes exactly those entries and
 * responds with 409 if the playlist no longer matches them.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/client';
import {
  playlistTracksByProvider,
  playlistTracksInfiniteByProvider,
} from '@/lib/api/queryKeys';
import { applyRemoveToInfinitePages } from '@/lib/dnd/sortUtils';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';

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
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      // Send tracks with positions - server handles the rebuild if needed
      return apiFetch(`/api/playlists/${params.playlistId}/tracks/remove?provider=${providerId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: params.tracks }),
      });
    },
    onMutate: async (params: RemoveTracksParams) => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      // Cancel outgoing refetches for both query keys
      await cancelPlaylistQueries(queryClient, params.playlistId, providerId);

      // Snapshot both caches for rollback
      const { previousInfiniteData, previousData } = snapshotPlaylistCaches(
        queryClient, 
        params.playlistId,
        providerId
      );

      // Extract URIs for legacy compatibility
      const trackUris = params.tracks.map((t: TrackToRemove) => t.uri);

      // Optimistically remove tracks from infinite query (primary)
      if (previousInfiniteData) {
        const newData = applyRemoveToInfinitePages(previousInfiniteData, trackUris, params.tracks);
        queryClient.setQueryData(
          playlistTracksInfiniteByProvider(params.playlistId, providerId),
          newData
        );
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
        
        queryClient.setQueryData(playlistTracksByProvider(params.playlistId, providerId), {
          ...previousData,
          tracks: filteredTracks,
          total: filteredTracks.length,
        });
      }

      return { previousInfiniteData, previousData };
    },
    onSuccess: (data: MutationResponse, params: RemoveTracksParams) => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      // Update snapshotId in both caches without refetching
      updateBothSnapshotIds(queryClient, params.playlistId, providerId, data);

      // Update total count in infinite query pages after removal
      const currentData = queryClient.getQueryData<InfinitePlaylistData>(
        playlistTracksInfiniteByProvider(params.playlistId, providerId)
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
        queryClient.setQueryData(
          playlistTracksInfiniteByProvider(params.playlistId, providerId),
          updatedData
        );
      }

      eventBus.emit('playlist:update', {
        playlistId: params.playlistId,
        providerId,
        cause: 'remove',
      });
      // Success - no toast needed
    },
    onError: (
      error: Error, 
      params: RemoveTracksParams, 
      context: { previousInfiniteData?: InfinitePlaylistData; previousData?: PlaylistTracksData } | undefined
    ) => {
      const providerId = params.providerId ?? DEFAULT_MUSIC_PROVIDER_ID;
      // Rollback both caches
      rollbackPlaylistCaches(queryClient, params.playlistId, providerId, context);
      if (error instanceof ApiError && error.status === 409) {
        // Playlist changed underneath us: positions are stale, reload fresh data
        eventBus.emit('playlist:reload', { playlistId: params.playlistId, providerId });
      }
      toast.error(error instanceof Error ? error.message : 'Failed to remove tracks');
    },
  });
}
