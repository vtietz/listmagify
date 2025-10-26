import type { Virtualizer } from '@tanstack/react-virtual';
import type { Track } from '@/lib/spotify/types';
import type { RefObject } from 'react';

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
 * @returns Drop position data or null if calculation fails
 * 
 * @example
 * ```tsx
 * const dropData = calculateDropPosition(
 *   scrollRef,
 *   virtualizer,
 *   filteredTracks,
 *   pointerY
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
  pointerY: number
): DropPositionResult | null {
  // Calculate relative Y position within the scrollable container
  const containerRect = scrollContainer.getBoundingClientRect();
  const scrollTop = scrollContainer.scrollTop;
  const relativeY = pointerY - containerRect.top + scrollTop;

  // Use the visual center of the dragged overlay to decide insertion.
  // Approximate by shifting the pointer Y by one row height so the "middle of the hover item"
  // determines whether we insert before/after.
  const virtualItems = virtualizer.getVirtualItems();
  const rowSize = virtualItems.length > 0 && virtualItems[0] ? virtualItems[0].size : 48; // fallback if not yet measured
  const adjustedY = relativeY - rowSize;

  // Find the insertion index in the filtered view
  let insertionIndexFiltered = filteredTracks.length; // Default: append to end

  for (let i = 0; i < virtualItems.length; i++) {
    const item = virtualItems[i];
    if (!item) continue;
    
    const itemMiddle = item.start + item.size / 2;

    // Use overlay center: if it's above the row's middle, insert before this row.
    if (adjustedY < itemMiddle) {
      insertionIndexFiltered = item.index;
      break;
    }
  }

  // Map filtered index to global playlist position
  if (filteredTracks.length === 0) return { filteredIndex: 0, globalPosition: 0 };
  
  if (insertionIndexFiltered >= filteredTracks.length) {
    // Dropping after last visible track
    const lastTrack = filteredTracks[filteredTracks.length - 1];
    const globalPosition = (lastTrack?.position ?? 0) + 1;
    return { filteredIndex: insertionIndexFiltered, globalPosition };
  }

  // Get the global position of the track at the insertion point
  const targetTrack = filteredTracks[insertionIndexFiltered];
  const globalPosition = targetTrack?.position ?? insertionIndexFiltered;
  return { filteredIndex: insertionIndexFiltered, globalPosition };
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
 * const dropData = calculateDrop(y);
 * ```
 */
export function useDropPosition(
  scrollContainerRef: RefObject<HTMLElement>,
  virtualizer: Virtualizer<HTMLDivElement, Element> | null,
  filteredTracks: Track[]
) {
  return (pointerY: number): DropPositionResult | null => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !virtualizer) return null;

    return calculateDropPosition(scrollContainer, virtualizer, filteredTracks, pointerY);
  };
}
