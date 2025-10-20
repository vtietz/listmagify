/**
 * DropIndicator component - Visual line showing where dropped item will land.
 * Positioned using virtualizer items for accurate placement in virtualized lists.
 */

'use client';

import { logDebug } from '@/lib/utils/debug';
import type { VirtualItem } from '@tanstack/react-virtual';

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
  // Don't render if no valid drop index
  if (dropIndicatorIndex === null || dropIndicatorIndex === undefined) {
    return null;
  }

  logDebug('[DropIndicator] Rendering:', {
    panelId,
    dropIndicatorIndex,
    virtualItemsCount: virtualItems.length,
    filteredTracksCount,
  });

  // Find the virtual item at the drop index
  const virtualItem = virtualItems.find(item => item.index === dropIndicatorIndex);

  if (!virtualItem) {
    // Dropping after last visible track
    const lastIndex = filteredTracksCount - 1;
    if (lastIndex >= 0) {
      const lastVirtualItem = virtualItems.find(item => item.index === lastIndex);
      if (lastVirtualItem) {
        const dropY = lastVirtualItem.start + lastVirtualItem.size;
        logDebug('[DropIndicator] After last track at Y:', dropY);
        
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
    }
    
    logDebug('[DropIndicator] Could not render - no virtual items');
    return null;
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
