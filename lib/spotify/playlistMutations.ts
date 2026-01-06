/**
 * React Query mutation hooks for playlist operations.
 * Includes optimistic updates and event bus notifications for cross-panel sync.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { playlistTracks, playlistTracksInfinite, playlistMeta } from '@/lib/api/queryKeys';
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

interface TrackToRemove {
  uri: string;
  positions?: number[];  // Specific positions to remove (for duplicate tracks)
}

interface RemoveTracksParams {
  playlistId: string;
  tracks: TrackToRemove[];
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
      // Intentionally omit snapshotId to avoid stale snapshot errors
      // The Spotify API will operate on the current playlist state
      return apiFetch(`/api/playlists/${params.playlistId}/tracks/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackUris: params.trackUris,
          position: params.position,
        }),
      });
    },
    onMutate: async (params: AddTracksParams) => {
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
    onSuccess: (_data: MutationResponse, params: AddTracksParams) => {
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

      // Success - no toast needed
    },
    onError: (error: Error, params: AddTracksParams, context: { previousData?: PlaylistTracksData } | undefined) => {
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
 * 
 * Note: Spotify's API no longer supports position-based deletion.
 * When positions are provided, the server uses a "rebuild playlist" approach:
 * fetching all tracks, filtering out selected positions, and replacing the playlist.
 */
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
      await queryClient.cancelQueries({ queryKey: playlistTracksInfinite(params.playlistId) });
      await queryClient.cancelQueries({ queryKey: playlistTracks(params.playlistId) });

      // Snapshot both caches for rollback
      const previousInfiniteData = queryClient.getQueryData<InfinitePlaylistData>(
        playlistTracksInfinite(params.playlistId)
      );
      const previousData = queryClient.getQueryData<PlaylistTracksData>(
        playlistTracks(params.playlistId)
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
      // Update snapshotId in infinite query without refetching
      const currentInfiniteData = queryClient.getQueryData<InfinitePlaylistData>(
        playlistTracksInfinite(params.playlistId)
      );
      if (currentInfiniteData?.pages?.length) {
        const updatedPages = currentInfiniteData.pages.map((page: PlaylistTracksData) => ({
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
      // Success - no toast needed
    },
    onError: (error: Error, params: RemoveTracksParams, context: { previousInfiniteData?: InfinitePlaylistData; previousData?: PlaylistTracksData } | undefined) => {
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
    onMutate: async (params: ReorderTracksParams) => {
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
    onSuccess: async (data: MutationResponse, params: ReorderTracksParams) => {
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
      // Success - no toast needed
    },
    onError: (error: Error, params: ReorderTracksParams, context: { previousInfiniteData?: InfinitePlaylistData; previousData?: PlaylistTracksData } | undefined) => {
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

// --- Playlist CRUD Operations ---

interface CreatePlaylistParams {
  name: string;
  description?: string;
  isPublic?: boolean;
}

interface CreatePlaylistResponse {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  ownerName: string | null;
  image: { url: string; width?: number | null; height?: number | null } | null;
  tracksTotal: number;
}

interface UpdatePlaylistParams {
  playlistId: string;
  name?: string;
  description?: string;
  isPublic?: boolean;
}

/**
 * Hook for creating a new playlist.
 */
export function useCreatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreatePlaylistParams): Promise<CreatePlaylistResponse> => {
      return apiFetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: params.name,
          description: params.description,
          isPublic: params.isPublic ?? false,
        }),
      });
    },
    onSuccess: (data: CreatePlaylistResponse) => {
      // Invalidate user playlists to refetch the updated list
      queryClient.invalidateQueries({ queryKey: ['user-playlists'] });
      // Success - no toast needed
      // Return data for caller to use (e.g., optimistic UI update)
      return data;
    },
    onError: (error: Error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create playlist');
    },
  });
}

/**
 * Hook for updating playlist details (name, description, public status).
 */
export function useUpdatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdatePlaylistParams): Promise<{ success: boolean }> => {
      const { playlistId, ...updateData } = params;
      return apiFetch(`/api/playlists/${playlistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
    },
    onSuccess: (_data: { success: boolean }, params: UpdatePlaylistParams) => {
      // Invalidate the specific playlist's metadata
      queryClient.invalidateQueries({ queryKey: playlistMeta(params.playlistId) });
      // Also invalidate user playlists to update the grid
      queryClient.invalidateQueries({ queryKey: ['user-playlists'] });
      
      // Notify other panels
      eventBus.emit('playlist:update', { playlistId: params.playlistId, cause: 'metadata' });
      
      // Success - no toast needed
    },
    onError: (error: Error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update playlist');
    },
  });
}

