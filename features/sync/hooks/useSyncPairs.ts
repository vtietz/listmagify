'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { SyncPair, SyncRun } from '@/lib/sync/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

const SYNC_PAIRS_KEY = ['sync-pairs'] as const;

export type SyncPairWithRun = SyncPair & { latestRun: SyncRun | null };

interface SyncPairsResponse {
  pairs: SyncPairWithRun[];
}

interface CreateSyncPairResponse {
  pair: SyncPair;
}

interface DeleteSyncPairResponse {
  deleted: boolean;
}

/**
 * Query hook to fetch all saved sync pairs.
 */
export function useSyncPairs(enabled = true) {
  return useQuery({
    queryKey: SYNC_PAIRS_KEY,
    queryFn: async () => {
      const data = await apiFetch<SyncPairsResponse>('/api/sync/pairs');
      return data.pairs;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Mutation hook to create a new sync pair.
 * Invalidates the sync pairs list on success.
 */
export function useCreateSyncPair() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pair: Omit<SyncPair, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => {
      const data = await apiFetch<CreateSyncPairResponse>('/api/sync/pairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pair),
      });
      return data.pair;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SYNC_PAIRS_KEY });
    },
  });
}

/**
 * Mutation hook to delete a sync pair by ID.
 * Invalidates the sync pairs list on success.
 */
export function useDeleteSyncPair() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pairId: string) => {
      return apiFetch<DeleteSyncPairResponse>(`/api/sync/pairs/${pairId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SYNC_PAIRS_KEY });
    },
  });
}

/**
 * Finds an existing sync pair matching the given source/target playlists (in either order).
 */
export function useSyncPairForPlaylists(
  sourceProvider: MusicProviderId | undefined,
  sourcePlaylistId: string | null,
  targetProvider: MusicProviderId | undefined,
  targetPlaylistId: string | null,
): SyncPairWithRun | null {
  const { data: pairs } = useSyncPairs(
    !!sourceProvider && !!sourcePlaylistId && !!targetProvider && !!targetPlaylistId,
  );

  return useMemo(() => {
    if (!pairs || !sourceProvider || !sourcePlaylistId || !targetProvider || !targetPlaylistId) {
      return null;
    }

    return pairs.find((pair: SyncPairWithRun) =>
      (pair.sourceProvider === sourceProvider &&
        pair.sourcePlaylistId === sourcePlaylistId &&
        pair.targetProvider === targetProvider &&
        pair.targetPlaylistId === targetPlaylistId) ||
      (pair.sourceProvider === targetProvider &&
        pair.sourcePlaylistId === targetPlaylistId &&
        pair.targetProvider === sourceProvider &&
        pair.targetPlaylistId === sourcePlaylistId),
    ) ?? null;
  }, [pairs, sourceProvider, sourcePlaylistId, targetProvider, targetPlaylistId]);
}
