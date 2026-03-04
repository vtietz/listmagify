/**
 * DropIndicator component - Visual line showing where dropped item will land.
 * Positioned using virtualizer items for accurate placement in virtualized lists.
 */

'use client';

import { logDebug } from '@/lib/utils/debug';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useDndStateStore } from '@/hooks/dnd';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from './constants';

interface DropIndicatorProps {
  /** Panel ID for debug logging */
  panelId: string;
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
 *   filteredTracksCount={filteredTracks.length}
 * />
 * ```
 */
export function DropIndicator({
  panelId,
  filteredTracksCount,
}: DropIndicatorProps) {
  const isCompact = useHydratedCompactMode();
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
  const dropIndicatorIndex = useDndStateStore((state) =>
    state.activePanelId === panelId ? state.dropIndicatorIndex : null
  );

  // Don't render if no valid drop index
  if (dropIndicatorIndex === null || dropIndicatorIndex === undefined) {
    return null;
  }

  logDebug('[DropIndicator] Rendering:', {
    panelId,
    dropIndicatorIndex,
    filteredTracksCount,
    rowHeight,
  });

  // Compute absolute Y directly from index and row height to avoid stale virtual item snapshots
  const clampedIndex = Math.max(0, Math.min(dropIndicatorIndex, filteredTracksCount));
  const dropY = clampedIndex * rowHeight;
  const indicatorType = clampedIndex >= filteredTracksCount ? 'after-last' : 'at-index';

  logDebug('[DropIndicator] Computed position:', {
    index: clampedIndex,
    dropY,
    indicatorType,
  });

  return (
    <div
      data-drop-indicator={indicatorType}
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
