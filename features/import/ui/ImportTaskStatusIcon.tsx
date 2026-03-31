'use client';

import { Check, X, Loader2, AlertTriangle, Minus, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImportPlaylistStatus } from '@/lib/import/types';

interface ImportTaskStatusIconProps {
  status: ImportPlaylistStatus | null | undefined;
  className?: string;
  onClick?: (() => void) | undefined;
}

export function ImportTaskStatusIcon({ status, className, onClick }: ImportTaskStatusIconProps) {
  const Wrapper = onClick ? 'button' : 'span';
  const wrapperProps = onClick
    ? { type: 'button' as const, onClick, title: statusTitle(status) }
    : { title: statusTitle(status) };

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'inline-flex items-center justify-center rounded-full h-6 w-6 shrink-0',
        onClick && 'hover:bg-muted/50 transition-colors cursor-pointer',
        statusBgClass(status),
        className,
      )}
    >
      {statusIcon(status)}
    </Wrapper>
  );
}

function statusBgClass(status: ImportPlaylistStatus | null | undefined): string {
  if (!status) return 'bg-muted/30';
  switch (status) {
    case 'done':
      return 'bg-green-500/10';
    case 'partial':
      return 'bg-yellow-500/10';
    case 'failed':
      return 'bg-red-500/10';
    case 'creating':
    case 'resolving_tracks':
    case 'adding_tracks':
      return 'bg-blue-500/10';
    case 'queued':
    case 'cancelled':
      return 'bg-muted/30';
    default:
      return 'bg-muted/30';
  }
}

function statusIcon(status: ImportPlaylistStatus | null | undefined) {
  if (!status) return <Minus className="h-3 w-3 text-muted-foreground" />;
  switch (status) {
    case 'done':
      return <Check className="h-3 w-3 text-green-500" />;
    case 'partial':
      return <AlertTriangle className="h-3 w-3 text-yellow-500" />;
    case 'failed':
      return <X className="h-3 w-3 text-red-500" />;
    case 'creating':
    case 'resolving_tracks':
    case 'adding_tracks':
      return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />;
    case 'queued':
      return <Minus className="h-3 w-3 text-muted-foreground" />;
    case 'cancelled':
      return <Ban className="h-3 w-3 text-muted-foreground" />;
    default:
      return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
}

function statusTitle(status: ImportPlaylistStatus | null | undefined): string {
  if (!status) return 'Unknown';
  switch (status) {
    case 'done':
      return 'Import completed';
    case 'partial':
      return 'Partially imported — some tracks unresolved';
    case 'failed':
      return 'Import failed';
    case 'creating':
      return 'Creating playlist...';
    case 'resolving_tracks':
      return 'Resolving tracks...';
    case 'adding_tracks':
      return 'Adding tracks...';
    case 'queued':
      return 'Queued';
    case 'cancelled':
      return 'Cancelled';
    default:
      return '';
  }
}
