/**
 * SlideOverPanel - Slide-over pane for tablet devices.
 * Anchored to the side, partial width to preserve context.
 */

'use client';

import * as React from 'react';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeviceType } from '@/hooks/useDeviceType';

interface SlideOverPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Callback when the panel should close */
  onClose: () => void;
  /** Title displayed at the top */
  title?: string;
  /** Content to render inside */
  children: React.ReactNode;
  /** Optional class name */
  className?: string;
  /** Side to anchor the panel */
  side?: 'left' | 'right';
  /** Width preset */
  width?: 'narrow' | 'medium' | 'wide';
  /** Whether to show overlay behind the panel */
  showOverlay?: boolean;
}

const WIDTH_STYLES = {
  narrow: 'w-[280px] max-w-[75vw]',
  medium: 'w-[400px] max-w-[85vw]',
  wide: 'w-[520px] max-w-[90vw]',
} as const;

export function SlideOverPanel({
  isOpen,
  onClose,
  title,
  children,
  className,
  side = 'right',
  width = 'medium',
  showOverlay = true,
}: SlideOverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { isTablet: _isTablet, isPhone } = useDeviceType();

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (isOpen && panelRef.current) {
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0]?.focus();
      }
    }
  }, [isOpen]);

  // On phones, don't render slide-over (use BottomSheet instead)
  if (isPhone) {
    return null;
  }

  const positionStyles = side === 'left'
    ? { left: isOpen ? '0' : '-100%', right: 'auto' }
    : { right: isOpen ? '0' : '-100%', left: 'auto' };

  return (
    <>
      {/* Optional overlay */}
      {showOverlay && (
        <div
          className={cn(
            'fixed inset-0 bg-black/30 z-80 transition-opacity duration-200',
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Slide over panel'}
        className={cn(
          'fixed top-0 bottom-0 z-90 bg-card',
          side === 'left' ? 'border-r' : 'border-l',
          'border-border shadow-xl',
          'transition-all duration-300 ease-in-out',
          WIDTH_STYLES[width],
          className
        )}
        style={positionStyles}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          {title && (
            <h2 className="text-lg font-semibold truncate">{title}</h2>
          )}
          <button
            onClick={onClose}
            className="touch-target flex items-center justify-center rounded-full hover:bg-muted ml-auto"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * Hook to manage slide-over panel state.
 */
export function useSlideOverPanel() {
  const [isOpen, setIsOpen] = React.useState(false);

  const open = React.useCallback(() => setIsOpen(true), []);
  const close = React.useCallback(() => setIsOpen(false), []);
  const toggle = React.useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    open,
    close,
    toggle,
    setIsOpen,
  };
}
