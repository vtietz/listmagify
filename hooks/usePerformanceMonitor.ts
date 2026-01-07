/**
 * Performance monitoring utilities for the multi-panel interface.
 * 
 * Provides:
 * - Panel count monitoring with warnings
 * - Render performance tracking
 * - Memory-conscious suggestions
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useDeviceType, TABLET_PERFORMANCE_WARNING_THRESHOLD } from './useDeviceType';
import { toast } from '@/lib/ui/toast';

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  /** Max render time before warning (ms) */
  MAX_RENDER_TIME: 100,
  /** Max panels before performance hint */
  PHONE_MAX_PANELS: 2,
  TABLET_WARNING_PANELS: TABLET_PERFORMANCE_WARNING_THRESHOLD,
  DESKTOP_WARNING_PANELS: 12,
};

/**
 * Hook to monitor panel count and show performance hints.
 */
export function usePanelPerformanceMonitor(panelCount: number) {
  const { deviceType, isPhone, isTablet } = useDeviceType();
  const lastWarningCountRef = useRef(0);

  useEffect(() => {
    // Determine warning threshold based on device
    let warningThreshold: number;
    if (isPhone) {
      warningThreshold = PERFORMANCE_THRESHOLDS.PHONE_MAX_PANELS;
    } else if (isTablet) {
      warningThreshold = PERFORMANCE_THRESHOLDS.TABLET_WARNING_PANELS;
    } else {
      warningThreshold = PERFORMANCE_THRESHOLDS.DESKTOP_WARNING_PANELS;
    }

    // Show warning when crossing threshold (only once per crossing)
    if (panelCount > warningThreshold && lastWarningCountRef.current <= warningThreshold) {
      toast.performanceHint(
        `You have ${panelCount} panels open. Consider closing some for better performance.`
      );
    }

    lastWarningCountRef.current = panelCount;
  }, [panelCount, isPhone, isTablet, deviceType]);
}

/**
 * Hook to track render performance of a component.
 * Development only - no-op in production.
 */
export function useRenderPerformance(componentName: string) {
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef<number>(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const now = performance.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;
    renderCountRef.current += 1;

    // Log slow renders
    if (lastRenderTimeRef.current > 0 && timeSinceLastRender < 16) {
      // Rendering faster than 60fps - might indicate unnecessary re-renders
      console.debug(`[Perf] ${componentName}: rapid re-render (${timeSinceLastRender.toFixed(2)}ms)`);
    }

    lastRenderTimeRef.current = now;
  });
}

/**
 * Debounce hook for performance-sensitive operations.
 */
export function useDebounce<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedCallback = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback as T;
}

/**
 * Throttle hook for performance-sensitive operations.
 */
export function useThrottle<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const throttledCallback = useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallRef.current;

    if (timeSinceLastCall >= delay) {
      lastCallRef.current = now;
      callback(...args);
    } else {
      // Schedule a trailing call
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        lastCallRef.current = Date.now();
        callback(...args);
      }, delay - timeSinceLastCall);
    }
  }, [callback, delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback as T;
}

/**
 * Hook to measure and report component mount/unmount timing.
 */
export function useMountTiming(componentName: string) {
  const mountTimeRef = useRef<number>(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    mountTimeRef.current = performance.now();
    console.debug(`[Mount] ${componentName}: mounted`);

    return () => {
      const duration = performance.now() - mountTimeRef.current;
      console.debug(`[Mount] ${componentName}: unmounted after ${duration.toFixed(0)}ms`);
    };
  }, [componentName]);
}

/**
 * Check if the device might have performance constraints.
 */
export function usePerformanceConstraints() {
  const { isPhone, isTablet } = useDeviceType();

  // Simple heuristic - phones are more constrained
  const isConstrained = isPhone;
  const isModeratelyConstrained = isTablet;

  return {
    isConstrained,
    isModeratelyConstrained,
    /** Suggested batch size for operations */
    recommendedBatchSize: isConstrained ? 10 : isModeratelyConstrained ? 25 : 50,
    /** Suggested debounce delay for search */
    recommendedSearchDebounce: isConstrained ? 400 : 300,
    /** Whether to use simplified animations */
    useSimplifiedAnimations: isConstrained,
  };
}
