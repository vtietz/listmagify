/**
 * useTapHandler hook - Distinguishes between taps and scroll gestures on mobile.
 * Only triggers the callback if the touch was a real tap (minimal movement).
 */

import { useCallback, useRef } from 'react';

interface UseTapHandlerOptions {
  /** Callback to trigger on valid tap */
  onTap: () => void;
  /** Maximum movement distance in pixels to still count as a tap (default: 10px) */
  movementThreshold?: number;
  /** Whether to preventDefault on tap to block ghost clicks (default: true) */
  preventDefaultOnTap?: boolean;
}

interface TapHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
}

/**
 * Returns touch event handlers that detect taps vs scrolls.
 * Only triggers onTap if the touch hasn't moved more than movementThreshold pixels.
 */
export function useTapHandler({
  onTap,
  movementThreshold = 10,
  preventDefaultOnTap = true,
}: UseTapHandlerOptions): TapHandlers {
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isValidTapRef = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      isValidTapRef.current = true;
    },
    []
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPosRef.current || !isValidTapRef.current) return;
      
      const touch = e.touches[0];
      if (!touch) return;
      
      const dx = Math.abs(touch.clientX - startPosRef.current.x);
      const dy = Math.abs(touch.clientY - startPosRef.current.y);
      
      // If movement exceeds threshold, this is not a tap
      if (dx > movementThreshold || dy > movementThreshold) {
        isValidTapRef.current = false;
      }
    },
    [movementThreshold]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // Only prevent default/stop propagation for actual taps
      // If scroll already started (isValidTapRef.current = false), let it through
      if (isValidTapRef.current) {
        if (preventDefaultOnTap) {
          e.stopPropagation();
          e.preventDefault();
        }
        onTap();
      }
      
      // Reset state
      startPosRef.current = null;
      isValidTapRef.current = false;
    },
    [onTap, preventDefaultOnTap]
  );

  const onTouchCancel = useCallback(() => {
    // Reset state on touch cancel
    startPosRef.current = null;
    isValidTapRef.current = false;
  }, []);

  return {
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onTouchCancel,
  };
}
