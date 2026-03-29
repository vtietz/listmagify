'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { eventBus } from '@/lib/sync/eventBus';
import { useSyncActivityStore } from '@features/sync/stores/useSyncActivityStore';
import type { SyncPlan, SyncApplyResult } from '@/lib/sync/types';
import { playlistTracksByProvider } from '@/lib/api/queryKeys';

interface SyncApplyResponse {
  result: SyncApplyResult;
  runId?: string;
}

interface SyncApplyInput {
  plan: SyncPlan;
  syncPairId?: string;
}

/**
 * Mutation hook to apply a pre-computed sync plan.
 * Skips the preview step — sends the plan directly for execution.
 */
export function useSyncApply() {
  const queryClient = useQueryClient();
  const incrementActive = useSyncActivityStore((s) => s.incrementActive);
  const decrementActive = useSyncActivityStore((s) => s.decrementActive);

  return useMutation({
    mutationFn: async (input: SyncApplyInput) => {
      incrementActive();
      try {
        return await apiFetch<SyncApplyResponse>('/api/sync/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
      } catch (err) {
        decrementActive();
        throw err;
      }
    },
    onSuccess: (_data: SyncApplyResponse, variables: SyncApplyInput) => {
      decrementActive();
      const plan = variables.plan;

      queryClient.invalidateQueries({
        queryKey: playlistTracksByProvider(plan.targetPlaylistId, plan.targetProvider),
      });

      if (plan.direction === 'bidirectional') {
        queryClient.invalidateQueries({
          queryKey: playlistTracksByProvider(plan.sourcePlaylistId, plan.sourceProvider),
        });
      }

      eventBus.emit('playlist:update', {
        playlistId: plan.targetPlaylistId,
        providerId: plan.targetProvider,
        cause: 'sync',
        syncOriginated: true,
      });
      eventBus.emit('playlist:update', {
        playlistId: plan.sourcePlaylistId,
        providerId: plan.sourceProvider,
        cause: 'sync',
        syncOriginated: true,
      });
    },
  });
}
