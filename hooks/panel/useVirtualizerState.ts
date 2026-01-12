/**
 * Hook for virtualized track list state and management.
 * Uses ref-based scroll element to avoid option churn.
 */

'use client';

import { useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import {
  TRACK_ROW_HEIGHT,
  TRACK_ROW_HEIGHT_COMPACT,
  VIRTUALIZATION_OVERSCAN,
} from '@/components/split-editor/constants';
import { buildContextItems } from './panelUtils';
import type { Track } from '@/lib/spotify/types';

export function useVirtualizerState(
  filteredTracks: Track[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
  panelId: string
) {
  const isCompact = useHydratedCompactMode();
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
  const deferredCount = useDeferredValue(filteredTracks.length);

  const virtualizer = useVirtualizer({
    count: deferredCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: VIRTUALIZATION_OVERSCAN,
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const prevCompactRef = useRef(isCompact);

  // Re-measure when compact mode changes
  useEffect(() => {
    if (prevCompactRef.current !== isCompact) {
      prevCompactRef.current = isCompact;
      const timeoutId = setTimeout(() => virtualizerRef.current.measure(), 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isCompact]);

  // Note: getVirtualItems() must be called during render (not memoized with stable deps)
  const items = virtualizer.getVirtualItems();

  // Build context items for DnD operations
  const contextItems = useMemo(
    () => buildContextItems(filteredTracks, panelId),
    [filteredTracks, panelId]
  );

  return {
    virtualizer,
    virtualizerRef,
    items,
    contextItems,
    rowHeight,
    isCompact,
  };
}
