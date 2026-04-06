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

type Step = 'preview' | 'result';

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
    return 'Preview took too long for this playlist size and was canceled. Try again, or use a smaller source/target while we move large previews to background processing.';
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Failed to generate preview. Please try again.';
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
  elapsedSeconds,
  previewRun,
  previewErrorMessage,
  onRetryPreview,
}: {
  isLoading: boolean;
  previewError: boolean;
  applyError: boolean;
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
    return <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">Sync failed. Please try again.</div>;
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
  elapsedSeconds,
  previewRun,
  previewErrorMessage,
  onRetryPreview,
  isApplying,
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
  elapsedSeconds: number;
  previewRun: SyncPreviewRun | null;
  previewErrorMessage: string;
  onRetryPreview: () => void;
  isApplying: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const plan = previewData?.plan ?? null;
  const hasChanges = plan !== null && (plan.summary.toAdd > 0 || plan.summary.toRemove > 0);

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

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        {hasChanges && (
          <Button onClick={onApply} disabled={isApplying || isLoading}>
            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply
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
  preview,
  apply,
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
  preview: ReturnType<typeof useSyncPreview>;
  apply: ReturnType<typeof useSyncApply>;
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
      previewData={preview.data ?? null}
      sourcePlaylistName={sourcePlaylistName}
      targetPlaylistName={targetPlaylistName}
      isLoading={preview.isPending}
      previewError={preview.isError}
      elapsedSeconds={elapsedSeconds}
      previewRun={preview.previewRun}
      previewErrorMessage={formatPreviewError(preview.error)}
      onRetryPreview={onRetryPreview}
      applyError={apply.isError}
      isApplying={apply.isPending}
      onApply={onApply}
      onCancel={onClose}
    />
  );
}

export function SyncPreviewDialog() {
  const { isPreviewOpen, previewConfig, closePreview } = useSyncDialogStore();
  const [step, setStep] = useState<Step>('preview');
  const [result, setResult] = useState<SyncApplyResult | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const lastPreviewRequestKeyRef = useRef<string | null>(null);
  const activePreviewKeyRef = useRef<string | null>(null);

  const sourcePlaylistName = usePlaylistName(
    previewConfig?.sourceProvider ?? 'spotify',
    previewConfig?.sourcePlaylistId ?? '',
  );
  const targetPlaylistName = usePlaylistName(
    previewConfig?.targetProvider ?? 'spotify',
    previewConfig?.targetPlaylistId ?? '',
  );

  const preview = useSyncPreview();
  const apply = useSyncApply();

  const triggerPreview = useCallback(() => {
    if (!previewConfig) return;
    setElapsedSeconds(0);
    activePreviewKeyRef.current = buildPreviewKey(previewConfig);
    preview.mutate({ ...previewConfig, direction: 'bidirectional' });
  }, [previewConfig, preview]);

  // Reset state and fetch preview when dialog opens
  useEffect(() => {
    if (!isPreviewOpen || !previewConfig) {
      return;
    }

    const previewKey = buildPreviewKey(previewConfig);

    if (preview.isPending && activePreviewKeyRef.current === previewKey) {
      lastPreviewRequestKeyRef.current = previewKey;
      return;
    }

    if (lastPreviewRequestKeyRef.current === previewKey) {
      return;
    }

    lastPreviewRequestKeyRef.current = previewKey;

    setStep('preview');
    setResult(null);
    preview.reset();
    apply.reset();
    triggerPreview();
  }, [isPreviewOpen, previewConfig, preview, apply, triggerPreview]);

  useEffect(() => {
    if (!preview.isPending) return;

    const id = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(id);
  }, [preview.isPending]);

  const handleApply = useCallback(() => {
    const plan = preview.data?.plan;
    if (!plan) return;
    apply.mutate(
      { plan, syncPairId: previewConfig?.syncPairId },
      {
        onSuccess: (data: { result: SyncApplyResult; runId?: string }) => {
          setResult(data.result);
          setStep('result');
        },
      },
    );
  }, [preview.data, apply, previewConfig?.syncPairId]);

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
          preview={preview}
          apply={apply}
          previewConfig={previewConfig}
          sourcePlaylistName={sourcePlaylistName}
          targetPlaylistName={targetPlaylistName}
          elapsedSeconds={elapsedSeconds}
          onApply={handleApply}
          onRetryPreview={triggerPreview}
          onClose={closePreview}
        />
      </DialogContent>
    </Dialog>
  );
}
