'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { eventBus } from '@/lib/sync/eventBus';
import { useSyncActivityStore } from '@features/sync/stores/useSyncActivityStore';
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
  const incrementActive = useSyncActivityStore((s) => s.incrementActive);
  const decrementActive = useSyncActivityStore((s) => s.decrementActive);

  return useMutation({
    mutationFn: async (config: SyncConfig) => {
      incrementActive();
      try {
        return await apiFetch<SyncExecuteResponse>('/api/sync/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
      } catch (err) {
        decrementActive();
        throw err;
      }
    },
    onSuccess: (_data: SyncExecuteResponse, variables: SyncConfig) => {
      decrementActive();
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
    },
  });
}
