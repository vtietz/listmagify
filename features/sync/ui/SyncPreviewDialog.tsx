'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getStepDescription,
  getStepTitle,
  SyncPreviewDialogContent,
} from '@features/sync/ui/SyncPreviewDialogContent';
import { useSyncPreviewDialogController } from '@features/sync/ui/useSyncPreviewDialogController';

export function SyncPreviewDialog() {
  const controller = useSyncPreviewDialogController();

  return (
    <>
      <Dialog open={controller.isPreviewOpen} onOpenChange={(open) => { if (!open) controller.closePreview(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{getStepTitle(controller.step)}</DialogTitle>
            <DialogDescription>{getStepDescription(controller.step)}</DialogDescription>
          </DialogHeader>

          <SyncPreviewDialogContent
            step={controller.step}
            result={controller.result}
            previewData={controller.previewData}
            previewRun={controller.previewRun}
            isPreviewLoading={controller.isPreviewLoading}
            isPreviewError={controller.isPreviewError}
            previewErrorMessage={controller.previewErrorMessage}
            applyError={controller.hasApplyError}
            applyErrorMessage={controller.applyErrorMessage}
            isApplying={controller.isApplying}
            applyProgressPercent={controller.applyProgressPercent}
            isApplyLikelyStuck={controller.isApplyLikelyStuck}
            previewConfig={controller.previewConfig}
            sourcePlaylistName={controller.sourcePlaylistName}
            targetPlaylistName={controller.targetPlaylistName}
            elapsedSeconds={controller.elapsedSeconds}
            isCancelingPreview={controller.isCancelingPreview}
            onApply={controller.handleApply}
            onRetryPreview={controller.triggerPreview}
            onCancelPreview={controller.handleCancelPreview}
            onClose={controller.step === 'result' ? controller.handleDone : controller.closePreview}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={controller.isCancelConfirmOpen} onOpenChange={controller.setIsCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel sync preview?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the currently running preview task. You can start a new preview anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={controller.isCancelingPreview}>Keep running</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { void controller.handleConfirmCancelPreview(); }}
              disabled={controller.isCancelingPreview}
            >
              {controller.isCancelingPreview ? 'Canceling...' : 'Yes, cancel preview'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
