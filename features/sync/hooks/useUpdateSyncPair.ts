'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { SYNC_PAIRS_KEY } from '@features/sync/hooks/useSyncPairs';

export function useUpdateSyncPair() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, autoSync, syncInterval }: {
      id: string;
      autoSync?: boolean;
      syncInterval?: string;
    }) => {
      return apiFetch<{ pair: unknown }>(`/api/sync/pairs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(autoSync !== undefined ? { autoSync } : {}),
          ...(syncInterval !== undefined ? { syncInterval } : {}),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SYNC_PAIRS_KEY });
    },
  });
}
