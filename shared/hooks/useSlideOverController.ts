import { useEffect, useMemo, useRef, type CSSProperties } from 'react';

type Side = 'left' | 'right';

type UseSlideOverControllerInput = {
  isOpen: boolean;
  side: Side;
  onClose: () => void;
};

const SIDE_POSITION_MAP: Record<Side, (isOpen: boolean) => CSSProperties> = {
  left: (open) => ({ left: open ? '0' : '-100%', right: 'auto' }),
  right: (open) => ({ right: open ? '0' : '-100%', left: 'auto' }),
};

export function useSlideOverController({ isOpen, side, onClose }: UseSlideOverControllerInput) {
  const panelRef = useRef<HTMLDivElement>(null);

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
    if (!isOpen || !panelRef.current) {
      return;
    }

    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    focusable[0]?.focus();
  }, [isOpen]);

  const positionStyles = useMemo(() => SIDE_POSITION_MAP[side](isOpen), [isOpen, side]);

  return {
    panelRef,
    positionStyles,
  };
}
