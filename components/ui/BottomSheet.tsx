/**
 * BottomSheet - Mobile-first overlay component for phones.
 * Slides up from the bottom with swipe-to-close functionality.
 */

'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBottomSheetController } from '@shared/hooks/useBottomSheetController';

interface BottomSheetProps {
  /** Whether the bottom sheet is open */
  isOpen: boolean;
  /** Callback when the sheet should close */
  onClose: () => void;
  /** Title displayed at the top */
  title?: string;
  /** Content to render inside the sheet */
  children: React.ReactNode;
  /** Optional class name for the content container */
  className?: string;
  /** Whether to show the close button */
  showCloseButton?: boolean;
  /** Whether to close on overlay click */
  closeOnOverlayClick?: boolean;
  /** Height preset: 'auto' | 'half' | 'full' */
  height?: 'auto' | 'half' | 'full';
}

const HEIGHT_STYLES = {
  auto: 'max-h-[85vh]',
  half: 'h-[50vh]',
  full: 'h-[85vh]',
} as const;

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  className,
  showCloseButton = true,
  closeOnOverlayClick = true,
  height = 'auto',
}: BottomSheetProps) {
  const {
    sheetRef,
    isVisible,
    transform,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useBottomSheetController({ isOpen, onClose });
  const showHeader = Boolean(title) || showCloseButton;

  return (
    <>
      <BottomSheetOverlay
        isVisible={isVisible}
        closeOnOverlayClick={closeOnOverlayClick}
        onClose={onClose}
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Bottom sheet'}
        className={cn(
          'bottom-sheet',
          HEIGHT_STYLES[height],
          isVisible && 'open'
        )}
        style={{ transform }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        {showHeader ? (
          <BottomSheetHeader
            title={title}
            showCloseButton={showCloseButton}
            onClose={onClose}
          />
        ) : null}
        <div className={cn('bottom-sheet-content', className)}>
          {children}
        </div>
      </div>
    </>
  );
}

function BottomSheetOverlay({
  isVisible,
  closeOnOverlayClick,
  onClose,
}: {
  isVisible: boolean;
  closeOnOverlayClick: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={cn('bottom-sheet-overlay', isVisible && 'open')}
      onClick={closeOnOverlayClick ? onClose : undefined}
      aria-hidden="true"
    />
  );
}

function BottomSheetHeader({
  title,
  showCloseButton,
  onClose,
}: {
  title: string | undefined;
  showCloseButton: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-2">
      {title ? <h2 className="text-lg font-semibold">{title}</h2> : <div />}
      {showCloseButton ? (
        <button
          onClick={onClose}
          className="touch-target flex items-center justify-center rounded-full hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * BottomSheetMenuItem - A menu item for use inside BottomSheet.
 */
interface BottomSheetMenuItemProps {
  /** Icon component to display */
  icon?: React.ComponentType<{ className?: string }>;
  /** Label text */
  label: string;
  /** Description text (optional) */
  description?: string;
  /** Click handler */
  onClick: () => void;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether this is a destructive action */
  destructive?: boolean;
}

export function BottomSheetMenuItem({
  icon: Icon,
  label,
  description,
  onClick,
  disabled = false,
  destructive = false,
}: BottomSheetMenuItemProps) {
  return (
    <button
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors',
        'touch-target min-h-[48px]',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-muted active:bg-muted/80',
        destructive && !disabled && 'text-destructive hover:bg-destructive/10'
      )}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {Icon && (
        <Icon className={cn('h-5 w-5 flex-shrink-0', destructive && 'text-destructive')} />
      )}
      <div className="flex-1 min-w-0">
        <div className={cn('font-medium', destructive && 'text-destructive')}>
          {label}
        </div>
        {description && (
          <div className="text-sm text-muted-foreground truncate">
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * BottomSheetDivider - Visual separator between menu sections.
 */
export function BottomSheetDivider() {
  return <div className="h-px bg-border my-2" />;
}

/**
 * BottomSheetSection - Group related menu items with an optional title.
 */
interface BottomSheetSectionProps {
  title?: string;
  children: React.ReactNode;
}

export function BottomSheetSection({ title, children }: BottomSheetSectionProps) {
  return (
    <div className="py-1">
      {title && (
        <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
