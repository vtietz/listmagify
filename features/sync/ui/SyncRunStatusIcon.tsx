'use client';

import { Check, X, Loader2, AlertTriangle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncRunStatus } from '@/lib/sync/types';

interface SyncRunStatusIconProps {
  status: SyncRunStatus | null | undefined;
  hasWarnings?: boolean;
  className?: string;
  onClick?: (() => void) | undefined;
}

export function SyncRunStatusIcon({ status, hasWarnings, className, onClick }: SyncRunStatusIconProps) {
  const Wrapper = onClick ? 'button' : 'span';
  const wrapperProps = onClick
    ? { type: 'button' as const, onClick, title: statusTitle(status, hasWarnings) }
    : { title: statusTitle(status, hasWarnings) };

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'inline-flex items-center justify-center rounded-full h-6 w-6 shrink-0',
        onClick && 'hover:bg-muted/50 transition-colors cursor-pointer',
        statusBgClass(status, hasWarnings),
        className,
      )}
    >
      {statusIcon(status, hasWarnings)}
    </Wrapper>
  );
}

function statusBgClass(status: SyncRunStatus | null | undefined, hasWarnings?: boolean): string {
  if (!status) return 'bg-muted/30';
  switch (status) {
    case 'done':
      return hasWarnings ? 'bg-yellow-500/10' : 'bg-green-500/10';
    case 'failed':
      return 'bg-red-500/10';
    case 'executing':
    case 'previewing':
      return 'bg-blue-500/10';
    case 'pending':
      return 'bg-muted/30';
    default:
      return 'bg-muted/30';
  }
}

function statusIcon(status: SyncRunStatus | null | undefined, hasWarnings?: boolean) {
  if (!status) return <Minus className="h-3 w-3 text-muted-foreground" />;
  switch (status) {
    case 'done':
      return hasWarnings
        ? <AlertTriangle className="h-3 w-3 text-yellow-500" />
        : <Check className="h-3 w-3 text-green-500" />;
    case 'failed':
      return <X className="h-3 w-3 text-red-500" />;
    case 'executing':
    case 'previewing':
      return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />;
    case 'pending':
      return <Minus className="h-3 w-3 text-muted-foreground" />;
    default:
      return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
}

function statusTitle(status: SyncRunStatus | null | undefined, hasWarnings?: boolean): string {
  if (!status) return 'No sync runs yet';
  switch (status) {
    case 'done':
      return hasWarnings ? 'Last sync completed with warnings' : 'Last sync completed';
    case 'failed':
      return 'Last sync failed';
    case 'executing':
      return 'Sync in progress';
    case 'previewing':
      return 'Preview in progress';
    case 'pending':
      return 'Sync pending';
    default:
      return '';
  }
}
