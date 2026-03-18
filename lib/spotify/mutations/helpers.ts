/**
 * Shared optimistic update helpers for playlist mutation hooks.
 * 
 * These helpers provide common patterns for updating both infinite and
 * legacy query caches during optimistic updates.
 */

import type { QueryClient } from '@tanstack/react-query';
import {
  playlistTracksByProvider,
  playlistTracksInfiniteByProvider,
} from '@/lib/api/queryKeys';
import type { PlaylistTracksData, InfinitePlaylistData, MutationResponse } from './types';
import type { MusicProviderId } from '@/lib/music-provider/types';

/**
 * Cancel outgoing queries for a playlist (both infinite and legacy).
 */
export async function cancelPlaylistQueries(
  queryClient: QueryClient,
  playlistId: string,
  providerId: MusicProviderId = 'spotify'
): Promise<void> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: playlistTracksInfiniteByProvider(playlistId, providerId) }),
    queryClient.cancelQueries({ queryKey: playlistTracksByProvider(playlistId, providerId) }),
  ]);
}

/**
 * Snapshot both infinite and legacy caches for a playlist.
 */
export function snapshotPlaylistCaches(
  queryClient: QueryClient,
  playlistId: string,
  providerId: MusicProviderId = 'spotify'
): { 
  previousInfiniteData: InfinitePlaylistData | undefined;
  previousData: PlaylistTracksData | undefined;
} {
  return {
    previousInfiniteData: queryClient.getQueryData<InfinitePlaylistData>(
      playlistTracksInfiniteByProvider(playlistId, providerId)
    ),
    previousData: queryClient.getQueryData<PlaylistTracksData>(
      playlistTracksByProvider(playlistId, providerId)
    ),
  };
}

/**
 * Rollback both caches to their previous state.
 */
export function rollbackPlaylistCaches(
  queryClient: QueryClient,
  playlistId: string,
  providerId: MusicProviderId = 'spotify',
  context: { 
    previousInfiniteData?: InfinitePlaylistData; 
    previousData?: PlaylistTracksData;
  } | undefined
): void {
  if (context?.previousInfiniteData) {
    queryClient.setQueryData(
      playlistTracksInfiniteByProvider(playlistId, providerId),
      context.previousInfiniteData
    );
  }
  if (context?.previousData) {
    queryClient.setQueryData(
      playlistTracksByProvider(playlistId, providerId),
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
  newSnapshotId: string,
  providerId: MusicProviderId = 'spotify'
): void {
  const currentData = queryClient.getQueryData<InfinitePlaylistData>(
    playlistTracksInfiniteByProvider(playlistId, providerId)
  );
  
  if (currentData?.pages?.length) {
    const updatedPages = currentData.pages.map((page) => ({
      ...page,
      snapshotId: newSnapshotId,
    }));
    queryClient.setQueryData(playlistTracksInfiniteByProvider(playlistId, providerId), {
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
  newSnapshotId: string,
  providerId: MusicProviderId = 'spotify'
): void {
  const currentData = queryClient.getQueryData<PlaylistTracksData>(
    playlistTracksByProvider(playlistId, providerId)
  );
  
  if (currentData) {
    queryClient.setQueryData(playlistTracksByProvider(playlistId, providerId), {
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
  providerId: MusicProviderId = 'spotify',
  data: MutationResponse
): void {
  updateInfiniteSnapshotId(queryClient, playlistId, data.snapshotId, providerId);
  updateLegacySnapshotId(queryClient, playlistId, data.snapshotId, providerId);
}
