/**
 * Dialog components extracted from AddToMarkedButton.
 * - ConfirmHiddenDialog: confirms adding to markers in non-visible playlists
 * - DuplicateWarningDialog: warns when track already exists in target playlists
 */

'use client';

import { AlertTriangle, ArrowRight } from 'lucide-react';
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
import { Button } from '@/components/ui/button';

function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) {
    return singular;
  }

  return plural ?? `${singular}s`;
}

// --- Confirm Hidden Dialog ---

interface ConfirmHiddenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackName: string;
  totalMarkers: number;
  hiddenMarkerCount: number;
  hiddenPlaylistCount: number;
  onConfirm: () => void;
}

export function ConfirmHiddenDialog({
  open,
  onOpenChange,
  trackName,
  totalMarkers,
  hiddenMarkerCount,
  hiddenPlaylistCount,
  onConfirm,
}: ConfirmHiddenDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add to hidden playlists?</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to add &quot;{trackName}&quot; to{' '}
            <strong>{totalMarkers} marker {pluralize(totalMarkers, 'position')}</strong>.
            <br /><br />
            <span className="text-orange-500 font-medium">
              {hiddenMarkerCount} {pluralize(hiddenMarkerCount, 'marker')} in{' '}
              {hiddenPlaylistCount} {pluralize(hiddenPlaylistCount, 'playlist')}{' '}
              {hiddenPlaylistCount > 1 ? 'are' : 'is'} not currently visible.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Add to all {totalMarkers} positions
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// --- Duplicate Warning Dialog ---

interface DuplicateWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackName: string;
  duplicatePlaylistCount: number;
  onAbort: () => void;
  onSkipDuplicates: () => void;
  onMoveExisting: () => void;
  onAddAnyway: () => void;
}

export function DuplicateWarningDialog({
  open,
  onOpenChange,
  trackName,
  duplicatePlaylistCount,
  onAbort,
  onSkipDuplicates,
  onMoveExisting,
  onAddAnyway,
}: DuplicateWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Track already exists
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                &quot;{trackName}&quot; already exists in{' '}
                <strong>
                  {duplicatePlaylistCount}{' '}
                  {pluralize(duplicatePlaylistCount, 'playlist')}
                </strong>
                .
              </p>
              <p className="text-muted-foreground">
                Choose an action:
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onAbort}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onSkipDuplicates}>
            Skip duplicates
          </Button>
          <Button variant="secondary" onClick={onMoveExisting} className="gap-1">
            <ArrowRight className="h-4 w-4" />
            Move existing
          </Button>
          <Button onClick={onAddAnyway}>
            Add anyway
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
