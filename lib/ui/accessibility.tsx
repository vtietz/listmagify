/**
 * Accessibility utilities for mobile multi-panel interface.
 * 
 * Provides:
 * - ARIA live announcements for reorder/marker operations
 * - Reduced motion detection
 * - Keyboard navigation helpers
 * - Screen reader utilities
 */

'use client';

import * as React from 'react';
import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';

// ============================================================================
// ARIA Live Announcer
// ============================================================================

interface AriaLiveContextType {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

const AriaLiveContext = createContext<AriaLiveContextType>({
  announce: () => {},
});

/**
 * Provider component for ARIA live announcements.
 * Place this once near the root of your app.
 */
export function AriaLiveProvider({ children }: { children: React.ReactNode }) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  
  // Clear messages after announcement to allow repeated same messages
  const politeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const assertiveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (priority === 'assertive') {
      setAssertiveMessage(message);
      if (assertiveTimeoutRef.current) {
        clearTimeout(assertiveTimeoutRef.current);
      }
      assertiveTimeoutRef.current = setTimeout(() => {
        setAssertiveMessage('');
      }, 1000);
    } else {
      setPoliteMessage(message);
      if (politeTimeoutRef.current) {
        clearTimeout(politeTimeoutRef.current);
      }
      politeTimeoutRef.current = setTimeout(() => {
        setPoliteMessage('');
      }, 1000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (politeTimeoutRef.current) clearTimeout(politeTimeoutRef.current);
      if (assertiveTimeoutRef.current) clearTimeout(assertiveTimeoutRef.current);
    };
  }, []);

  return (
    <AriaLiveContext.Provider value={{ announce }}>
      {children}
      {/* Visually hidden live regions */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </AriaLiveContext.Provider>
  );
}

/**
 * Hook to make ARIA live announcements.
 */
export function useAriaLive() {
  return useContext(AriaLiveContext);
}

// ============================================================================
// Reduced Motion Detection
// ============================================================================

/**
 * Hook to detect if user prefers reduced motion.
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}

/**
 * Get CSS transition based on reduced motion preference.
 */
export function getTransitionStyle(
  prefersReducedMotion: boolean,
  duration = '200ms',
  properties = 'all'
): React.CSSProperties {
  if (prefersReducedMotion) {
    return { transition: 'none' };
  }
  return { transition: `${properties} ${duration} ease` };
}

// ============================================================================
// Focus Management
// ============================================================================

/**
 * Hook to manage focus trap within a container.
 * Useful for modal dialogs and overlays.
 */
export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // Store previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Find all focusable elements
    const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element
    firstElement?.focus();

    // Handle tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus when trap is deactivated
      previousFocusRef.current?.focus();
    };
  }, [isActive]);

  return containerRef;
}

// ============================================================================
// Keyboard Navigation
// ============================================================================

/**
 * Hook for arrow key navigation in a list.
 */
export function useArrowKeyNavigation(
  itemCount: number,
  onSelect?: (index: number) => void
) {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (itemCount === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => 
          prev < itemCount - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => 
          prev > 0 ? prev - 1 : itemCount - 1
        );
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(itemCount - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0) {
          onSelect?.(focusedIndex);
        }
        break;
    }
  }, [itemCount, focusedIndex, onSelect]);

  return {
    focusedIndex,
    setFocusedIndex,
    handleKeyDown,
  };
}

// ============================================================================
// Screen Reader Utilities
// ============================================================================

/**
 * Generate screen reader text for track position.
 */
export function getTrackPositionText(position: number, total: number): string {
  return `Track ${position} of ${total}`;
}

/**
 * Generate screen reader text for marker.
 */
export function getMarkerText(position: number): string {
  return `Insertion marker at position ${position}`;
}

/**
 * Generate screen reader text for panel.
 */
export function getPanelText(
  panelIndex: number,
  totalPanels: number,
  playlistName?: string,
  isFocused?: boolean
): string {
  const focusText = isFocused ? ', focused' : '';
  const nameText = playlistName ? `: ${playlistName}` : '';
  return `Panel ${panelIndex + 1} of ${totalPanels}${nameText}${focusText}`;
}

/**
 * Generate screen reader text for drag operation.
 */
export function getDragText(
  trackName: string,
  operation: 'start' | 'over' | 'end' | 'cancel',
  targetPosition?: number
): string {
  switch (operation) {
    case 'start':
      return `Dragging ${trackName}. Use arrow keys to move, Enter to drop, Escape to cancel.`;
    case 'over':
      return targetPosition !== undefined
        ? `Over position ${targetPosition + 1}`
        : `Over drop zone`;
    case 'end':
      return targetPosition !== undefined
        ? `Dropped ${trackName} at position ${targetPosition + 1}`
        : `Dropped ${trackName}`;
    case 'cancel':
      return `Drag cancelled for ${trackName}`;
  }
}
