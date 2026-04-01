/**
 * SaveOrderDialog - Confirmation dialog for saving a sorted playlist order.
 *
 * Offers two strategies:
 * - Replace (fast): removes all tracks and re-adds them. Resets "added at" dates.
 * - Preserve dates: uses individual move operations to reorder. Slower but keeps
 *   the original "added at" timestamps intact.
 */

'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SaveOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moveCount: number;
  onReplace: () => void;
  onPreserveDates: () => void;
}

function formatEstimatedTime(moveCount: number): string {
  const totalSeconds = Math.ceil(moveCount * 0.5);
  if (totalSeconds < 60) {
    return `~${totalSeconds}s`;
  }
  const minutes = Math.ceil(totalSeconds / 60);
  return `~${minutes}m`;
}

export function SaveOrderDialog({
  open,
  onOpenChange,
  moveCount,
  onReplace,
  onPreserveDates,
}: SaveOrderDialogProps) {
  const estimatedTime = formatEstimatedTime(moveCount);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save playlist order</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>How would you like to save the new order?</p>
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {moveCount} tracks need to be repositioned. Preserving dates
                uses individual move operations and takes longer (
                {estimatedTime}).
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: 'outline' }))}
            onClick={() => {
              onReplace();
              onOpenChange(false);
            }}
          >
            Replace (fast)
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => {
              onPreserveDates();
              onOpenChange(false);
            }}
          >
            Preserve dates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
