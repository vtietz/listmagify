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
import type { SyncRun } from '@/lib/sync/types';

interface SyncRunResultDialogProps {
  run: SyncRun | null;
  open: boolean;
  onClose: () => void;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SyncRunResultDialog({ run, open, onClose }: SyncRunResultDialogProps) {
  if (!run) return null;

  const hasErrors = run.status === 'failed';
  const hasWarnings = run.warnings.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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

          <SyncRunResultContent source={run} />
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
