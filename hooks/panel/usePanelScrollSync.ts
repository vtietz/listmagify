/**
 * Unified hook for scroll position persistence and restoration.
 * 
 * Key design principles:
 * 1. Save scroll synchronously BEFORE tree mutations (split/close) - done by caller
 * 2. Restore on mount using useLayoutEffect (before paint) with suspend-saves guard
 * 3. Always allow restoration, even to offset 0
 * 4. Use double-rAF after layout to ensure virtualizer has measured
 * 
 * The caller (usePlaylistPanelState) saves scroll position before split/close.
 * This hook focuses on restoration after remount and ongoing persistence.
 */

'use client';

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

/** Minimum ms between automatic store updates during scroll */
const THROTTLE_MS = 200;

type ScrollRegistryEntry = {
  panelId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  setScroll: (panelId: string, scrollTop: number) => void;
};

const scrollRegistry = new Map<string, ScrollRegistryEntry>();

/**
 * Flush scroll positions for all currently mounted panels.
 *
 * This is used before split/close tree mutations that can cause sibling panels
 * to remount. Without this, a surviving panel can lose its stored offset and
 * restore to 0 on the next mount.
 */
export function flushAllPanelScrollPositions() {
  for (const entry of scrollRegistry.values()) {
    const el = entry.scrollRef.current;
    if (!el) continue;
    entry.setScroll(entry.panelId, el.scrollTop);
  }
}

interface UsePanelScrollSyncOptions {
  panelId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  virtualizerRef: React.RefObject<Virtualizer<HTMLDivElement, Element>>;
  targetScrollOffset: number | undefined;
  dataUpdatedAt: number;
  setScroll: (panelId: string, scrollTop: number) => void;
}

export function usePanelScrollSync({
  panelId,
  scrollRef,
  virtualizerRef,
  targetScrollOffset,
  dataUpdatedAt,
  setScroll,
}: UsePanelScrollSyncOptions) {
  // Register this panel's scroll container so other panels can flush before a tree mutation.
  useEffect(() => {
    scrollRegistry.set(panelId, { panelId, scrollRef, setScroll });
    return () => {
      scrollRegistry.delete(panelId);
    };
  }, [panelId, scrollRef, setScroll]);

  // --- Refs for tracking state ---
  // Suspend saves during restoration to prevent "0" overwrites
  const suspendSavesRef = useRef(true); // Start suspended until first restore completes
  const lastSavedValueRef = useRef(0);
  const lastWriteTimeRef = useRef(0);
  const pendingRafRef = useRef<number | null>(null);
  const lastDataUpdatedAtRef = useRef(dataUpdatedAt);
  const initialRestoreDoneRef = useRef(false);
  
  // Store targetScrollOffset in a ref so callbacks always have the latest value
  const targetScrollOffsetRef = useRef(targetScrollOffset);
  targetScrollOffsetRef.current = targetScrollOffset;

  // --- Save logic (respects suspend flag) ---
  const saveScrollPosition = useCallback(
    (immediate = false) => {
      // Don't save while restoring or suspended
      if (suspendSavesRef.current) return;
      
      const el = scrollRef.current;
      if (!el) return;
      
      const scrollTop = el.scrollTop;
      
      // Skip if value hasn't changed
      if (scrollTop === lastSavedValueRef.current) return;
      
      // Time-based throttle for non-immediate saves
      if (!immediate) {
        const now = performance.now();
        if (now - lastWriteTimeRef.current < THROTTLE_MS) return;
        lastWriteTimeRef.current = now;
      }
      
      lastSavedValueRef.current = scrollTop;
      setScroll(panelId, scrollTop);
    },
    [panelId, scrollRef, setScroll]
  );

  // --- Core restore logic ---
  const doRestore = useCallback((offset: number) => {
    const el = scrollRef.current;
    if (!el) return false;
    
    // Check if element is ready (has dimensions)
    if (el.clientHeight === 0 || el.scrollHeight === 0) return false;
    
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    // If we want to restore to a non-zero position but the container can't scroll yet,
    // treat this as "not ready" so we retry on a later frame.
    if (offset > 0 && maxScroll === 0) return false;
    const clampedOffset = Math.max(0, Math.min(offset, maxScroll));
    
    // Try virtualizer scrollToOffset first if available
    const virtualizer = virtualizerRef.current;
    if (virtualizer && typeof virtualizer.scrollToOffset === 'function') {
      virtualizer.scrollToOffset(clampedOffset, { align: 'start' });
    } else {
      el.scrollTop = clampedOffset;
    }
    
    lastSavedValueRef.current = clampedOffset;
    // Critical: also persist the restored offset to the store.
    // Otherwise, if the panel remounts again before the user scrolls (e.g. closing a sibling
    // panel collapses the tree and causes a remount), the store may still contain 0 and we'd
    // jump to the top on the next mount.
    setScroll(panelId, clampedOffset);
    return true;
  }, [panelId, scrollRef, setScroll, virtualizerRef]);

  // --- Restore with double-rAF and retry logic ---
  const restoreScrollPosition = useCallback((offset: number, onComplete?: () => void) => {
    const el = scrollRef.current;
    if (!el) {
      onComplete?.();
      return;
    }
    
    let attempts = 0;
    const maxAttempts = 10;
    
    const attemptRestore = () => {
      attempts++;
      if (el.clientHeight > 0 && el.scrollHeight > 0) {
        // Element ready - use double rAF for layout stability
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            doRestore(offset);
            onComplete?.();
          });
        });
      } else if (attempts < maxAttempts) {
        // Element not ready, try again next frame
        requestAnimationFrame(attemptRestore);
      } else {
        // Give up after max attempts
        onComplete?.();
      }
    };
    
    attemptRestore();
  }, [scrollRef, doRestore]);

  // --- Initial restoration on mount (useLayoutEffect for before-paint timing) ---
  useLayoutEffect(() => {
    if (initialRestoreDoneRef.current) return;

    let cancelled = false;

    // First: try to restore synchronously in layout-effect so the initial paint
    // is already at the correct scroll position when possible.
    // If the element isn't ready yet, retry on the next animation frame.
    const attempt = () => {
      if (cancelled) return;

      // Always read the latest desired offset (it can change across remounts)
      const latestOffset = targetScrollOffsetRef.current ?? 0;
      if (doRestore(latestOffset)) {
        initialRestoreDoneRef.current = true;
        suspendSavesRef.current = false;
        return;
      }

      requestAnimationFrame(attempt);
    };

    attempt();

    return () => {
      cancelled = true;
    };
  }, [doRestore]);

  // --- Scroll event handler ---
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (suspendSavesRef.current) return;
      
      // Cancel any pending RAF
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
      }
      
      pendingRafRef.current = requestAnimationFrame(() => {
        pendingRafRef.current = null;
        saveScrollPosition(false);
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
      }
    };
  }, [scrollRef, saveScrollPosition]);

  // --- Restore on data update (e.g., after playlist reload) ---
  useEffect(() => {
    // Skip if this is the initial render (handled by mount restoration)
    if (lastDataUpdatedAtRef.current === dataUpdatedAt) return;
    
    lastDataUpdatedAtRef.current = dataUpdatedAt;
    
    // Restore after data update
    const offset = targetScrollOffsetRef.current ?? 0;
    if (offset > 0) {
      suspendSavesRef.current = true;
      restoreScrollPosition(offset, () => {
        suspendSavesRef.current = false;
      });
    }
  }, [dataUpdatedAt, restoreScrollPosition]);

  // --- Flush on unmount ---
  useEffect(() => {
    return () => {
      // Flush current scroll position on unmount (for page reload restoration)
      const el = scrollRef.current;
      if (el && !suspendSavesRef.current) {
        setScroll(panelId, el.scrollTop);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId, setScroll]);
}
