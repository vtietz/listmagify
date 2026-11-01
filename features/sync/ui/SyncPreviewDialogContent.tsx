import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { SyncSplitView } from '@features/sync/ui/SyncSplitView';
import { SyncRunResultContent } from '@features/sync/ui/SyncRunResultContent';
import { MassRemovalNotice } from '@features/sync/ui/MassRemovalNotice';
import { ProviderGlyph } from '@/components/auth/ProviderStatusDropdown';
import type { SyncApplyResult, SyncPreviewResult, SyncPreviewRun } from '@/lib/sync/types';
import type { SyncDialogConfig } from '@features/sync/stores/useSyncDialogStore';
import { getRunPhaseLabel } from '@features/sync/ui/syncPreviewDialogUtils';
import type { ManualResolutionsState } from '@features/sync/hooks/useManualResolutions';

export type Step = 'preview' | 'result';

const STEP_TITLES: Record<Step, string> = {
  preview: 'Sync preview',
  result: 'Sync result',
};

const STEP_DESCRIPTIONS: Record<Step, string> = {
  preview: 'Review the anticipated result before applying.',
  result: 'Summary of the sync operation.',
};

export function getStepTitle(step: Step): string {
  return STEP_TITLES[step];
}

export function getStepDescription(step: Step): string {
  return STEP_DESCRIPTIONS[step];
}

function ResultStep({
  result,
  manual,
  onSyncAgain,
  onDone,
}: {
  result: SyncApplyResult;
  manual: ManualResolutionsState;
  onSyncAgain: () => void;
  onDone: () => void;
}) {
  const hasErrors = result.errors.length > 0;
  const hasUnresolved = result.unresolved.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        {hasErrors || hasUnresolved ? (
          <AlertTriangle className="h-10 w-10 text-yellow-500" />
        ) : (
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        )}
        <p className="text-sm font-medium">
          {hasErrors ? 'Sync completed with issues' : hasUnresolved ? 'Sync completed with warnings' : 'Sync completed'}
        </p>
      </div>

      <SyncRunResultContent source={result} manual={manual} />

      <DialogFooter>
        {manual.resolvedCount > 0 && (
          <Button variant="outline" onClick={onSyncAgain}>
            Sync again ({manual.resolvedCount} resolved)
          </Button>
        )}
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

function PreviewApplyProgress({
  isApplying,
  applyProgressPercent,
  isApplyLikelyStuck,
}: {
  isApplying: boolean;
  applyProgressPercent: number;
  isApplyLikelyStuck: boolean;
}) {
  return (
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
  );
}

function PreviewFooter({
  isApplying,
  isNoopPreview,
  canCancelPreview,
  isCancelingPreview,
  hasChanges,
  isLoading,
  onClose,
  onCancelPreview,
  onApply,
}: {
  isApplying: boolean;
  isNoopPreview: boolean;
  canCancelPreview: boolean;
  isCancelingPreview: boolean;
  hasChanges: boolean;
  isLoading: boolean;
  onClose: () => void;
  onCancelPreview: () => void;
  onApply: () => void;
}) {
  return (
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
      <Button variant="outline" onClick={onClose}>Close</Button>
      {canCancelPreview && (
        <Button variant="destructive" onClick={onCancelPreview} disabled={isCancelingPreview}>
          {isCancelingPreview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Cancel preview
        </Button>
      )}
      {hasChanges && (
        <Button onClick={onApply} disabled={isApplying || isLoading}>
          {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isApplying ? 'Applying...' : 'Apply'}
        </Button>
      )}
    </DialogFooter>
  );
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
  isCancelingPreview,
  onCancelPreview,
  onClose,
  manual,
}: {
  manual: ManualResolutionsState;
  config: SyncDialogConfig | null;
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
  isCancelingPreview: boolean;
  onCancelPreview: () => void;
  onClose: () => void;
}) {
  const plan = previewData?.plan ?? null;
  const hasChanges = plan !== null && (plan.summary.toAdd > 0 || plan.summary.toRemove > 0);
  const isNoopPreview = plan !== null && !hasChanges && !isLoading && !previewError && !applyError;

  return (
    <div className="space-y-4">
      {config && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <ProviderGlyph providerId={config.sourceProvider} />
            <span className="truncate">{sourcePlaylistName}</span>
          </span>
          <span aria-hidden="true">&harr;</span>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <ProviderGlyph providerId={config.targetProvider} />
            <span className="truncate">{targetPlaylistName}</span>
          </span>
        </div>
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

      <MassRemovalNotice plan={plan} />

      {plan && previewData && (
        <SyncSplitView
          plan={plan}
          sourceTracks={previewData.sourceTracks}
          targetTracks={previewData.targetTracks}
          sourcePlaylistName={sourcePlaylistName}
          targetPlaylistName={targetPlaylistName}
          manual={manual}
        />
      )}

      <PreviewApplyProgress
        isApplying={isApplying}
        applyProgressPercent={applyProgressPercent}
        isApplyLikelyStuck={isApplyLikelyStuck}
      />

      <PreviewFooter
        isApplying={isApplying}
        isNoopPreview={isNoopPreview}
        canCancelPreview={isLoading}
        isCancelingPreview={isCancelingPreview}
        hasChanges={hasChanges}
        isLoading={isLoading}
        onClose={onClose}
        onCancelPreview={onCancelPreview}
        onApply={onApply}
      />
    </div>
  );
}

export function SyncPreviewDialogContent({
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
  isCancelingPreview,
  onApply,
  onRetryPreview,
  onCancelPreview,
  onClose,
  manual,
}: {
  manual: ManualResolutionsState;
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
  isCancelingPreview: boolean;
  onApply: () => void;
  onRetryPreview: () => void;
  onCancelPreview: () => void;
  onClose: () => void;
}) {
  if (step === 'result' && result) {
    return <ResultStep result={result} manual={manual} onSyncAgain={onRetryPreview} onDone={onClose} />;
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
      isCancelingPreview={isCancelingPreview}
      onCancelPreview={onCancelPreview}
      onClose={onClose}
      manual={manual}
    />
  );
}
