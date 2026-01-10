/**
 * ConfirmDeleteDialog - Controlled dialog for multi-track delete confirmation.
 *
 * Used when deleting multiple selected tracks via keyboard shortcut or bulk action.
 */

'use client';

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

interface ConfirmDeleteDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Number of tracks to delete */
  count: number;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback when delete is confirmed */
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({
  open,
  count,
  onOpenChange,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {count} tracks?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove {count} tracks from the playlist. This action cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
