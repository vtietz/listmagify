/**
 * Hook for restoring scroll position after data updates or structural changes.
 */

'use client';

import { useEffect, useRef } from 'react';

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
  // Track if we've done initial restoration
  const hasRestoredRef = useRef(false);
  const lastDataUpdatedAtRef = useRef(dataUpdatedAt);
  
  useEffect(() => {
    if (
      scrollRef.current &&
      typeof targetScrollOffset === 'number' &&
      targetScrollOffset > 0
    ) {
      // Restore scroll if:
      // 1. We haven't restored yet (initial mount with saved position)
      // 2. Or data was updated (dataUpdatedAt changed)
      const shouldRestore = !hasRestoredRef.current || lastDataUpdatedAtRef.current !== dataUpdatedAt;
      
      if (shouldRestore) {
        hasRestoredRef.current = true;
        lastDataUpdatedAtRef.current = dataUpdatedAt;
        
        // Use requestAnimationFrame to ensure DOM has updated
        const rafId = requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = targetScrollOffset;
          }
        });
        return () => cancelAnimationFrame(rafId);
      }
    }
  }, [dataUpdatedAt, targetScrollOffset, scrollRef]);
  
  // Reset hasRestored when targetScrollOffset becomes 0 or undefined
  // This allows restoration to work again if the panel loads a new playlist
  useEffect(() => {
    if (!targetScrollOffset || targetScrollOffset === 0) {
      hasRestoredRef.current = false;
    }
  }, [targetScrollOffset]);
}
