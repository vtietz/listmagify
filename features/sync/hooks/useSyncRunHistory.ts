'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { SyncRun } from '@/lib/sync/types';

interface RunHistoryResponse {
  runs: SyncRun[];
}

export function useSyncRunHistory(pairId: string | null, enabled = false) {
  const query = useQuery({
    queryKey: ['sync-run-history', pairId],
    queryFn: () => apiFetch<RunHistoryResponse>(`/api/sync/pairs/${pairId}/runs?limit=5`),
    enabled: enabled && !!pairId,
    staleTime: 30_000,
  });

  const runs: SyncRun[] = query.data?.runs ?? [];

  return { ...query, runs };
}
