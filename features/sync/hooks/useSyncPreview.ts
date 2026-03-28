'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { getConfiguredMatchThresholds } from '@/lib/matching/config';
import type { SyncPreviewResult, SyncConfig } from '@/lib/sync/types';

/**
 * Mutation hook to fetch a sync preview (diff plan) between two playlists.
 * Returns the SyncPreviewResult with plan, source tracks, and target tracks.
 * Sends the user's configured match thresholds to the server.
 */
export function useSyncPreview() {
  return useMutation({
    mutationFn: async (config: SyncConfig) => {
      const matchThresholds = getConfiguredMatchThresholds();
      return apiFetch<SyncPreviewResult>('/api/sync/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, matchThresholds }),
      });
    },
  });
}
