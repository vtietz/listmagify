'use client';

import { useCallback, useRef, useState } from 'react';

import { useDeviceType } from '@/hooks/useDeviceType';

/**
 * Hook to manage context menu state with long-press support.
 */
export function useTrackContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const { isPhone, isTablet } = useDeviceType();

  const open = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e && 'clientX' in e) {
      setPosition({ x: e.clientX, y: e.clientY });
    } else if (e && 'touches' in e && e.touches[0]) {
      setPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setPosition(undefined);
  }, []);

  // Long press handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isPhone && !isTablet) return;

    longPressTimer.current = setTimeout(() => {
      open(e);
    }, 500); // 500ms long press
  }, [isPhone, isTablet, open]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Right-click handler for desktop
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    open(e);
  }, [open]);

  return {
    isOpen,
    position,
    open,
    close,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
      onTouchMove: handleTouchMove,
      onContextMenu: handleContextMenu,
    },
  };
}
