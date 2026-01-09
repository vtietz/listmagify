/**
 * useLongPress hook - Detects long press (touch and hold) gestures.
 * Used for mobile multi-select functionality.
 */

import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  /** Duration in ms to trigger long press (default: 500ms) */
  delay?: number;
  /** Callback when long press is detected */
  onLongPress: () => void;
  /** Optional callback for regular click (short press) */
  onClick?: () => void;
  /** Whether long press is disabled */
  disabled?: boolean;
}

interface LongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  /** Returns true if a long press was recently triggered (use to prevent context menu) */
  wasLongPress: () => boolean;
  /** Reset the long press flag */
  resetLongPress: () => void;
}

export function useLongPress({
  delay = 500,
  onLongPress,
  onClick,
  disabled = false,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      
      isLongPressRef.current = false;
      const touch = e.touches[0];
      if (!touch) return;
      startPosRef.current = { x: touch.clientX, y: touch.clientY };

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onLongPress();
        // Provide haptic feedback if available
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }, delay);
    },
    [delay, onLongPress, disabled]
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      if (disabled) return;
      
      clear();
      
      // If it wasn't a long press, treat as click
      if (!isLongPressRef.current && onClick) {
        onClick();
      }
      
      isLongPressRef.current = false;
      startPosRef.current = null;
    },
    [clear, onClick, disabled]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !startPosRef.current) return;
      
      // Cancel if finger moved too far (prevents long press during scroll)
      const touch = e.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - startPosRef.current.x);
      const dy = Math.abs(touch.clientY - startPosRef.current.y);
      
      if (dx > 10 || dy > 10) {
        clear();
        startPosRef.current = null;
      }
    },
    [clear, disabled]
  );

  const onTouchCancel = useCallback(() => {
    clear();
    isLongPressRef.current = false;
    startPosRef.current = null;
  }, [clear]);

  // Check if long press was triggered (for preventing context menu)
  const wasLongPress = useCallback(() => isLongPressRef.current, []);
  
  // Reset long press flag
  const resetLongPress = useCallback(() => {
    isLongPressRef.current = false;
  }, []);

  return {
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onTouchCancel,
    wasLongPress,
    resetLongPress,
  };
}
