/**
 * React Query mutation hooks for playlist operations.
 * Includes optimistic updates and event bus notifications for cross-panel sync.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistTracks, playlistTracksInfinite } from '@/lib/api/queryKeys';
import { eventBus } from '@/lib/sync/eventBus';
import { 
  applyReorderToInfinitePages, 
  applyRemoveToInfinitePages,
  applyAddToInfinitePages,
  type InfiniteData,
} from '@/lib/dnd/sortUtils';
import type { Track } from '@/lib/spotify/types';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

interface AddTracksParams {
  playlistId: string;
  trackUris: string[];
  position?: number;
  snapshotId?: string;
}

interface RemoveTracksParams {
  playlistId: string;
  trackUris: string[];
  snapshotId?: string;
}

interface ReorderTracksParams {
  playlistId: string;
  fromIndex: number;
  toIndex: number;
  rangeLength?: number;
  snapshotId?: string;
}

interface MutationResponse {
  snapshotId: string;
}

interface PlaylistTracksData {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
}

// Type alias for infinite query data structure
type InfinitePlaylistData = InfiniteData<PlaylistTracksData>;

/**
 * Hook for adding tracks to a playlist (copy operation).
 */
export function useAddTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddTracksParams): Promise<MutationResponse> => {
      return apiFetch(`/api/playlists/${params.playlistId}/tracks/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackUris: params.trackUris,
          position: params.position,
          snapshotId: params.snapshotId,
        }),
      });
    },
    onMutate: async (params) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: playlistTracks(params.playlistId) });

      // Snapshot current data
      const previousData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
      );

      // Optimistically update - we don't have full track data here, so we'll wait for refetch
      // Just emit the event so other panels know to refresh

      return { previousData };
    },
    onSuccess: (data, params) => {
      // Invalidate the infinite query to refetch with the new tracks
      // We can't do optimistic updates for add because we only have URIs, not full Track objects
      queryClient.invalidateQueries({ 
        queryKey: playlistTracksInfinite(params.playlistId),
      });

      // Also invalidate legacy query if it exists
      const currentData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
      );
      if (currentData) {
        queryClient.invalidateQueries({ 
          queryKey: playlistTracks(params.playlistId),
        });
      }

      // Notify other panels to refetch
      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'add' });

      toast.success('Tracks added successfully');
    },
    onError: (error, params, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(
          playlistTracks(params.playlistId),
          context.previousData
        );
      }

      toast.error(error instanceof Error ? error.message : 'Failed to add tracks');
    },
  });
}

/**
 * Hook for removing tracks from a playlist (move operation - source side).
 */
export function useRemoveTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RemoveTracksParams): Promise<MutationResponse> => {
      return apiFetch(`/api/playlists/${params.playlistId}/tracks/remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackUris: params.trackUris,
          snapshotId: params.snapshotId,
        }),
      });
    },
    onMutate: async (params) => {
      // Cancel outgoing refetches for both query keys
      await queryClient.cancelQueries({ queryKey: playlistTracksInfinite(params.playlistId) });
      await queryClient.cancelQueries({ queryKey: playlistTracks(params.playlistId) });

      // Snapshot both caches for rollback
      const previousInfiniteData = queryClient.getQueryData<InfinitePlaylistData>(
        playlistTracksInfinite(params.playlistId)
      );
      const previousData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
      );

      // Optimistically remove tracks from infinite query (primary)
      if (previousInfiniteData) {
        const newData = applyRemoveToInfinitePages(previousInfiniteData, params.trackUris);
        queryClient.setQueryData(playlistTracksInfinite(params.playlistId), newData);
      }

      // Also update legacy single-page query for backwards compatibility
      if (previousData) {
        const uriSet = new Set(params.trackUris);
        queryClient.setQueryData(playlistTracks(params.playlistId), {
          ...previousData,
          tracks: previousData.tracks.filter((track) => !uriSet.has(track.uri)),
          total: previousData.total - params.trackUris.length,
        });
      }

      return { previousInfiniteData, previousData };
    },
    onSuccess: (data, params) => {
      // Update snapshotId in infinite query without refetching
      const currentInfiniteData = queryClient.getQueryData<InfinitePlaylistData>(
        playlistTracksInfinite(params.playlistId)
      );
      if (currentInfiniteData?.pages?.length) {
        const updatedPages = currentInfiniteData.pages.map(page => ({
          ...page,
          snapshotId: data.snapshotId,
        }));
        queryClient.setQueryData(playlistTracksInfinite(params.playlistId), {
          ...currentInfiniteData,
          pages: updatedPages,
        });
      }

      // Also update legacy query
      const currentData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
      );
      if (currentData) {
        queryClient.setQueryData(playlistTracks(params.playlistId), {
          ...currentData,
          snapshotId: data.snapshotId,
        });
      }

      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'remove' });
      toast.success('Tracks removed successfully');
    },
    onError: (error, params, context) => {
      // Rollback both caches
      if (context?.previousInfiniteData) {
        queryClient.setQueryData(
          playlistTracksInfinite(params.playlistId),
          context.previousInfiniteData
        );
      }
      if (context?.previousData) {
        queryClient.setQueryData(
          playlistTracks(params.playlistId),
          context.previousData
        );
      }
      toast.error(error instanceof Error ? error.message : 'Failed to remove tracks');
    },
  });
}

/**
 * Hook for reordering tracks within a playlist.
 */
export function useReorderTracks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderTracksParams): Promise<MutationResponse> => {
      return apiFetch(`/api/playlists/${params.playlistId}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromIndex: params.fromIndex,
          toIndex: params.toIndex,
          rangeLength: params.rangeLength ?? 1,
          snapshotId: params.snapshotId,
        }),
      });
    },
    onMutate: async (params) => {
      // Cancel outgoing refetches for both query keys
      await queryClient.cancelQueries({ queryKey: playlistTracksInfinite(params.playlistId) });
      await queryClient.cancelQueries({ queryKey: playlistTracks(params.playlistId) });

      // Snapshot both caches for rollback
      const previousInfiniteData = queryClient.getQueryData<InfinitePlaylistData>(
        playlistTracksInfinite(params.playlistId)
      );
      const previousData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
      );

      const rangeLength = params.rangeLength ?? 1;

      // Optimistically reorder in infinite query (primary)
      if (previousInfiniteData) {
        const newData = applyReorderToInfinitePages(
          previousInfiniteData, 
          params.fromIndex, 
          params.toIndex, 
          rangeLength
        );
        queryClient.setQueryData(playlistTracksInfinite(params.playlistId), newData);
      }

      // Also update legacy single-page query for backwards compatibility
      if (previousData) {
        const newTracks = [...previousData.tracks];
        const movedItems = newTracks.splice(params.fromIndex, rangeLength);
        const insertAt = params.toIndex > params.fromIndex 
          ? params.toIndex - rangeLength 
          : params.toIndex;
        newTracks.splice(insertAt, 0, ...movedItems);

        queryClient.setQueryData(playlistTracks(params.playlistId), {
          ...previousData,
          tracks: newTracks,
        });
      }

      return { previousInfiniteData, previousData };
    },
    onSuccess: async (data, params) => {
      // Refetch from server to get correct positions
      // This ensures the UI reflects the exact server state after reorder
      await queryClient.refetchQueries({
        queryKey: playlistTracksInfinite(params.playlistId),
      });

      // Also update legacy query snapshotId
      const currentData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
      );
      if (currentData) {
        queryClient.setQueryData(playlistTracks(params.playlistId), {
          ...currentData,
          snapshotId: data.snapshotId,
        });
      }

      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'reorder' });
      toast.success('Tracks reordered successfully');
    },
    onError: (error, params, context) => {
      // Rollback both caches
      if (context?.previousInfiniteData) {
        queryClient.setQueryData(
          playlistTracksInfinite(params.playlistId),
          context.previousInfiniteData
        );
      }
      if (context?.previousData) {
        queryClient.setQueryData(
          playlistTracks(params.playlistId),
          context.previousData
        );
      }
      toast.error(error instanceof Error ? error.message : 'Failed to reorder tracks');
    },
  });
}

/**
 * Hook for checking if a playlist is editable.
 */
export async function checkPlaylistEditable(playlistId: string): Promise<boolean> {
  try {
    const result = await apiFetch<{ isEditable: boolean }>(
      `/api/playlists/${playlistId}/permissions`
    );
    return result.isEditable;
  } catch (error) {
    console.error('Failed to check playlist permissions:', error);
    return false;
  }
}
