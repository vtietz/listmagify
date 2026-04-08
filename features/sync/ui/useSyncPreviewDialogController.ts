import { useState, useEffect, useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import type { SyncApplyResult, SyncPreviewResult, SyncPreviewRun } from '@/lib/sync/types';
import type { SyncPreviewSession } from '@features/sync/stores/useSyncDialogStore';
import { SyncPreviewTimeoutError, useSyncPreview } from '@features/sync/hooks/useSyncPreview';
import { useSyncApply } from '@features/sync/hooks/useSyncApply';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import {
  buildApplyErrorMessage,
  buildPreviewKey,
  formatPreviewError,
  getPreviewErrorMessage,
  useApplyProgressState,
} from '@features/sync/ui/syncPreviewDialogUtils';
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';
import { apiFetch } from '@/lib/api/client';
import type { Step } from '@features/sync/ui/SyncPreviewDialogContent';

interface PreviewStatusResponse {
  run: SyncPreviewRun | null;
  result: SyncPreviewResult | null;
}

type UpdatePreviewSessionRun = (previewKey: string, run: SyncPreviewRun) => void;
type CompletePreviewSession = (previewKey: string, result: SyncPreviewResult, run: SyncPreviewRun | null) => void;
type FailPreviewSession = (previewKey: string, message: string, run: SyncPreviewRun | null) => void;
type ClosePreview = () => void;

function usePreviewTicker(isPreviewLoading: boolean, setElapsedSeconds: (updater: (prev: number) => number) => void): void {
  useEffect(() => {
    if (!isPreviewLoading) return;

    const id = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(id);
  }, [isPreviewLoading, setElapsedSeconds]);
}

function restoreStepFromSession(params: {
  previewSession: SyncPreviewSession | null;
  previewKey: string;
  setStep: (step: Step) => void;
  setResult: (result: SyncApplyResult | null) => void;
  setElapsedSeconds: (value: number) => void;
  lastPreviewRequestKeyRef: MutableRefObject<string | null>;
}): boolean {
  const { previewSession, previewKey, setStep, setResult, setElapsedSeconds, lastPreviewRequestKeyRef } = params;

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
    return true;
  }

  if (previewSession?.status === 'failed') {
    lastPreviewRequestKeyRef.current = previewKey;
    setStep('preview');
    setResult(null);
    setElapsedSeconds(0);
    return true;
  }

  return false;
}

function usePreviewSessionSync(params: {
  preview: ReturnType<typeof useSyncPreview>;
  updatePreviewSessionRun: UpdatePreviewSessionRun;
  completePreviewSession: CompletePreviewSession;
  failPreviewSession: FailPreviewSession;
  activePreviewKeyRef: MutableRefObject<string | null>;
}): void {
  const { preview, updatePreviewSessionRun, completePreviewSession, failPreviewSession, activePreviewKeyRef } = params;

  useEffect(() => {
    const activeKey = activePreviewKeyRef.current;
    if (!activeKey || !preview.previewRun) return;
    updatePreviewSessionRun(activeKey, preview.previewRun);
  }, [preview.previewRun, updatePreviewSessionRun, activePreviewKeyRef]);

  useEffect(() => {
    const activeKey = activePreviewKeyRef.current;
    if (!activeKey || !preview.isSuccess || !preview.data) return;
    completePreviewSession(activeKey, preview.data, preview.previewRun);
  }, [preview.isSuccess, preview.data, preview.previewRun, completePreviewSession, activePreviewKeyRef]);

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
  }, [
    preview.isError,
    preview.error,
    preview.previewRun,
    failPreviewSession,
    updatePreviewSessionRun,
    activePreviewKeyRef,
  ]);
}

function usePreviewStatusPolling(params: {
  isPreviewOpen: boolean;
  previewKey: string | null;
  previewSession: SyncPreviewSession | null;
  isPreviewPending: boolean;
  completePreviewSession: CompletePreviewSession;
  failPreviewSession: FailPreviewSession;
  updatePreviewSessionRun: UpdatePreviewSessionRun;
}): void {
  const {
    isPreviewOpen,
    previewKey,
    previewSession,
    isPreviewPending,
    completePreviewSession,
    failPreviewSession,
    updatePreviewSessionRun,
  } = params;

  useEffect(() => {
    if (!isPreviewOpen || !previewKey || !previewSession) return;
    if (isPreviewPending || previewSession.status !== 'running' || !previewSession.run?.id) return;

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
    isPreviewPending,
    completePreviewSession,
    failPreviewSession,
    updatePreviewSessionRun,
  ]);
}

async function cancelPreviewRun(params: {
  preview: ReturnType<typeof useSyncPreview>;
  previewRunId: string | undefined;
  previewSessionRun: SyncPreviewRun | null | undefined;
  previewKey: string | null;
  failPreviewSession: FailPreviewSession;
  closePreview: ClosePreview;
}): Promise<void> {
  const { preview, previewRunId, previewSessionRun, previewKey, failPreviewSession, closePreview } = params;

  preview.cancelCurrentRun();

  if (previewRunId) {
    await apiFetch<{ canceled: boolean }>(`/api/sync/preview/${previewRunId}`, { method: 'DELETE' });
  }

  if (previewKey) {
    failPreviewSession(previewKey, 'Preview canceled by user.', previewSessionRun ?? null);
  }

  closePreview();
}

export function useSyncPreviewDialogController() {
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
  const [isCancelingPreview, setIsCancelingPreview] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);

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

  usePreviewSessionSync({
    preview,
    updatePreviewSessionRun,
    completePreviewSession,
    failPreviewSession,
    activePreviewKeyRef,
  });

  usePreviewStatusPolling({
    isPreviewOpen,
    previewKey,
    previewSession,
    isPreviewPending: preview.isPending,
    completePreviewSession,
    failPreviewSession,
    updatePreviewSessionRun,
  });

  useEffect(() => {
    if (!isPreviewOpen || !previewConfig || !previewKey) return;

    if (preview.isPending && activePreviewKeyRef.current === previewKey) {
      lastPreviewRequestKeyRef.current = previewKey;
      return;
    }

    const restoredFromSession = restoreStepFromSession({
      previewSession,
      previewKey,
      setStep,
      setResult,
      setElapsedSeconds,
      lastPreviewRequestKeyRef,
    });
    if (restoredFromSession) return;

    if (lastPreviewRequestKeyRef.current === previewKey) return;

    lastPreviewRequestKeyRef.current = previewKey;
    triggerPreview();
  }, [isPreviewOpen, previewConfig, previewKey, preview.isPending, previewSession, triggerPreview]);

  const isPreviewLoading = preview.isPending || previewSession?.status === 'running';
  usePreviewTicker(isPreviewLoading, setElapsedSeconds);

  const previewData = preview.data ?? previewSession?.result ?? null;
  const previewRun = preview.previewRun ?? previewSession?.run ?? null;
  const isPreviewError = preview.isError || previewSession?.status === 'failed';
  const previewErrorMessage = getPreviewErrorMessage(preview.isError, preview.error, previewSession);
  const applyErrorMessage = apply.isError
    ? buildApplyErrorMessage(apply.error, previewSession)
    : buildApplyErrorMessage(null, previewSession);
  const hasApplyError = apply.isError || !!previewSession?.applyErrorMessage;

  const handleCancelPreview = useCallback(() => {
    setIsCancelConfirmOpen(true);
  }, []);

  const handleConfirmCancelPreview = useCallback(async () => {
    if (!isPreviewLoading || isCancelingPreview) return;

    setIsCancelConfirmOpen(false);
    setIsCancelingPreview(true);

    try {
      await cancelPreviewRun({
        preview,
        previewRunId: previewRun?.id ?? previewSession?.run?.id,
        previewSessionRun: previewSession?.run,
        previewKey,
        failPreviewSession,
        closePreview,
      });
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Failed to cancel preview.';
      if (previewKey) {
        failPreviewSession(previewKey, message, previewSession?.run ?? null);
      }
    } finally {
      setIsCancelingPreview(false);
    }
  }, [
    isPreviewLoading,
    isCancelingPreview,
    preview,
    previewRun?.id,
    previewSession?.run,
    previewKey,
    failPreviewSession,
    closePreview,
  ]);

  const handleApplySuccess = useCallback((data: { result: SyncApplyResult; runId?: string }) => {
    if (previewKey) {
      setPreviewSessionApplyResult(previewKey, data.result);
    }
    setResult(data.result);
    setStep('result');
  }, [previewKey, setPreviewSessionApplyResult]);

  const handleApplyError = useCallback((error: unknown) => {
    if (!previewKey) return;

    const message = error instanceof Error && error.message.trim().length > 0
      ? error.message
      : 'Sync failed while applying changes.';
    setPreviewSessionApplyError(previewKey, message);
  }, [previewKey, setPreviewSessionApplyError]);

  const handleApply = useCallback(() => {
    const plan = previewData?.plan;
    if (!plan) return;

    apply.mutate(
      { plan, syncPairId: previewConfig?.syncPairId },
      {
        onSuccess: handleApplySuccess,
        onError: handleApplyError,
      },
    );
  }, [previewData, apply, previewConfig?.syncPairId, handleApplySuccess, handleApplyError]);

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

  return {
    isPreviewOpen,
    closePreview,
    step,
    result,
    previewData,
    previewRun,
    isPreviewLoading,
    isPreviewError,
    previewErrorMessage,
    hasApplyError,
    applyErrorMessage,
    isApplying: apply.isPending,
    applyProgressPercent,
    isApplyLikelyStuck,
    previewConfig,
    sourcePlaylistName,
    targetPlaylistName,
    elapsedSeconds,
    isCancelingPreview,
    isCancelConfirmOpen,
    setIsCancelConfirmOpen,
    triggerPreview,
    handleCancelPreview,
    handleConfirmCancelPreview,
    handleApply,
    handleDone,
  };
}
