'use client';

import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { getConfiguredMatchThresholds } from '@/lib/matching/config';
import type { SyncPreviewResult, SyncConfig, SyncPreviewRun } from '@/lib/sync/types';

const PREVIEW_TIMEOUT_MS = 30 * 60_000;
const PREVIEW_POLL_INTERVAL_MS = 1000;

export class SyncPreviewTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Preview is still running after ${Math.round(timeoutMs / 60_000)} minutes. It continues in the background.`);
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

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return error instanceof Error && /signal is aborted|aborted without reason|abort/i.test(error.message);
}

async function startPreviewRun(
  config: SyncConfig,
  signal: AbortSignal,
): Promise<string> {
  const matchThresholds = getConfiguredMatchThresholds();
  const started = await apiFetch<PreviewStartResponse>('/api/sync/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, matchThresholds }),
    signal,
  });

  return started.previewRunId;
}

async function pollPreviewResult(
  previewRunId: string,
  signal: AbortSignal,
  onRunUpdate: (run: SyncPreviewRun) => void,
): Promise<SyncPreviewResult> {
  const startedAtMs = Date.now();

  while (true) {
    const status = await apiFetch<PreviewStatusResponse>(`/api/sync/preview/${previewRunId}`, {
      signal,
    });

    if (!status.run) {
      throw new Error('Preview run not found.');
    }

    onRunUpdate(status.run);

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
}

/**
 * Mutation hook to fetch a sync preview (diff plan) between two playlists.
 * Returns the SyncPreviewResult with plan, source tracks, and target tracks.
 * Sends the user's configured match thresholds to the server.
 */
export function useSyncPreview() {
  const [previewRun, setPreviewRun] = useState<SyncPreviewRun | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: async (config: SyncConfig) => {
      activeControllerRef.current?.abort();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);

      try {
        const previewRunId = await startPreviewRun(config, controller.signal);
        return await pollPreviewResult(previewRunId, controller.signal, setPreviewRun);
      } catch (error) {
        if (isAbortLikeError(error)) {
          throw new SyncPreviewTimeoutError(PREVIEW_TIMEOUT_MS);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
      }
    },
  });

  const cancelCurrentRun = useCallback(() => {
    activeControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    mutation.reset();
    setPreviewRun(null);
  }, [mutation]);

  return {
    ...mutation,
    previewRun,
    cancelCurrentRun,
    reset,
  };
}
