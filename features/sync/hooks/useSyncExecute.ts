'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { SyncPlan, SyncApplyResult, SyncConfig } from '@/lib/sync/types';
import { playlistTracksByProvider } from '@/lib/api/queryKeys';

interface SyncExecuteResponse {
  plan: SyncPlan;
  result: SyncApplyResult;
  runId?: string;
}

/**
 * Mutation hook to execute a sync operation between two playlists.
 * On success, invalidates the target playlist's track cache so the UI refreshes.
 */
export function useSyncExecute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: SyncConfig) => {
      return apiFetch<SyncExecuteResponse>('/api/sync/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    },
    onSuccess: (_data: SyncExecuteResponse, variables: SyncConfig) => {
      // Invalidate target playlist tracks so the panel refreshes
      queryClient.invalidateQueries({
        queryKey: playlistTracksByProvider(
          variables.targetPlaylistId,
          variables.targetProvider,
        ),
      });

      // For bidirectional sync, also invalidate the source playlist
      if (variables.direction === 'bidirectional') {
        queryClient.invalidateQueries({
          queryKey: playlistTracksByProvider(
            variables.sourcePlaylistId,
            variables.sourceProvider,
          ),
        });
      }
    },
  });
}
