'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { SyncPreviewResult, SyncConfig } from '@/lib/sync/types';

/**
 * Mutation hook to fetch a sync preview (diff plan) between two playlists.
 * Returns the SyncPreviewResult with plan, source tracks, and target tracks.
 */
export function useSyncPreview() {
  return useMutation({
    mutationFn: async (config: SyncConfig) => {
      return apiFetch<SyncPreviewResult>('/api/sync/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    },
  });
}
