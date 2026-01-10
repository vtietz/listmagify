'use client';

import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * ContextMenuTrigger - The "..." button that opens context menu.
 * Touch-friendly with 44x44px minimum target.
 */
export function ContextMenuTrigger({ onClick, isCompact = false }: { onClick: (e: React.MouseEvent) => void; isCompact?: boolean }) {
  return (
    <button
      className={cn(
        'touch-target flex items-center justify-center rounded hover:bg-muted',
        'opacity-0 group-hover/row:opacity-100 focus:opacity-100',
        isCompact ? 'w-6 h-6' : 'w-8 h-8'
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      aria-label="More options"
    >
      <MoreHorizontal className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
    </button>
  );
}
