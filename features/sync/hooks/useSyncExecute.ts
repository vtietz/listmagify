'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { getConfiguredMatchThresholds } from '@/lib/matching/config';
import { eventBus } from '@/lib/sync/eventBus';
import { useSyncActivityStore } from '@features/sync/stores/useSyncActivityStore';
import { SYNC_PAIRS_KEY } from '@features/sync/hooks/useSyncPairs';
import type { SyncConfig } from '@/lib/sync/types';
import { playlistTracksByProvider } from '@/lib/api/queryKeys';

interface SyncExecuteResponse {
  runId: string;
}

/**
 * Mutation hook to trigger a sync operation between two playlists.
 *
 * The server creates a SyncRun and executes asynchronously (202 Accepted).
 * Status updates are picked up by useSyncPairs' 10-second polling interval.
 */
export function useSyncExecute() {
  const queryClient = useQueryClient();
  const incrementActive = useSyncActivityStore((s) => s.incrementActive);
  const decrementActive = useSyncActivityStore((s) => s.decrementActive);

  return useMutation({
    mutationFn: async (config: SyncConfig & { syncPairId?: string }) => {
      incrementActive();
      const matchThresholds = getConfiguredMatchThresholds();
      return apiFetch<SyncExecuteResponse>('/api/sync/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncPairId: config.syncPairId, matchThresholds }),
      });
    },
    onSettled: () => {
      decrementActive();
      // Immediately refresh sync pairs so the UI shows 'executing' status
      queryClient.invalidateQueries({ queryKey: SYNC_PAIRS_KEY });
    },
    onSuccess: (_data: SyncExecuteResponse, variables: SyncConfig & { syncPairId?: string }) => {
      // Emit sync-originated events so auto-sync runner ignores these changes
      eventBus.emit('playlist:update', {
        playlistId: variables.targetPlaylistId,
        providerId: variables.targetProvider,
        cause: 'sync',
        syncOriginated: true,
      });
      eventBus.emit('playlist:update', {
        playlistId: variables.sourcePlaylistId,
        providerId: variables.sourceProvider,
        cause: 'sync',
        syncOriginated: true,
      });

      // Invalidate track caches so panels refresh once sync completes
      queryClient.invalidateQueries({
        queryKey: playlistTracksByProvider(
          variables.targetPlaylistId,
          variables.targetProvider,
        ),
      });
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
