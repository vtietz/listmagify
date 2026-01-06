/**
 * Shared optimistic update helpers for playlist mutation hooks.
 * 
 * These helpers provide common patterns for updating both infinite and
 * legacy query caches during optimistic updates.
 */

import type { QueryClient } from '@tanstack/react-query';
import { playlistTracks, playlistTracksInfinite } from '@/lib/api/queryKeys';
import type { PlaylistTracksData, InfinitePlaylistData, MutationResponse } from './types';

/**
 * Cancel outgoing queries for a playlist (both infinite and legacy).
 */
export async function cancelPlaylistQueries(
  queryClient: QueryClient,
  playlistId: string
): Promise<void> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: playlistTracksInfinite(playlistId) }),
    queryClient.cancelQueries({ queryKey: playlistTracks(playlistId) }),
  ]);
}

/**
 * Snapshot both infinite and legacy caches for a playlist.
 */
export function snapshotPlaylistCaches(
  queryClient: QueryClient,
  playlistId: string
): { 
  previousInfiniteData: InfinitePlaylistData | undefined;
  previousData: PlaylistTracksData | undefined;
} {
  return {
    previousInfiniteData: queryClient.getQueryData<InfinitePlaylistData>(
      playlistTracksInfinite(playlistId)
    ),
    previousData: queryClient.getQueryData<PlaylistTracksData>(
      playlistTracks(playlistId)
    ),
  };
}

/**
 * Rollback both caches to their previous state.
 */
export function rollbackPlaylistCaches(
  queryClient: QueryClient,
  playlistId: string,
  context: { 
    previousInfiniteData?: InfinitePlaylistData; 
    previousData?: PlaylistTracksData;
  } | undefined
): void {
  if (context?.previousInfiniteData) {
    queryClient.setQueryData(
      playlistTracksInfinite(playlistId),
      context.previousInfiniteData
    );
  }
  if (context?.previousData) {
    queryClient.setQueryData(
      playlistTracks(playlistId),
      context.previousData
    );
  }
}

/**
 * Update the snapshotId in infinite query pages after a successful mutation.
 */
export function updateInfiniteSnapshotId(
  queryClient: QueryClient,
  playlistId: string,
  newSnapshotId: string
): void {
  const currentData = queryClient.getQueryData<InfinitePlaylistData>(
    playlistTracksInfinite(playlistId)
  );
  
  if (currentData?.pages?.length) {
    const updatedPages = currentData.pages.map((page) => ({
      ...page,
      snapshotId: newSnapshotId,
    }));
    queryClient.setQueryData(playlistTracksInfinite(playlistId), {
      ...currentData,
      pages: updatedPages,
    });
  }
}

/**
 * Update the snapshotId in legacy query after a successful mutation.
 */
export function updateLegacySnapshotId(
  queryClient: QueryClient,
  playlistId: string,
  newSnapshotId: string
): void {
  const currentData = queryClient.getQueryData<PlaylistTracksData>(
    playlistTracks(playlistId)
  );
  
  if (currentData) {
    queryClient.setQueryData(playlistTracks(playlistId), {
      ...currentData,
      snapshotId: newSnapshotId,
    });
  }
}

/**
 * Update snapshotId in both caches after a successful mutation.
 */
export function updateBothSnapshotIds(
  queryClient: QueryClient,
  playlistId: string,
  data: MutationResponse
): void {
  updateInfiniteSnapshotId(queryClient, playlistId, data.snapshotId);
  updateLegacySnapshotId(queryClient, playlistId, data.snapshotId);
}
