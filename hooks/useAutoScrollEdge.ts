import { RefObject } from 'react';

/**
 * Configuration for auto-scroll behavior.
 */
export interface AutoScrollConfig {
  /** Distance from edge (in pixels) that triggers scrolling. Default: 80 */
  threshold?: number;
  /** Scroll speed in pixels per frame. Default: 10 */
  speed?: number;
}

/**
 * Auto-scrolls a container when pointer is near its edges.
 * 
 * @param scrollContainerRef - Ref to the scrollable container element
 * @param pointerY - Current Y position of the pointer
 * @param config - Optional configuration for threshold and speed
 * 
 * @example
 * ```tsx
 * const scrollRef = useRef<HTMLDivElement>(null);
 * const { x, y } = pointerTracker.getPosition();
 * 
 * // Call on every drag move
 * useAutoScrollEdge(scrollRef, y);
 * ```
 */
export function autoScrollEdge(
  scrollContainer: HTMLElement,
  pointerY: number,
  config: AutoScrollConfig = {}
): void {
  const { threshold = 80, speed = 10 } = config;

  const rect = scrollContainer.getBoundingClientRect();
  const distanceFromTop = pointerY - rect.top;
  const distanceFromBottom = rect.bottom - pointerY;

  if (distanceFromTop < threshold && distanceFromTop > 0) {
    // Near top edge - scroll up
    scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - speed);
  } else if (distanceFromBottom < threshold && distanceFromBottom > 0) {
    // Near bottom edge - scroll down
    scrollContainer.scrollTop = Math.min(
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
      scrollContainer.scrollTop + speed
    );
  }
}

/**
 * Hook version that takes a ref and returns a function to trigger auto-scroll.
 * 
 * @param scrollContainerRef - Ref to the scrollable container
 * @param config - Optional configuration for threshold and speed
 * @returns Function to trigger auto-scroll with current pointer Y position
 * 
 * @example
 * ```tsx
 * const scrollRef = useRef<HTMLDivElement>(null);
 * const triggerAutoScroll = useAutoScrollEdge(scrollRef);
 * 
 * // In drag over handler
 * const { y } = pointerTracker.getPosition();
 * triggerAutoScroll(y);
 * ```
 */
export function useAutoScrollEdge(
  scrollContainerRef: RefObject<HTMLElement>,
  config: AutoScrollConfig = {}
) {
  return (pointerY: number) => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    autoScrollEdge(scrollContainer, pointerY, config);
  };
}
