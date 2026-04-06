'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { getConfiguredMatchThresholds } from '@/lib/matching/config';
import type { SyncPreviewResult, SyncConfig, SyncPreviewRun } from '@/lib/sync/types';

const PREVIEW_TIMEOUT_MS = 10 * 60_000;
const PREVIEW_POLL_INTERVAL_MS = 1000;

export class SyncPreviewTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Preview timed out after ${Math.round(timeoutMs / 1000)}s.`);
    this.name = 'SyncPreviewTimeoutError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PreviewStartResponse {
  previewRunId: string;
}

interface PreviewStatusResponse {
  run: SyncPreviewRun | null;
  result: SyncPreviewResult | null;
}

/**
 * Mutation hook to fetch a sync preview (diff plan) between two playlists.
 * Returns the SyncPreviewResult with plan, source tracks, and target tracks.
 * Sends the user's configured match thresholds to the server.
 */
export function useSyncPreview() {
  const [previewRun, setPreviewRun] = useState<SyncPreviewRun | null>(null);

  const mutation = useMutation({
    mutationFn: async (config: SyncConfig) => {
      const matchThresholds = getConfiguredMatchThresholds();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);

      try {
        const started = await apiFetch<PreviewStartResponse>('/api/sync/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...config, matchThresholds }),
          signal: controller.signal,
        });

        const startedAtMs = Date.now();
        while (true) {
          const status = await apiFetch<PreviewStatusResponse>(`/api/sync/preview/${started.previewRunId}`, {
            signal: controller.signal,
          });

          if (!status.run) {
            throw new Error('Preview run not found.');
          }

          setPreviewRun(status.run);

          if (status.run.status === 'done') {
            if (!status.result) {
              throw new Error('Preview completed without result payload.');
            }
            return status.result;
          }

          if (status.run.status === 'failed') {
            throw new Error(status.run.errorMessage ?? 'Preview failed.');
          }

          if (Date.now() - startedAtMs > PREVIEW_TIMEOUT_MS) {
            throw new SyncPreviewTimeoutError(PREVIEW_TIMEOUT_MS);
          }

          await sleep(PREVIEW_POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new SyncPreviewTimeoutError(PREVIEW_TIMEOUT_MS);
        }

        // Some fetch implementations surface aborts as generic Errors.
        if (error instanceof Error && /signal is aborted|aborted without reason|abort/i.test(error.message)) {
          throw new SyncPreviewTimeoutError(PREVIEW_TIMEOUT_MS);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
  });

  const reset = () => {
    mutation.reset();
    setPreviewRun(null);
  };

  return {
    ...mutation,
    previewRun,
    reset,
  };
}
