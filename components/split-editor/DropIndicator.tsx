/**
 * DropIndicator component - Visual line showing where dropped item will land.
 * Positioned using virtualizer items for accurate placement in virtualized lists.
 */

'use client';

import { logDebug } from '@/lib/utils/debug';
import type { VirtualItem } from '@tanstack/react-virtual';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from './constants';

interface DropIndicatorProps {
  /** Panel ID for debug logging */
  panelId: string;
  /** Filtered index where drop will occur */
  dropIndicatorIndex: number | null | undefined;
  /** Virtual items from virtualizer.getVirtualItems() */
  virtualItems: VirtualItem[];
  /** Total filtered tracks count */
  filteredTracksCount: number;
}

/**
 * Renders a blue line indicator showing drop position in a virtualized list.
 * 
 * Handles two cases:
 * 1. Drop at specific index: Line appears at the start of that virtual item
 * 2. Drop after last item: Line appears after the last visible item
 * 
 * @example
 * ```tsx
 * <DropIndicator
 *   panelId={panelId}
 *   dropIndicatorIndex={dropIndicatorIndex}
 *   virtualItems={virtualizer.getVirtualItems()}
 *   filteredTracksCount={filteredTracks.length}
 * />
 * ```
 */
export function DropIndicator({
  panelId,
  dropIndicatorIndex,
  virtualItems,
  filteredTracksCount,
}: DropIndicatorProps) {
  const isCompact = useHydratedCompactMode();
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;

  // Don't render if no valid drop index
  if (dropIndicatorIndex === null || dropIndicatorIndex === undefined) {
    return null;
  }

  logDebug('[DropIndicator] Rendering:', {
    panelId,
    dropIndicatorIndex,
    virtualItemsCount: virtualItems.length,
    filteredTracksCount,
    rowHeight,
  });

  // Find the virtual item at the drop index
  const virtualItem = virtualItems.find(item => item.index === dropIndicatorIndex);

  if (!virtualItem) {
    // Dropping after the last track.
    // Use the absolute content end based on current row height to work even if
    // the last row is not currently virtualized (e.g., due to extra bottom padding).
    const dropY = Math.max(0, filteredTracksCount * rowHeight);
    logDebug('[DropIndicator] After last track at absolute end Y:', dropY);

    return (
      <div
        data-drop-indicator="after-last"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '4px',
          backgroundColor: '#3b82f6',
          transform: `translateY(${dropY}px)`,
          zIndex: 40,
          pointerEvents: 'none',
          boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
        }}
      />
    );
  }

  logDebug('[DropIndicator] At virtual item:', {
    index: virtualItem.index,
    start: virtualItem.start,
  });

  return (
    <div
      data-drop-indicator="at-index"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '4px',
        backgroundColor: '#3b82f6',
        transform: `translateY(${virtualItem.start}px)`,
        zIndex: 40,
        pointerEvents: 'none',
        boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
      }}
    />
  );
}
