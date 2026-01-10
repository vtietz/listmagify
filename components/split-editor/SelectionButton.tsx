/**
 * Selection button component for PanelToolbar.
 */

'use client';

import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Selection actions button */
export function SelectionButton({
  selectionCount,
  onClick,
  buttonRef,
}: {
  selectionCount: number;
  onClick: (e: React.MouseEvent) => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={selectionCount === 0}
      className={cn(
        "h-8 px-2 shrink-0 gap-1",
        selectionCount > 0 ? "text-foreground hover:text-foreground" : "text-muted-foreground"
      )}
      title={selectionCount > 0 
        ? `${selectionCount} track${selectionCount > 1 ? 's' : ''} selected - click for actions`
        : 'No tracks selected'
      }
    >
      <ListChecks className="h-4 w-4" />
      {selectionCount > 1 && (
        <span className="text-xs font-medium bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
          {selectionCount}
        </span>
      )}
    </Button>
  );
}
