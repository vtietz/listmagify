/**
 * Hook for persisting scroll position to store on scroll events.
 * Uses RAF + time-based throttling to minimize store updates.
 */

'use client';

import { useEffect, useRef } from 'react';

/** Minimum ms between store updates to avoid excessive writes */
const THROTTLE_MS = 150;

interface UseScrollPersistenceOptions {
  panelId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  setScroll: (panelId: string, scrollTop: number) => void;
}

export function useScrollPersistence({
  panelId,
  scrollRef,
  setScroll,
}: UseScrollPersistenceOptions) {
  const rafRef = useRef<number | null>(null);
  const lastValueRef = useRef(0);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      lastValueRef.current = el.scrollTop;
      
      // Schedule RAF-batched update if not already pending
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          
          // Time-based throttle: skip if we wrote recently
          const now = performance.now();
          if (now - lastWriteRef.current < THROTTLE_MS) return;
          
          lastWriteRef.current = now;
          // DISABLED: Causes scroll jumps during heavy scrolling
          // setScroll(panelId, lastValueRef.current);
        });
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [panelId, setScroll, scrollRef]);
}
