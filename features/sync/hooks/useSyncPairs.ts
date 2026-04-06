'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { SyncPair, SyncRun } from '@/lib/sync/types';

export const SYNC_PAIRS_KEY = ['sync-pairs'] as const;

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

interface UseSyncPairsOptions {
  refetchIntervalMs?: number;
}

/**
 * Query hook to fetch all saved sync pairs.
 */
export function useSyncPairs(enabled = true, options?: UseSyncPairsOptions) {
  const refetchIntervalMs = options?.refetchIntervalMs ?? 10_000;

  return useQuery({
    queryKey: SYNC_PAIRS_KEY,
    queryFn: async () => {
      const data = await apiFetch<SyncPairsResponse>('/api/sync/pairs');
      return data.pairs;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: enabled ? refetchIntervalMs : false,
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
