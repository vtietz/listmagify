'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { useSyncPreview } from '@features/sync/hooks/useSyncPreview';
import { useSyncApply } from '@features/sync/hooks/useSyncApply';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import { SyncSplitView } from '@features/sync/ui/SyncSplitView';
import { SyncRunResultContent } from '@features/sync/ui/SyncRunResultContent';
import type { SyncApplyResult, SyncPreviewResult } from '@/lib/sync/types';

type Step = 'preview' | 'result';

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

function PreviewStatusMessage({ isLoading, previewError, applyError }: {
  isLoading: boolean;
  previewError: boolean;
  applyError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Computing diff...</p>
      </div>
    );
  }

  if (previewError) {
    return <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">Failed to generate preview. Please try again.</div>;
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

      <PreviewStatusMessage isLoading={isLoading} previewError={previewError} applyError={applyError} />

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
  onApply,
  onClose,
}: {
  step: Step;
  result: SyncApplyResult | null;
  preview: ReturnType<typeof useSyncPreview>;
  apply: ReturnType<typeof useSyncApply>;
  previewConfig: SyncDialogConfig | null;
  sourcePlaylistName: string;
  targetPlaylistName: string;
  onApply: () => void;
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

  // Reset state and fetch preview when dialog opens
  useEffect(() => {
    if (!isPreviewOpen || !previewConfig) return;
    setStep('preview');
    setResult(null);
    preview.reset();
    apply.reset();
    preview.mutate({ ...previewConfig, direction: 'bidirectional' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewOpen]);

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
          onApply={handleApply}
          onClose={closePreview}
        />
      </DialogContent>
    </Dialog>
  );
}
