import { useEffect, useState } from 'react';
import type { SyncDialogConfig, SyncPreviewSession } from '@features/sync/stores/useSyncDialogStore';
import { SyncPreviewTimeoutError } from '@features/sync/hooks/useSyncPreview';
import type { SyncPreviewRun } from '@/lib/sync/types';

export function buildPreviewKey(config: SyncDialogConfig): string {
  return [
    config.syncPairId ?? '',
    config.sourceProvider,
    config.sourcePlaylistId,
    config.targetProvider,
    config.targetPlaylistId,
  ].join('::');
}

function getPreviewProgressLabel(elapsedSeconds: number): string {
  if (elapsedSeconds < 8) {
    return 'Fetching playlist snapshots...';
  }
  if (elapsedSeconds < 20) {
    return 'Resolving canonical mappings...';
  }
  if (elapsedSeconds < 45) {
    return 'Computing diff and validating track matches...';
  }
  return 'Still working on large playlists...';
}

export function getRunPhaseLabel(run: SyncPreviewRun | null, elapsedSeconds: number): string {
  if (!run) {
    return getPreviewProgressLabel(elapsedSeconds);
  }

  if (run.phase === 'capturing_snapshots') return 'Fetching playlist snapshots...';
  if (run.phase === 'computing_diff') return 'Computing diff...';
  if (run.phase === 'validating_matches') return 'Validating track matches...';
  if (run.phase === 'finalizing') return 'Finalizing preview...';
  if (run.phase === 'queued') return 'Queueing preview...';
  return getPreviewProgressLabel(elapsedSeconds);
}

export function formatPreviewError(error: unknown): string {
  if (error instanceof SyncPreviewTimeoutError) {
    return 'Preview is still running in background. Keep this dialog open to follow progress, or close and reopen later.';
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Failed to generate preview. Please try again.';
}

export function getPreviewErrorMessage(
  isPreviewError: boolean,
  previewError: unknown,
  previewSession: SyncPreviewSession | null,
): string {
  if (isPreviewError) {
    return formatPreviewError(previewError);
  }

  if (previewSession?.status === 'failed') {
    return previewSession.errorMessage ?? 'Failed to generate preview. Please try again.';
  }

  return '';
}

export function buildApplyErrorMessage(applyError: unknown, previewSession: SyncPreviewSession | null): string {
  if (applyError instanceof Error) {
    return applyError.message;
  }

  if (previewSession?.applyErrorMessage) {
    return previewSession.applyErrorMessage;
  }

  return 'Sync failed while applying changes.';
}

export function useApplyProgressState(isApplying: boolean): {
  applyProgressPercent: number;
  isApplyLikelyStuck: boolean;
} {
  const [applyElapsedSeconds, setApplyElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isApplying) {
      setApplyElapsedSeconds(0);
      return;
    }

    const id = setInterval(() => {
      setApplyElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(id);
  }, [isApplying]);

  const applyProgressPercent = isApplying
    ? Math.min(95, Math.max(4, Math.floor((applyElapsedSeconds / 300) * 100)))
    : 100;

  return {
    applyProgressPercent,
    isApplyLikelyStuck: isApplying && applyElapsedSeconds > 180,
  };
}
