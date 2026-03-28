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
import { useSyncPreview } from '@features/sync/hooks/useSyncPreview';
import { useSyncExecute } from '@features/sync/hooks/useSyncExecute';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import { SyncSplitView } from '@features/sync/ui/SyncSplitView';
import type { SyncPlan, SyncApplyResult, SyncPreviewResult } from '@/lib/sync/types';

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
        ) : (
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        )}
        <p className="text-sm font-medium">
          {hasErrors ? 'Sync completed with issues' : 'Sync completed'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md bg-green-500/10 p-3 text-center">
          <div className="text-lg font-semibold text-green-500">
            {result.added}
          </div>
          <div className="text-xs text-muted-foreground">Tracks added</div>
        </div>
        <div className="rounded-md bg-red-500/10 p-3 text-center">
          <div className="text-lg font-semibold text-red-500">
            {result.removed}
          </div>
          <div className="text-xs text-muted-foreground">Tracks removed</div>
        </div>
      </div>

      {hasUnresolved && (
        <div className="rounded-md bg-yellow-500/10 p-3 text-sm">
          <div className="font-medium text-yellow-500">
            {result.unresolved.length} unresolved track(s)
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            These tracks could not be matched on the target provider.
          </p>
          <div className="mt-2 max-h-[200px] overflow-y-auto space-y-1">
            {result.unresolved.map((track) => (
              <div
                key={track.canonicalTrackId}
                className="flex items-center gap-2 py-1 text-xs border-l-2 border-yellow-500 pl-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{track.title}</div>
                  <div className="truncate text-muted-foreground">
                    {track.artists.join(', ')}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-yellow-500 shrink-0">
                  <AlertTriangle className="h-3 w-3" />
                  {Math.round(track.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasErrors && (
        <div className="rounded-md bg-red-500/10 p-3 text-sm">
          <div className="font-medium text-red-500">
            {result.errors.length} error(s)
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {result.errors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {result.errors.length > 5 && (
              <li>...and {result.errors.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}

function PreviewStatusMessage({ isLoading, previewError, executeError }: {
  isLoading: boolean;
  previewError: boolean;
  executeError: boolean;
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

  if (executeError) {
    return <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">Sync execution failed. Please try again.</div>;
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
  executeError,
  isExecuting,
  onExecute,
  onCancel,
}: {
  config: { sourceProvider: string; targetProvider: string } | null;
  previewData: SyncPreviewResult | null;
  sourcePlaylistName: string;
  targetPlaylistName: string;
  isLoading: boolean;
  previewError: boolean;
  executeError: boolean;
  isExecuting: boolean;
  onExecute: () => void;
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

      <PreviewStatusMessage isLoading={isLoading} previewError={previewError} executeError={executeError} />

      {plan && previewData && (
        <>
          <SyncSplitView
            plan={plan}
            sourceTracks={previewData.sourceTracks}
            targetTracks={previewData.targetTracks}
            sourcePlaylistName={sourcePlaylistName}
            targetPlaylistName={targetPlaylistName}
          />
          {hasChanges && (
            <p className="text-xs text-muted-foreground">
              {plan.summary.toAdd} to add, {plan.summary.toRemove} to remove
              {plan.summary.unresolved > 0 && `, ${plan.summary.unresolved} unresolved`}
            </p>
          )}
        </>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        {hasChanges && (
          <Button onClick={onExecute} disabled={isExecuting || isLoading}>
            {isExecuting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Execute
          </Button>
        )}
      </DialogFooter>
    </div>
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
  const execute = useSyncExecute();

  const direction = 'bidirectional' as const;

  useEffect(() => {
    if (isPreviewOpen && previewConfig) {
      setStep('preview');
      setResult(null);
      preview.reset();
      execute.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewOpen]);

  useEffect(() => {
    if (!isPreviewOpen || !previewConfig) return;
    preview.mutate({ ...previewConfig, direction });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewOpen]);

  const handleExecute = useCallback(() => {
    if (!previewConfig) return;
    execute.mutate(
      { ...previewConfig, direction },
      {
        onSuccess: (data: { plan: SyncPlan; result: SyncApplyResult; runId?: string }) => {
          setResult(data.result);
          setStep('result');
        },
      },
    );
  }, [previewConfig, execute]);

  return (
    <Dialog open={isPreviewOpen} onOpenChange={(open) => { if (!open) closePreview(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{step === 'preview' ? 'Sync preview' : 'Sync result'}</DialogTitle>
          <DialogDescription>
            {step === 'preview' ? 'Review the changes before syncing.' : 'Summary of the sync operation.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'preview' && (
          <PreviewStepContent
            config={previewConfig}
            previewData={preview.data ?? null}
            sourcePlaylistName={sourcePlaylistName}
            targetPlaylistName={targetPlaylistName}
            isLoading={preview.isPending}
            previewError={preview.isError}
            executeError={execute.isError}
            isExecuting={execute.isPending}
            onExecute={handleExecute}
            onCancel={closePreview}
          />
        )}

        {step === 'result' && result && (
          <ResultStep result={result} onDone={closePreview} />
        )}
      </DialogContent>
    </Dialog>
  );
}
