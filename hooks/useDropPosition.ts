import type { Virtualizer } from '@tanstack/react-virtual';
import type { Track } from '@/lib/spotify/types';
import type { RefObject } from 'react';
import { computeDropIntent } from './dnd/dropIntent';

/**
 * Result of drop position calculation.
 */
export interface DropPositionResult {
  /** Index in the filtered/visible track list where drop will occur */
  filteredIndex: number;
  /** Global position in the full playlist (accounting for track.position) */
  globalPosition: number;
}

/**
 * Calculates where a dragged item should be dropped based on pointer position.
 * 
 * @param scrollContainerRef - Ref to the scrollable container
 * @param virtualizer - TanStack Virtual virtualizer instance
 * @param filteredTracks - Currently visible/filtered tracks
 * @param pointerY - Current Y position of the pointer (client coordinates)
 * @param headerOffset - Height of any fixed content (like TableHeader) before the virtualized list
 * @param draggedTrackPositions - Global positions of tracks being dragged (to exclude from targeting)
 * @param dragCount - Number of tracks being dragged (affects overlay height calculation)
 * @returns Drop position data or null if calculation fails
 * 
 * @example
 * ```tsx
 * const dropData = calculateDropPosition(
 *   scrollRef,
 *   virtualizer,
 *   filteredTracks,
 *   pointerY,
 *   40, // header height
 *   [4, 5, 6], // dragged track positions
 *   3 // drag count
 * );
 * 
 * if (dropData) {
 *   console.log(`Drop at filtered index ${dropData.filteredIndex}`);
 *   console.log(`Global playlist position ${dropData.globalPosition}`);
 * }
 * ```
 */
export function calculateDropPosition(
  scrollContainer: HTMLElement,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  filteredTracks: Track[],
  pointerY: number,
  headerOffset: number = 0,
  draggedTrackPositions: number[] = [],
  dragCount: number = 1
): DropPositionResult | null {
  const containerRect = scrollContainer.getBoundingClientRect();
  const scrollTop = scrollContainer.scrollTop;
  const virtualItems = virtualizer.getVirtualItems();
  const rowHeight = virtualItems.length > 0 && virtualItems[0] ? virtualItems[0].size : 48;

  const intent = computeDropIntent({
    pointerY,
    headerOffset,
    containerTop: containerRect.top,
    scrollTop,
    rowHeight,
    virtualItems,
    filteredTracks,
    draggedTrackPositions,
    dragCount,
  });

  return {
    filteredIndex: intent.insertionIndexFiltered,
    globalPosition: intent.insertBeforeGlobal,
  };
}

/**
 * Hook version that returns a function to calculate drop position.
 * 
 * @param scrollContainerRef - Ref to the scrollable container
 * @param virtualizer - TanStack Virtual virtualizer instance
 * @param filteredTracks - Currently visible/filtered tracks
 * @returns Function to calculate drop position from pointer Y
 * 
 * @example
 * ```tsx
 * const scrollRef = useRef<HTMLDivElement>(null);
 * const calculateDrop = useDropPosition(scrollRef, virtualizer, filteredTracks);
 * 
 * // In drag over handler
 * const { y } = pointerTracker.getPosition();
 * const dropData = calculateDrop(y, draggedPositions, dragCount);
 * ```
 */
export function useDropPosition(
  scrollContainerRef: RefObject<HTMLElement>,
  virtualizer: Virtualizer<HTMLDivElement, Element> | null,
  filteredTracks: Track[]
) {
  return (
    pointerY: number,
    draggedTrackPositions: number[] = [],
    dragCount: number = 1
  ): DropPositionResult | null => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !virtualizer) return null;

    return calculateDropPosition(
      scrollContainer,
      virtualizer,
      filteredTracks,
      pointerY,
      0,
      draggedTrackPositions,
      dragCount
    );
  };
}
