'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import type { SyncDialogConfig } from '@features/sync/stores/useSyncDialogStore';
import { SyncPreviewTimeoutError, useSyncPreview } from '@features/sync/hooks/useSyncPreview';
import { useSyncApply } from '@features/sync/hooks/useSyncApply';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import { SyncSplitView } from '@features/sync/ui/SyncSplitView';
import { SyncRunResultContent } from '@features/sync/ui/SyncRunResultContent';
import type { SyncApplyResult, SyncPreviewResult, SyncPreviewRun } from '@/lib/sync/types';
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';
import { apiFetch } from '@/lib/api/client';

type Step = 'preview' | 'result';

interface PreviewStatusResponse {
  run: SyncPreviewRun | null;
  result: SyncPreviewResult | null;
}

function buildPreviewKey(config: SyncDialogConfig): string {
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

function getRunPhaseLabel(run: SyncPreviewRun | null, elapsedSeconds: number): string {
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

function formatPreviewError(error: unknown): string {
  if (error instanceof SyncPreviewTimeoutError) {
    return 'Preview is still running in background. Keep this dialog open to follow progress, or close and reopen later.';
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Failed to generate preview. Please try again.';
}

function useApplyProgressState(isApplying: boolean): {
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

function ResultStep({
  result,
  onDone,
}: {
  result: SyncApplyResult;
  onDone: () => void;
}) {
  const hasErrors = result.errors.length > 0;
  const hasUnresolved = result.unresolved.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        {hasErrors ? (
          <AlertTriangle className="h-10 w-10 text-yellow-500" />
        ) : hasUnresolved ? (
          <AlertTriangle className="h-10 w-10 text-yellow-500" />
        ) : (
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        )}
        <p className="text-sm font-medium">
          {hasErrors ? 'Sync completed with issues' : hasUnresolved ? 'Sync completed with warnings' : 'Sync completed'}
        </p>
      </div>

      <SyncRunResultContent source={result} />

      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}

function PreviewStatusMessage({
  isLoading,
  previewError,
  applyError,
  applyErrorMessage,
  elapsedSeconds,
  previewRun,
  previewErrorMessage,
  onRetryPreview,
}: {
  isLoading: boolean;
  previewError: boolean;
  applyError: boolean;
  applyErrorMessage: string;
  elapsedSeconds: number;
  previewRun: SyncPreviewRun | null;
  previewErrorMessage: string;
  onRetryPreview: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{getRunPhaseLabel(previewRun, elapsedSeconds)}</p>
        <p className="text-xs text-muted-foreground">
          {previewRun ? `Progress: ${previewRun.progress}%` : `Elapsed: ${elapsedSeconds}s`}
        </p>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">
        <p>{previewErrorMessage}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetryPreview}>Retry preview</Button>
      </div>
    );
  }

  if (applyError) {
    return (
      <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">
        <p>{applyErrorMessage}</p>
        <p className="mt-1 text-xs text-red-400">Please review and try applying again.</p>
      </div>
    );
  }

  return null;
}

function PreviewStepContent({
  config,
  previewData,
  sourcePlaylistName,
  targetPlaylistName,
  isLoading,
  previewError,
  applyError,
  applyErrorMessage,
  elapsedSeconds,
  previewRun,
  previewErrorMessage,
  onRetryPreview,
  isApplying,
  applyProgressPercent,
  isApplyLikelyStuck,
  onApply,
  onCancel,
}: {
  config: { sourceProvider: string; targetProvider: string } | null;
  previewData: SyncPreviewResult | null;
  sourcePlaylistName: string;
  targetPlaylistName: string;
  isLoading: boolean;
  previewError: boolean;
  applyError: boolean;
  applyErrorMessage: string;
  elapsedSeconds: number;
  previewRun: SyncPreviewRun | null;
  previewErrorMessage: string;
  onRetryPreview: () => void;
  isApplying: boolean;
  applyProgressPercent: number;
  isApplyLikelyStuck: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const plan = previewData?.plan ?? null;
  const hasChanges = plan !== null && (plan.summary.toAdd > 0 || plan.summary.toRemove > 0);
  const isNoopPreview = plan !== null && !hasChanges && !isLoading && !previewError && !applyError;

  return (
    <div className="space-y-4">
      {config && (
        <p className="text-xs text-muted-foreground text-center">
          {sourcePlaylistName} &harr; {targetPlaylistName}
        </p>
      )}

      <PreviewStatusMessage
        isLoading={isLoading}
        previewError={previewError}
        applyError={applyError}
        applyErrorMessage={applyErrorMessage}
        elapsedSeconds={elapsedSeconds}
        previewRun={previewRun}
        previewErrorMessage={previewErrorMessage}
        onRetryPreview={onRetryPreview}
      />

      {plan && previewData && (
        <SyncSplitView
          plan={plan}
          sourceTracks={previewData.sourceTracks}
          targetTracks={previewData.targetTracks}
          sourcePlaylistName={sourcePlaylistName}
          targetPlaylistName={targetPlaylistName}
        />
      )}

      <div className={`min-h-[58px] rounded-md border border-border bg-muted/30 px-3 py-2 ${isApplying ? '' : 'invisible'}`}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Applying changes to playlists. This can take a while for large liked-song syncs.</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${Math.max(4, Math.min(100, applyProgressPercent))}%` }}
          />
        </div>
        {isApplyLikelyStuck && (
          <p className="mt-1 text-xs text-yellow-500">
            This run is taking unusually long. It may be rate-limited; it will continue in background.
          </p>
        )}
      </div>

      <DialogFooter>
        {isApplying && (
          <span className="mr-auto text-xs text-muted-foreground">
            Sync continues in background if you close.
          </span>
        )}
        {isNoopPreview && !isApplying && (
          <span className="mr-auto text-xs text-muted-foreground">
            No differences found. Close this preview when you are done.
          </span>
        )}
        <Button variant="outline" onClick={onCancel}>{isApplying || isNoopPreview ? 'Close' : 'Cancel'}</Button>
        {hasChanges && (
          <Button onClick={onApply} disabled={isApplying || isLoading}>
            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isApplying ? 'Applying...' : 'Apply'}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

const STEP_TITLES: Record<Step, string> = {
  preview: 'Sync preview',
  result: 'Sync result',
};

const STEP_DESCRIPTIONS: Record<Step, string> = {
  preview: 'Review the anticipated result before applying.',
  result: 'Summary of the sync operation.',
};

function SyncPreviewDialogContent({
  step,
  result,
  previewData,
  previewRun,
  isPreviewLoading,
  isPreviewError,
  previewErrorMessage,
  applyError,
  applyErrorMessage,
  isApplying,
  applyProgressPercent,
  isApplyLikelyStuck,
  previewConfig,
  sourcePlaylistName,
  targetPlaylistName,
  elapsedSeconds,
  onApply,
  onRetryPreview,
  onClose,
}: {
  step: Step;
  result: SyncApplyResult | null;
  previewData: SyncPreviewResult | null;
  previewRun: SyncPreviewRun | null;
  isPreviewLoading: boolean;
  isPreviewError: boolean;
  previewErrorMessage: string;
  applyError: boolean;
  applyErrorMessage: string;
  isApplying: boolean;
  applyProgressPercent: number;
  isApplyLikelyStuck: boolean;
  previewConfig: SyncDialogConfig | null;
  sourcePlaylistName: string;
  targetPlaylistName: string;
  elapsedSeconds: number;
  onApply: () => void;
  onRetryPreview: () => void;
  onClose: () => void;
}) {
  if (step === 'result' && result) {
    return <ResultStep result={result} onDone={onClose} />;
  }

  return (
    <PreviewStepContent
      config={previewConfig}
      previewData={previewData}
      sourcePlaylistName={sourcePlaylistName}
      targetPlaylistName={targetPlaylistName}
      isLoading={isPreviewLoading}
      previewError={isPreviewError}
      elapsedSeconds={elapsedSeconds}
      previewRun={previewRun}
      previewErrorMessage={previewErrorMessage}
      onRetryPreview={onRetryPreview}
      applyError={applyError}
      applyErrorMessage={applyErrorMessage}
      isApplying={isApplying}
      applyProgressPercent={applyProgressPercent}
      isApplyLikelyStuck={isApplyLikelyStuck}
      onApply={onApply}
      onCancel={onClose}
    />
  );
}

export function SyncPreviewDialog() {
  const isPreviewOpen = useSyncDialogStore((s) => s.isPreviewOpen);
  const previewConfig = useSyncDialogStore((s) => s.previewConfig);
  const closePreview = useSyncDialogStore((s) => s.closePreview);
  const startPreviewSession = useSyncDialogStore((s) => s.startPreviewSession);
  const updatePreviewSessionRun = useSyncDialogStore((s) => s.updatePreviewSessionRun);
  const completePreviewSession = useSyncDialogStore((s) => s.completePreviewSession);
  const failPreviewSession = useSyncDialogStore((s) => s.failPreviewSession);
  const setPreviewSessionApplyResult = useSyncDialogStore((s) => s.setPreviewSessionApplyResult);
  const setPreviewSessionApplyError = useSyncDialogStore((s) => s.setPreviewSessionApplyError);
  const clearPreviewSession = useSyncDialogStore((s) => s.clearPreviewSession);
  const [step, setStep] = useState<Step>('preview');
  const [result, setResult] = useState<SyncApplyResult | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const lastPreviewRequestKeyRef = useRef<string | null>(null);
  const activePreviewKeyRef = useRef<string | null>(null);
  const previewKey = previewConfig ? buildPreviewKey(previewConfig) : null;
  const previewSession = useSyncDialogStore((s) => (previewKey ? s.previewSessions[previewKey] ?? null : null));

  const sourcePlaylistName = usePlaylistName(
    previewConfig?.sourceProvider ?? DEFAULT_MUSIC_PROVIDER_ID,
    previewConfig?.sourcePlaylistId ?? '',
  );
  const targetPlaylistName = usePlaylistName(
    previewConfig?.targetProvider ?? DEFAULT_MUSIC_PROVIDER_ID,
    previewConfig?.targetPlaylistId ?? '',
  );

  const preview = useSyncPreview();
  const apply = useSyncApply();
  const { applyProgressPercent, isApplyLikelyStuck } = useApplyProgressState(apply.isPending);

  const triggerPreview = useCallback(() => {
    if (!previewConfig || !previewKey) return;
    setElapsedSeconds(0);
    setStep('preview');
    setResult(null);
    preview.reset();
    apply.reset();
    startPreviewSession(previewKey, previewConfig);
    activePreviewKeyRef.current = previewKey;
    preview.mutate({ ...previewConfig, direction: 'bidirectional' });
  }, [previewConfig, previewKey, preview, apply, startPreviewSession]);

  useEffect(() => {
    const activeKey = activePreviewKeyRef.current;
    if (!activeKey || !preview.previewRun) return;
    updatePreviewSessionRun(activeKey, preview.previewRun);
  }, [preview.previewRun, updatePreviewSessionRun]);

  useEffect(() => {
    const activeKey = activePreviewKeyRef.current;
    if (!activeKey || !preview.isSuccess || !preview.data) return;
    completePreviewSession(activeKey, preview.data, preview.previewRun);
  }, [preview.isSuccess, preview.data, preview.previewRun, completePreviewSession]);

  useEffect(() => {
    const activeKey = activePreviewKeyRef.current;
    if (!activeKey || !preview.isError) return;

    if (preview.error instanceof SyncPreviewTimeoutError) {
      if (preview.previewRun) {
        updatePreviewSessionRun(activeKey, preview.previewRun);
      }
      return;
    }

    failPreviewSession(activeKey, formatPreviewError(preview.error), preview.previewRun);
  }, [preview.isError, preview.error, preview.previewRun, failPreviewSession, updatePreviewSessionRun]);

  useEffect(() => {
    if (!isPreviewOpen || !previewKey || !previewSession) return;
    if (preview.isPending) return;
    if (previewSession.status !== 'running') return;
    if (!previewSession.run?.id) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const status = await apiFetch<PreviewStatusResponse>(`/api/sync/preview/${previewSession.run!.id}`);
        if (cancelled || !status.run) return;

        if (status.run.status === 'done') {
          if (status.result) {
            completePreviewSession(previewKey, status.result, status.run);
          } else {
            failPreviewSession(previewKey, 'Preview completed without result payload.', status.run);
          }
          return;
        }

        if (status.run.status === 'failed') {
          failPreviewSession(previewKey, status.run.errorMessage ?? 'Preview failed.', status.run);
          return;
        }

        updatePreviewSessionRun(previewKey, status.run);
      } catch (error) {
        if (cancelled) return;

        const message = error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to refresh preview status.';
        failPreviewSession(previewKey, message, previewSession.run);
      }
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    isPreviewOpen,
    previewKey,
    previewSession,
    preview.isPending,
    completePreviewSession,
    failPreviewSession,
    updatePreviewSessionRun,
  ]);

  // Reset state and fetch preview when dialog opens
  useEffect(() => {
    if (!isPreviewOpen || !previewConfig || !previewKey) {
      return;
    }

    if (preview.isPending && activePreviewKeyRef.current === previewKey) {
      lastPreviewRequestKeyRef.current = previewKey;
      return;
    }

    if (previewSession?.status === 'done' && previewSession.result) {
      lastPreviewRequestKeyRef.current = previewKey;
      if (previewSession.applyResult) {
        setStep('result');
        setResult(previewSession.applyResult);
      } else {
        setStep('preview');
        setResult(null);
      }
      setElapsedSeconds(0);
      return;
    }

    if (previewSession?.status === 'failed') {
      lastPreviewRequestKeyRef.current = previewKey;
      setStep('preview');
      setResult(null);
      setElapsedSeconds(0);
      return;
    }

    if (lastPreviewRequestKeyRef.current === previewKey) {
      return;
    }

    lastPreviewRequestKeyRef.current = previewKey;

    triggerPreview();
  }, [isPreviewOpen, previewConfig, previewKey, preview.isPending, previewSession, triggerPreview]);

  useEffect(() => {
    const isPreviewLoading = preview.isPending || previewSession?.status === 'running';
    if (!isPreviewLoading) return;

    const id = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(id);
  }, [preview.isPending, previewSession?.status]);

  const previewData = preview.data ?? previewSession?.result ?? null;
  const previewRun = preview.previewRun ?? previewSession?.run ?? null;
  const isPreviewLoading = preview.isPending || previewSession?.status === 'running';
  const isPreviewError = preview.isError || previewSession?.status === 'failed';
  const previewErrorMessage = preview.isError
    ? formatPreviewError(preview.error)
    : (previewSession?.status === 'failed'
      ? (previewSession.errorMessage ?? 'Failed to generate preview. Please try again.')
      : '');
  const applyErrorMessage = apply.isError
    ? (apply.error instanceof Error ? apply.error.message : 'Sync failed while applying changes.')
    : (previewSession?.applyErrorMessage ?? 'Sync failed while applying changes.');
  const hasApplyError = apply.isError || !!previewSession?.applyErrorMessage;

  const handleApply = useCallback(() => {
    const plan = previewData?.plan;
    if (!plan) return;
    apply.mutate(
      { plan, syncPairId: previewConfig?.syncPairId },
      {
        onSuccess: (data: { result: SyncApplyResult; runId?: string }) => {
          if (previewKey) {
            setPreviewSessionApplyResult(previewKey, data.result);
          }
          setResult(data.result);
          setStep('result');
        },
        onError: (error: unknown) => {
          if (!previewKey) return;
          const message = error instanceof Error && error.message.trim().length > 0
            ? error.message
            : 'Sync failed while applying changes.';
          setPreviewSessionApplyError(previewKey, message);
        },
      },
    );
  }, [previewData, apply, previewConfig?.syncPairId, previewKey, setPreviewSessionApplyResult, setPreviewSessionApplyError]);

  const handleDone = useCallback(() => {
    if (previewKey) {
      clearPreviewSession(previewKey);
    }
    lastPreviewRequestKeyRef.current = null;
    activePreviewKeyRef.current = null;
    setStep('preview');
    setResult(null);
    setElapsedSeconds(0);
    preview.reset();
    apply.reset();
    closePreview();
  }, [previewKey, clearPreviewSession, preview, apply, closePreview]);

  return (
    <Dialog open={isPreviewOpen} onOpenChange={(open) => { if (!open) closePreview(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
          <DialogDescription>{STEP_DESCRIPTIONS[step]}</DialogDescription>
        </DialogHeader>

        <SyncPreviewDialogContent
          step={step}
          result={result}
          previewData={previewData}
          previewRun={previewRun}
          isPreviewLoading={isPreviewLoading}
          isPreviewError={isPreviewError}
          previewErrorMessage={previewErrorMessage}
          applyError={hasApplyError}
          applyErrorMessage={applyErrorMessage}
          isApplying={apply.isPending}
          applyProgressPercent={applyProgressPercent}
          isApplyLikelyStuck={isApplyLikelyStuck}
          previewConfig={previewConfig}
          sourcePlaylistName={sourcePlaylistName}
          targetPlaylistName={targetPlaylistName}
          elapsedSeconds={elapsedSeconds}
          onApply={handleApply}
          onRetryPreview={triggerPreview}
          onClose={step === 'result' ? handleDone : closePreview}
        />
      </DialogContent>
    </Dialog>
  );
}
