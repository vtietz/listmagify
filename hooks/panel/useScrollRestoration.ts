/**
 * Hook for restoring scroll position after data updates.
 */

'use client';

import { useEffect } from 'react';

interface UseScrollRestorationOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  targetScrollOffset: number | undefined;
  dataUpdatedAt: number;
}

export function useScrollRestoration({
  scrollRef,
  targetScrollOffset,
  dataUpdatedAt,
}: UseScrollRestorationOptions) {
  useEffect(() => {
    if (
      scrollRef.current &&
      typeof targetScrollOffset === 'number' &&
      targetScrollOffset > 0
    ) {
      // Use requestAnimationFrame to ensure DOM has updated after data change
      const rafId = requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = targetScrollOffset;
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [dataUpdatedAt, targetScrollOffset, scrollRef]);
}
