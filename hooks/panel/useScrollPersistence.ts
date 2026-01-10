/**
 * Hook for persisting scroll position to store on scroll events.
 */

'use client';

import { useEffect } from 'react';

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
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => setScroll(panelId, el.scrollTop);
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [panelId, setScroll, scrollRef]);
}
