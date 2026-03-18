import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';

type UseBottomSheetControllerInput = {
  isOpen: boolean;
  onClose: () => void;
};

const CLOSE_THRESHOLD = 100;
const CLOSE_ANIMATION_MS = 200;

export function useBottomSheetController({ isOpen, onClose }: UseBottomSheetControllerInput) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    setTouchStart(e.touches[0]?.clientY ?? null);
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (touchStart === null) {
        return;
      }

      const currentY = e.touches[0]?.clientY ?? 0;
      const delta = currentY - touchStart;
      if (delta <= 0) {
        return;
      }

      setTouchDelta(delta);
    },
    [touchStart]
  );

  const resetTouch = useCallback(() => {
    setTouchDelta(0);
    setTouchStart(null);
  }, []);

  const handleAnimatedClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      resetTouch();
    }, CLOSE_ANIMATION_MS);
  }, [onClose, resetTouch]);

  const handleTouchEnd = useCallback(() => {
    if (touchDelta > CLOSE_THRESHOLD) {
      handleAnimatedClose();
      return;
    }

    resetTouch();
  }, [handleAnimatedClose, resetTouch, touchDelta]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isOpen) {
        return;
      }

      onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !sheetRef.current) {
      return;
    }

    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    focusable[0]?.focus();
  }, [isOpen]);

  const isVisible = isOpen && !isClosing;
  const transform = isOpen && touchDelta > 0 ? `translateY(${isClosing ? '100%' : `${touchDelta}px`})` : undefined;

  return {
    sheetRef,
    isClosing,
    touchDelta,
    isVisible,
    transform,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
