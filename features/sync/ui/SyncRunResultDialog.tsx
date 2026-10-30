'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { SyncRunResultContent } from '@features/sync/ui/SyncRunResultContent';
import { useManualResolutions } from '@features/sync/hooks/useManualResolutions';
import type { SyncRun } from '@/lib/sync/types';

interface SyncRunResultDialogProps {
  run: SyncRun | null;
  open: boolean;
  onClose: () => void;
  /** Opens a fresh preview of the pair (uses any matches made here). */
  onSyncAgain?: () => void;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Sync again" after manual fixes; "Review in preview" for runs that cannot be fixed in place. */
function SyncAgainButton({ resolvedCount, hasLegacyWarnings, onClick }: {
  resolvedCount: number;
  hasLegacyWarnings: boolean;
  onClick: () => void;
}) {
  if (resolvedCount > 0) {
    return <Button variant="outline" onClick={onClick}>Sync again ({resolvedCount} resolved)</Button>;
  }
  if (hasLegacyWarnings) {
    return <Button variant="outline" onClick={onClick}>Review in preview</Button>;
  }
  return null;
}

export function SyncRunResultDialog({ run, open, onClose, onSyncAgain }: SyncRunResultDialogProps) {
  const manual = useManualResolutions(run?.syncPairId);

  if (!run) return null;

  const hasErrors = run.status === 'failed';
  const hasWarnings = run.warnings.length > 0;
  // Runs recorded before the target side was stored can only be fixed from a new preview.
  const hasLegacyWarnings = run.warnings.some((warning) => !warning.targetProvider);

  const handleClose = () => {
    manual.reset();
    onClose();
  };

  const handleSyncAgain = () => {
    manual.reset();
    onSyncAgain?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sync result</DialogTitle>
          <DialogDescription>
            {run.completedAt ? formatTimestamp(run.completedAt) : 'In progress'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            {hasErrors ? (
              <X className="h-8 w-8 text-red-500" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            )}
            <p className="text-sm font-medium">
              {hasErrors ? 'Sync failed' : hasWarnings ? 'Sync completed with warnings' : 'Sync completed'}
            </p>
          </div>

          <SyncRunResultContent source={run} manual={manual} />
        </div>

        <DialogFooter>
          {onSyncAgain && (
            <SyncAgainButton
              resolvedCount={manual.resolvedCount}
              hasLegacyWarnings={hasLegacyWarnings}
              onClick={handleSyncAgain}
            />
          )}
          <Button onClick={handleClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
