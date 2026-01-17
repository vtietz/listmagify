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
import { eventBus } from '@/lib/sync/eventBus';

/** Minimum ms between automatic store updates during scroll */
const THROTTLE_MS = 200;

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
    const clampedOffset = Math.max(0, Math.min(offset, maxScroll));
    
    // Try virtualizer scrollToOffset first if available
    const virtualizer = virtualizerRef.current;
    if (virtualizer && typeof virtualizer.scrollToOffset === 'function') {
      virtualizer.scrollToOffset(clampedOffset, { align: 'start' });
    } else {
      el.scrollTop = clampedOffset;
    }
    
    lastSavedValueRef.current = clampedOffset;
    return true;
  }, [scrollRef, virtualizerRef]);

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
    
    const offset = targetScrollOffsetRef.current ?? 0;

    let cancelled = false;

    // First: try to restore synchronously in layout-effect so the initial paint
    // is already at the correct scroll position when possible.
    // If the element isn't ready yet, retry on the next animation frame.
    const attempt = () => {
      if (cancelled) return;

      if (doRestore(offset)) {
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

  // --- External flush request (used before structural changes like close/collapse) ---
  useEffect(() => {
    return eventBus.on('panels:save-scroll', () => {
      const el = scrollRef.current;
      if (!el) return;

      // Flush immediately, regardless of suspend state.
      // This event is intended to be emitted BEFORE a structural change.
      const scrollTop = el.scrollTop;
      lastSavedValueRef.current = scrollTop;
      setScroll(panelId, scrollTop);
    });
  }, [panelId, scrollRef, setScroll]);

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
