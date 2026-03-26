import { useRef, useCallback } from 'react';

/**
 * Tracks pointer position and modifier keys during drag operations.
 * 
 * @returns Object containing pointer coordinates and modifier key states
 * 
 * @example
 * ```tsx
 * const { getPosition, getModifiers, startTracking, stopTracking } = usePointerTracker();
 * 
 * // Start tracking on drag start
 * startTracking();
 * 
 * // Get current position during drag
 * const { x, y } = getPosition();
 * 
 * // Get modifier key states
 * const { ctrlKey, shiftKey, altKey } = getModifiers();
 * 
 * // Stop tracking on drag end
 * stopTracking();
 * ```
 */
export function usePointerTracker() {
  const pointerPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modifierKeysRef = useRef<{
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }>({
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  });

  const handlersRef = useRef<{
    pointerMove?: (e: PointerEvent) => void;
    touchMove?: (e: TouchEvent) => void;
    touchStart?: (e: TouchEvent) => void;
    keyChange?: (e: KeyboardEvent) => void;
  }>({});

  /**
   * Start tracking pointer position and modifier keys.
   * Attaches global event listeners to document.
   */
  const startTracking = useCallback(() => {
    const handlePointerMove = (e: PointerEvent) => {
      pointerPositionRef.current = { x: e.clientX, y: e.clientY };
      modifierKeysRef.current = {
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      };
    };

    const handleTouchUpdate = (e: TouchEvent) => {
      const primaryTouch = e.touches[0];
      if (!primaryTouch) return;
      pointerPositionRef.current = {
        x: primaryTouch.clientX,
        y: primaryTouch.clientY,
      };
      // Touch events do not carry modifier keys; reset them to avoid stale state
      modifierKeysRef.current = {
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      };
    };

    const handleKeyChange = (e: KeyboardEvent) => {
      modifierKeysRef.current = {
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      };
    };

    handlersRef.current = {
      pointerMove: handlePointerMove,
      touchMove: handleTouchUpdate,
      touchStart: handleTouchUpdate,
      keyChange: handleKeyChange,
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('touchstart', handleTouchUpdate, { passive: true });
    document.addEventListener('touchmove', handleTouchUpdate, { passive: true });
    document.addEventListener('keydown', handleKeyChange);
    document.addEventListener('keyup', handleKeyChange);
  }, []);

  /**
   * Stop tracking and clean up event listeners.
   */
  const stopTracking = useCallback(() => {
    const { pointerMove, touchMove, touchStart, keyChange } = handlersRef.current;
    
    if (pointerMove) {
      document.removeEventListener('pointermove', pointerMove);
    }
    if (touchStart) {
      document.removeEventListener('touchstart', touchStart);
    }
    if (touchMove) {
      document.removeEventListener('touchmove', touchMove);
    }
    if (keyChange) {
      document.removeEventListener('keydown', keyChange);
      document.removeEventListener('keyup', keyChange);
    }

    handlersRef.current = {};
  }, []);

  /**
   * Get current pointer position.
   */
  const getPosition = useCallback(() => pointerPositionRef.current, []);

  /**
   * Get current modifier key states.
   */
  const getModifiers = useCallback(() => modifierKeysRef.current, []);

  return {
    startTracking,
    stopTracking,
    getPosition,
    getModifiers,
  };
}
