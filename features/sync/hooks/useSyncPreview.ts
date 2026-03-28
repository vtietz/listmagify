'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { SyncPlan, SyncConfig } from '@/lib/sync/types';

/**
 * Mutation hook to fetch a sync preview (diff plan) between two playlists.
 * Returns the computed SyncPlan with items to add/remove and a summary.
 */
export function useSyncPreview() {
  return useMutation({
    mutationFn: async (config: SyncConfig) => {
      return apiFetch<SyncPlan>('/api/sync/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    },
  });
}
