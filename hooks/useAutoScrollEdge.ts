import { RefObject, useRef, useCallback } from 'react';

/**
 * Configuration for auto-scroll behavior.
 */
export interface AutoScrollConfig {
  /** Distance from edge (in pixels) that triggers scrolling. Default: 80 */
  threshold?: number;
  /** Maximum scroll speed in pixels per frame. Default: 15 */
  maxSpeed?: number;
  /** Minimum scroll speed in pixels per frame. Default: 2 */
  minSpeed?: number;
}

/**
 * Calculate scroll speed based on distance from edge.
 * Speed increases as pointer gets closer to the edge (eased acceleration).
 */
function calculateScrollSpeed(
  distanceFromEdge: number,
  threshold: number,
  minSpeed: number,
  maxSpeed: number
): number {
  // Normalize distance to 0-1 range (0 = at edge, 1 = at threshold)
  const normalizedDistance = Math.max(0, Math.min(1, distanceFromEdge / threshold));
  // Use ease-in curve: faster when closer to edge
  const easedFactor = 1 - normalizedDistance * normalizedDistance;
  // Map to speed range
  return minSpeed + (maxSpeed - minSpeed) * easedFactor;
}

/**
 * Auto-scrolls a container when pointer is near its edges.
 * Uses progressive speed - faster when closer to the edge.
 * 
 * @param scrollContainer - The scrollable container element
 * @param pointerY - Current Y position of the pointer
 * @param config - Optional configuration for threshold and speed
 * @returns Whether scrolling occurred
 * 
 * @example
 * ```tsx
 * const scrollRef = useRef<HTMLDivElement>(null);
 * const { x, y } = pointerTracker.getPosition();
 * 
 * // Call on every drag move
 * autoScrollEdge(scrollRef.current, y);
 * ```
 */
export function autoScrollEdge(
  scrollContainer: HTMLElement,
  pointerY: number,
  config: AutoScrollConfig = {}
): boolean {
  const { threshold = 80, maxSpeed = 15, minSpeed = 2 } = config;

  const rect = scrollContainer.getBoundingClientRect();
  const distanceFromTop = pointerY - rect.top;
  const distanceFromBottom = rect.bottom - pointerY;

  if (distanceFromTop < threshold && distanceFromTop > 0) {
    // Near top edge - scroll up with progressive speed
    const speed = calculateScrollSpeed(distanceFromTop, threshold, minSpeed, maxSpeed);
    scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - speed);
    return true;
  } else if (distanceFromBottom < threshold && distanceFromBottom > 0) {
    // Near bottom edge - scroll down with progressive speed
    const speed = calculateScrollSpeed(distanceFromBottom, threshold, minSpeed, maxSpeed);
    scrollContainer.scrollTop = Math.min(
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
      scrollContainer.scrollTop + speed
    );
    return true;
  }
  
  return false;
}

/**
 * State for the continuous auto-scroll loop
 */
interface AutoScrollLoopState {
  animationFrameId: number | null;
  isRunning: boolean;
  getPointerPosition: (() => { x: number; y: number }) | null;
  getPanelContainers: (() => Map<string, { scrollRef: { current: HTMLElement | null } }>) | null;
  config: AutoScrollConfig;
}

/**
 * Creates a continuous auto-scroll controller that runs during drag operations.
 * This uses requestAnimationFrame to continuously check pointer position and scroll
 * panels when the pointer is near their edges, even when the pointer is stationary.
 * 
 * @returns Controller object with start/stop methods
 * 
 * @example
 * ```tsx
 * const autoScroller = createAutoScrollLoop();
 * 
 * // Start on drag start
 * autoScroller.start(
 *   () => pointerTracker.getPosition(),
 *   () => panelVirtualizersRef.current
 * );
 * 
 * // Stop on drag end
 * autoScroller.stop();
 * ```
 */
export function createAutoScrollLoop(config: AutoScrollConfig = {}) {
  const state: AutoScrollLoopState = {
    animationFrameId: null,
    isRunning: false,
    getPointerPosition: null,
    getPanelContainers: null,
    config,
  };

  const tick = () => {
    if (!state.isRunning || !state.getPointerPosition || !state.getPanelContainers) {
      return;
    }

    const { x: pointerX, y: pointerY } = state.getPointerPosition();
    const panelContainers = state.getPanelContainers();

    // Find the panel that contains the pointer and scroll it if near edge
    for (const [, panelData] of panelContainers.entries()) {
      const scrollContainer = panelData.scrollRef.current;
      if (!scrollContainer) continue;

      const rect = scrollContainer.getBoundingClientRect();
      
      // Check if pointer is within this panel's horizontal bounds
      if (pointerX >= rect.left && pointerX <= rect.right &&
          pointerY >= rect.top - 50 && pointerY <= rect.bottom + 50) {
        // Pointer is in this panel's column - check for edge scrolling
        autoScrollEdge(scrollContainer, pointerY, state.config);
      }
    }

    // Schedule next frame
    state.animationFrameId = requestAnimationFrame(tick);
  };

  return {
    /**
     * Start the continuous auto-scroll loop.
     * @param getPointerPosition - Function that returns current pointer position
     * @param getPanelContainers - Function that returns map of panel data with scroll refs
     */
    start(
      getPointerPosition: () => { x: number; y: number },
      getPanelContainers: () => Map<string, { scrollRef: { current: HTMLElement | null } }>
    ) {
      if (state.isRunning) return;
      
      state.isRunning = true;
      state.getPointerPosition = getPointerPosition;
      state.getPanelContainers = getPanelContainers;
      state.animationFrameId = requestAnimationFrame(tick);
    },

    /**
     * Stop the continuous auto-scroll loop.
     */
    stop() {
      state.isRunning = false;
      state.getPointerPosition = null;
      state.getPanelContainers = null;
      
      if (state.animationFrameId !== null) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
      }
    },

    /**
     * Check if the loop is currently running.
     */
    isRunning() {
      return state.isRunning;
    },
  };
}

/**
 * Hook that creates a continuous auto-scroll controller for drag operations.
 * The controller continuously monitors pointer position and scrolls panels
 * when the pointer is near their edges.
 * 
 * @param config - Optional configuration for threshold and speed
 * @returns Controller with start/stop methods
 * 
 * @example
 * ```tsx
 * const autoScroller = useContinuousAutoScroll();
 * 
 * const onDragStart = () => {
 *   autoScroller.start(
 *     () => pointerTracker.getPosition(),
 *     () => panelVirtualizersRef.current
 *   );
 * };
 * 
 * const onDragEnd = () => {
 *   autoScroller.stop();
 * };
 * ```
 */
export function useContinuousAutoScroll(config: AutoScrollConfig = {}) {
  const controllerRef = useRef<ReturnType<typeof createAutoScrollLoop> | null>(null);

  // Lazily create controller
  if (controllerRef.current == null) {
    controllerRef.current = createAutoScrollLoop(config);
  }

  const start = useCallback((
    getPointerPosition: () => { x: number; y: number },
    getPanelContainers: () => Map<string, { scrollRef: { current: HTMLElement | null } }>
  ) => {
    controllerRef.current?.start(getPointerPosition, getPanelContainers);
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.stop();
  }, []);

  return { start, stop };
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
