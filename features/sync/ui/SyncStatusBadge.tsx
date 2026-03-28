'use client';

import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncRunStatus } from '@/lib/sync/types';

interface SyncStatusBadgeProps {
  status: SyncRunStatus | null | undefined;
  className?: string;
}

export function SyncStatusBadge({ status, className }: SyncStatusBadgeProps) {
  if (!status) {
    return null;
  }

  switch (status) {
    case 'done':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500',
            className,
          )}
        >
          <Check className="h-3 w-3" />
          Done
        </span>
      );

    case 'failed':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500',
            className,
          )}
        >
          <X className="h-3 w-3" />
          Failed
        </span>
      );

    case 'executing':
    case 'previewing':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500',
            className,
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {status === 'executing' ? 'Syncing' : 'Previewing'}
        </span>
      );

    case 'pending':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
            className,
          )}
        >
          Pending
        </span>
      );

    default:
      return null;
  }
}
