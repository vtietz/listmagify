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
import { ImportTaskDetail } from '@/features/import/ui/ImportTaskDetail';
import type { ImportJobPlaylist } from '@/lib/import/types';

interface ImportTaskResultDialogProps {
  entry: ImportJobPlaylist | null;
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

function resultTitle(status: ImportJobPlaylist['status']): string {
  switch (status) {
    case 'done': return 'Import completed';
    case 'partial': return 'Import completed with unresolved tracks';
    case 'failed': return 'Import failed';
    default: return 'Import result';
  }
}

export function ImportTaskResultDialog({ entry, open, onClose }: ImportTaskResultDialogProps) {
  if (!entry) return null;

  const hasError = entry.status === 'failed';
  const hasWarning = entry.status === 'partial';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{entry.sourcePlaylistName}</DialogTitle>
          <DialogDescription>
            {entry.status === 'done' || entry.status === 'partial' || entry.status === 'failed'
              ? formatTimestamp(new Date().toISOString())
              : 'In progress'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            {hasError ? (
              <X className="h-8 w-8 text-red-500" />
            ) : hasWarning ? (
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            )}
            <p className="text-sm font-medium">{resultTitle(entry.status)}</p>
          </div>

          <ImportTaskDetail entry={entry} />
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
