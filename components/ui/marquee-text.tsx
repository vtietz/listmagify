/**
 * MarqueeText component for auto-scrolling overflowed text.
 * 
 * Only scrolls when:
 * 1. Auto-scroll mode is enabled globally
 * 2. The text overflows its container
 * 3. The element is in the viewport (uses IntersectionObserver)
 * 4. The user hovers over the element (desktop) or it's focused
 * 
 * Features smooth, descent scrolling with pause at start/end.
 */

'use client';

import * as React from 'react';
import { useRef, useState, useEffect, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';

interface MarqueeTextProps {
  children: React.ReactNode;
  /** Additional class names for the container */
  className?: string;
  /** Whether auto-scroll is globally enabled */
  isAutoScrollEnabled: boolean;
  /** Title/tooltip for the text */
  title?: string;
}

/**
 * Animation timing configuration
 */
const ANIMATION_CONFIG = {
  /** Delay before starting scroll (ms) */
  startDelay: 2000,
  /** Pixels scrolled per second */
  scrollSpeed: 5,
  /** Minimum overflow to trigger scroll (px) */
  minOverflow: 4,
  /** Gap between repeated text (px) */
  textGap: 32,
  /** Pause when loop resets (ms) */
  loopPause: 3000,
} as const;

function MarqueeTextComponent({
  children,
  className,
  isAutoScrollEnabled,
  title,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const firstTextRef = useRef<HTMLSpanElement>(null);
  
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isInViewport, setIsInViewport] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const animationRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if text overflows container
  const checkOverflow = useCallback(() => {
    if (!containerRef.current || !firstTextRef.current) return;
    
    const containerWidth = containerRef.current.clientWidth;
    const textWidth = firstTextRef.current.scrollWidth;
    const overflow = textWidth - containerWidth;
    
    setIsOverflowing(overflow > ANIMATION_CONFIG.minOverflow);
  }, []);

  // Set up ResizeObserver to detect container/text size changes
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(containerRef.current);
    if (firstTextRef.current) {
      observer.observe(firstTextRef.current);
    }
    
    // Also check when children change
    checkOverflow();
    
    return () => observer.disconnect();
  }, [checkOverflow, children]);

  // Set up IntersectionObserver for viewport detection
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInViewport(entry.isIntersecting);
        }
      },
      {
        root: null,
        rootMargin: '50px', // Start a bit before entering viewport
        threshold: 0,
      }
    );
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Clean up animation on unmount or when conditions change
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Animation logic - infinite scroll
  useEffect(() => {
    const shouldAnimate = 
      isAutoScrollEnabled && 
      isOverflowing && 
      isInViewport &&
      !isHovered; // Pause when hovered to allow clicking links

    if (!shouldAnimate) {
      // Reset position when not animating
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setScrollOffset(0);
      setIsScrolling(false);
      return;
    }

    if (!containerRef.current || !firstTextRef.current) return;

    const textWidth = firstTextRef.current.scrollWidth;
    const loopPoint = textWidth + ANIMATION_CONFIG.textGap;

    let currentOffset = 0;
    let lastTime = 0;
    let hasStarted = false;
    let isPaused = false;

    const animate = (timestamp: number) => {
      if (!lastTime) {
        lastTime = timestamp;
        // Initial delay before starting
        timeoutRef.current = setTimeout(() => {
          hasStarted = true;
          setIsScrolling(true);
        }, ANIMATION_CONFIG.startDelay);
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      if (!hasStarted || isPaused) {
        // Reset lastTime when paused to avoid jump when resuming
        lastTime = timestamp;
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;

      const pixelsToMove = (ANIMATION_CONFIG.scrollSpeed * deltaTime) / 1000;
      currentOffset += pixelsToMove;

      // Reset to 0 when we've scrolled one full cycle
      if (currentOffset >= loopPoint) {
        currentOffset = 0;
        // Pause at the beginning of the loop
        isPaused = true;
        timeoutRef.current = setTimeout(() => {
          isPaused = false;
        }, ANIMATION_CONFIG.loopPause);
      }

      setScrollOffset(currentOffset);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isAutoScrollEnabled, isOverflowing, isInViewport, isHovered]);

  return (
    <div
      ref={containerRef}
      className={cn('overflow-hidden flex-1 min-w-0', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={title}
    >
      <span
        ref={textRef}
        className={cn(
          'inline-block whitespace-nowrap',
          isScrolling && 'transition-none'
        )}
        style={{
          transform: `translateX(-${scrollOffset}px)`,
        }}
      >
        <span ref={firstTextRef} className="inline-block">
          {children}
        </span>
        {/* Duplicate text for infinite loop effect - only show when overflowing */}
        {isOverflowing && (
          <span className="inline-block" style={{ marginLeft: `${ANIMATION_CONFIG.textGap}px` }}>
            {children}
          </span>
        )}
      </span>
    </div>
  );
}

export const MarqueeText = memo(MarqueeTextComponent);
