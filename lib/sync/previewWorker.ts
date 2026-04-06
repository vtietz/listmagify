import { claimNextPendingSyncPreviewRun, requeueExecutingSyncPreviewRuns } from '@/lib/sync/previewStore';
import { executePreviewRun } from '@/lib/sync/runner';

function getPreviewWorkerTickMs(): number {
  return Number(process.env.SYNC_PREVIEW_WORKER_TICK_MS ?? 1000);
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

async function processOnePreviewRun(): Promise<void> {
  if (isProcessing) {
    return;
  }

  const claimed = claimNextPendingSyncPreviewRun();
  if (!claimed) {
    return;
  }

  isProcessing = true;
  try {
    await executePreviewRun(claimed.id, claimed.config, claimed.matchThresholds, claimed.providerUserIds);
  } finally {
    isProcessing = false;
  }
}

export function startPreviewWorkerLoop(): void {
  if (intervalId) {
    return;
  }

  const recoveredCount = requeueExecutingSyncPreviewRuns();
  if (recoveredCount > 0) {
    console.warn('[sync/preview-worker] recovered orphaned executing runs', {
      recoveredCount,
    });
  }

  intervalId = setInterval(() => {
    void processOnePreviewRun().catch((error) => {
      console.error('[sync/preview-worker] unhandled', error);
    });
  }, getPreviewWorkerTickMs());

  void processOnePreviewRun().catch((error) => {
    console.error('[sync/preview-worker] initial run failed', error);
  });

  console.debug('[sync/preview-worker] starting', {
    tickMs: getPreviewWorkerTickMs(),
  });
}

export function stopPreviewWorkerLoop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isProcessing = false;
}
