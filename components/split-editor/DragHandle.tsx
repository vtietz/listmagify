/**
 * DragHandle - Touch-only drag anchor for mobile/tablet devices.
 * 
 * This component provides a dedicated drag handle that:
 * - Is only visible on touch devices (hidden on desktop)
 * - Disables mouse click behavior (handle acts solely as drag anchor)
 * - Provides visual feedback on touch
 * - Meets accessibility touch target requirements (44x44px minimum)
 */

'use client';

import * as React from 'react';
import { useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeviceType } from '@/hooks/useDeviceType';

interface DragHandleProps {
  /** Whether dragging is disabled for this row */
  disabled?: boolean;
  /** Sortable listeners from @dnd-kit (onPointerDown, etc.) */
  listeners?: Record<string, (event: React.SyntheticEvent) => void>;
  /** Whether the row is currently being dragged */
  isDragging?: boolean;
  /** Whether compact mode is enabled */
  isCompact?: boolean;
  /** Custom class name */
  className?: string;
}

export function DragHandle({
  disabled = false,
  listeners,
  isDragging = false,
  isCompact = false,
  className,
}: DragHandleProps) {
  const { hasTouch, isDesktop } = useDeviceType();

  // Block mouse clicks - handle only responds to pointer drag
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  // Don't render on desktop
  if (isDesktop && !hasTouch) {
    return null;
  }

  // Filter listeners to only pass touch/pointer events, not click
  const dragListeners = listeners ? {
    onPointerDown: listeners.onPointerDown,
    onKeyDown: listeners.onKeyDown,
  } : {};

  return (
    <div
      className={cn(
        'drag-handle',
        'flex items-center justify-center',
        'touch-action-none select-none',
        isCompact ? 'w-6 h-6' : 'w-8 h-8',
        // Ensure minimum touch target
        'min-w-[44px] min-h-[44px]',
        // Visual states
        disabled && 'opacity-30 cursor-not-allowed',
        !disabled && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-70',
        // Touch feedback
        !disabled && 'active:bg-accent/50 rounded',
        // Transition for smooth visual feedback
        'transition-colors duration-100',
        className
      )}
      onClick={handleClick}
      onMouseDown={handleClick}
      role="button"
      aria-label={disabled ? 'Drag disabled' : 'Drag to reorder'}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      {...(!disabled ? dragListeners : {})}
    >
      <GripVertical
        className={cn(
          'text-muted-foreground',
          isCompact ? 'h-4 w-4' : 'h-5 w-5',
          !disabled && 'group-hover/row:text-foreground'
        )}
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Hook to manage drag handle visibility and behavior.
 */
export function useDragHandle() {
  const { hasTouch, isDesktop } = useDeviceType();
  
  return {
    /** Whether to show the drag handle */
    showHandle: hasTouch || !isDesktop,
    /** Whether drag handle is the only way to drag (true on touch devices) */
    handleOnlyDrag: hasTouch,
  };
}
