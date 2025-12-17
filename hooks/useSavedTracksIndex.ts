/**
 * Global Saved Tracks Index Service
 * 
 * Maintains a global in-memory Set of saved (liked) track IDs.
 * Provides efficient O(1) membership checks for heart icon rendering.
 * 
 * Features:
 * - Progressive background prefetch of all saved tracks
 * - Batched /contains fallback for immediate coverage of unknown IDs
 * - Optimistic updates on toggle with rollback on error
 * - Event-driven updates for UI synchronization
 */

'use client';

import { create } from 'zustand';
import { useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api/client';

/**
 * Store state for the saved tracks index
 */
interface SavedTracksIndexState {
  /** Set of track IDs that are saved to the user's library */
  likedSet: Set<string>;
  /** Total number of saved tracks (from API) */
  total: number;
  /** Whether we've started prefetching */
  isPrefetching: boolean;
  /** Whether prefetch is complete */
  isPrefetchComplete: boolean;
  /** IDs currently being checked via /contains */
  pendingContainsIds: Set<string>;
  /** Error from last operation */
  error: Error | null;
  
  // Actions
  /** Add IDs to the liked set */
  addToLikedSet: (ids: string[]) => void;
  /** Remove IDs from the liked set */
  removeFromLikedSet: (ids: string[]) => void;
  /** Set the total count */
  setTotal: (total: number) => void;
  /** Mark prefetch as started */
  startPrefetch: () => void;
  /** Mark prefetch as complete */
  completePrefetch: () => void;
  /** Add IDs to pending contains check */
  addPendingContains: (ids: string[]) => void;
  /** Remove IDs from pending contains check */
  removePendingContains: (ids: string[]) => void;
  /** Set error state */
  setError: (error: Error | null) => void;
  /** Reset the entire state (for testing or logout) */
  reset: () => void;
}

const initialState = {
  likedSet: new Set<string>(),
  total: 0,
  isPrefetching: false,
  isPrefetchComplete: false,
  pendingContainsIds: new Set<string>(),
  error: null,
};

/**
 * Zustand store for saved tracks index
 */
export const useSavedTracksStore = create<SavedTracksIndexState>((set) => ({
  ...initialState,
  
  addToLikedSet: (ids) => set((state) => {
    const newSet = new Set(state.likedSet);
    ids.forEach(id => newSet.add(id));
    return { likedSet: newSet };
  }),
  
  removeFromLikedSet: (ids) => set((state) => {
    const newSet = new Set(state.likedSet);
    ids.forEach(id => newSet.delete(id));
    return { likedSet: newSet };
  }),
  
  setTotal: (total) => set({ total }),
  
  startPrefetch: () => set({ isPrefetching: true }),
  
  completePrefetch: () => set({ isPrefetching: false, isPrefetchComplete: true }),
  
  addPendingContains: (ids) => set((state) => {
    const newSet = new Set(state.pendingContainsIds);
    ids.forEach(id => newSet.add(id));
    return { pendingContainsIds: newSet };
  }),
  
  removePendingContains: (ids) => set((state) => {
    const newSet = new Set(state.pendingContainsIds);
    ids.forEach(id => newSet.delete(id));
    return { pendingContainsIds: newSet };
  }),
  
  setError: (error) => set({ error }),
  
  reset: () => set(initialState),
}));

/**
 * Maximum IDs per /contains API request
 */
const MAX_CONTAINS_BATCH = 50;

/**
 * Debounce delay for ensureCoverage calls (ms)
 */
const ENSURE_COVERAGE_DEBOUNCE = 300;

/**
 * Hook providing access to the global saved tracks index with methods
 * for prefetching, coverage checking, and toggle operations.
 */
export function useSavedTracksIndex() {
  const likedSet = useSavedTracksStore((state) => state.likedSet);
  const total = useSavedTracksStore((state) => state.total);
  const isPrefetching = useSavedTracksStore((state) => state.isPrefetching);
  const isPrefetchComplete = useSavedTracksStore((state) => state.isPrefetchComplete);
  const pendingContainsIds = useSavedTracksStore((state) => state.pendingContainsIds);
  const error = useSavedTracksStore((state) => state.error);
  
  const {
    addToLikedSet,
    removeFromLikedSet,
    setTotal,
    startPrefetch,
    completePrefetch,
    addPendingContains,
    removePendingContains,
    setError,
  } = useSavedTracksStore.getState();

  // Ref to track if prefetch has been initiated this session
  const prefetchInitiatedRef = useRef(false);
  
  // Ref for debounced ensureCoverage
  const ensureCoverageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEnsureIdsRef = useRef<Set<string>>(new Set());

  /**
   * Progressively prefetch all saved tracks in the background.
   * Should be called once per app session.
   */
  const prefetchAllSavedTracks = useCallback(async () => {
    // Guard against duplicate runs
    if (prefetchInitiatedRef.current || isPrefetching || isPrefetchComplete) {
      return;
    }
    
    prefetchInitiatedRef.current = true;
    startPrefetch();
    
    try {
      let nextCursor: string | null = null;
      let hasMore = true;
      
      while (hasMore) {
        const url = nextCursor 
          ? `/api/liked/tracks?limit=50&nextCursor=${encodeURIComponent(nextCursor)}`
          : '/api/liked/tracks?limit=50';
        
        const response = await apiFetch<{
          tracks: Array<{ id: string | null }>;
          total: number;
          nextCursor: string | null;
        }>(url);
        
        // Extract IDs (filter out local files with null ID)
        const ids = response.tracks
          .map(t => t.id)
          .filter((id): id is string => id !== null);
        
        addToLikedSet(ids);
        setTotal(response.total);
        
        nextCursor = response.nextCursor;
        hasMore = nextCursor !== null;
        
        // Small delay between pages to avoid overwhelming the API
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      completePrefetch();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to prefetch saved tracks'));
      completePrefetch(); // Mark as complete even on error to prevent retries
    }
  }, [isPrefetching, isPrefetchComplete, startPrefetch, addToLikedSet, setTotal, completePrefetch, setError]);

  /**
   * Ensure coverage for specific track IDs.
   * Uses batched /contains calls for IDs not yet in likedSet.
   * Debounced and deduped to minimize API calls.
   */
  const ensureCoverage = useCallback((ids: string[]) => {
    // Filter to IDs not in likedSet and not already pending
    const unknownIds = ids.filter(
      id => id && !likedSet.has(id) && !pendingContainsIds.has(id)
    );
    
    if (unknownIds.length === 0) return;
    
    // Add to pending set for debouncing
    unknownIds.forEach(id => pendingEnsureIdsRef.current.add(id));
    
    // Clear existing timeout
    if (ensureCoverageTimeoutRef.current) {
      clearTimeout(ensureCoverageTimeoutRef.current);
    }
    
    // Debounce the actual API call
    ensureCoverageTimeoutRef.current = setTimeout(async () => {
      const idsToCheck = Array.from(pendingEnsureIdsRef.current);
      pendingEnsureIdsRef.current.clear();
      
      if (idsToCheck.length === 0) return;
      
      // Mark as pending
      addPendingContains(idsToCheck);
      
      try {
        // Batch into chunks of 50
        const batches: string[][] = [];
        for (let i = 0; i < idsToCheck.length; i += MAX_CONTAINS_BATCH) {
          batches.push(idsToCheck.slice(i, i + MAX_CONTAINS_BATCH));
        }
        
        // Fetch all batches in parallel
        const results = await Promise.all(
          batches.map(batch =>
            apiFetch<boolean[]>(`/api/tracks/contains?ids=${batch.join(',')}`)
          )
        );
        
        // Process results and update likedSet
        const likedIds: string[] = [];
        batches.forEach((batch, batchIndex) => {
          const booleans = results[batchIndex];
          batch.forEach((id, idIndex) => {
            if (booleans[idIndex]) {
              likedIds.push(id);
            }
          });
        });
        
        if (likedIds.length > 0) {
          addToLikedSet(likedIds);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to check track status'));
      } finally {
        removePendingContains(idsToCheck);
      }
    }, ENSURE_COVERAGE_DEBOUNCE);
  }, [likedSet, pendingContainsIds, addPendingContains, removePendingContains, addToLikedSet, setError]);

  /**
   * Check if a track is liked (in likedSet)
   */
  const isLiked = useCallback((trackId: string | null): boolean => {
    if (!trackId) return false;
    return likedSet.has(trackId);
  }, [likedSet]);

  /**
   * Toggle liked status for a track with optimistic update
   */
  const toggleLiked = useCallback(async (trackId: string, currentlyLiked: boolean) => {
    // Optimistic update
    if (currentlyLiked) {
      removeFromLikedSet([trackId]);
    } else {
      addToLikedSet([trackId]);
    }
    
    try {
      if (currentlyLiked) {
        await apiFetch('/api/tracks/remove', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [trackId] }),
        });
      } else {
        await apiFetch('/api/tracks/save', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [trackId] }),
        });
      }
    } catch (err) {
      // Rollback on error
      if (currentlyLiked) {
        addToLikedSet([trackId]);
      } else {
        removeFromLikedSet([trackId]);
      }
      setError(err instanceof Error ? err : new Error('Failed to toggle track'));
      throw err;
    }
  }, [addToLikedSet, removeFromLikedSet, setError]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (ensureCoverageTimeoutRef.current) {
        clearTimeout(ensureCoverageTimeoutRef.current);
      }
    };
  }, []);

  return {
    /** Set of liked track IDs */
    likedSet,
    /** Total saved tracks count */
    total,
    /** Whether prefetch is in progress */
    isPrefetching,
    /** Whether prefetch is complete */
    isPrefetchComplete,
    /** Coverage percentage (likedSet size vs total) */
    coverage: total > 0 ? likedSet.size / total : 0,
    /** Last error */
    error,
    /** Start background prefetch of all saved tracks */
    prefetchAllSavedTracks,
    /** Ensure coverage for specific IDs (debounced, batched) */
    ensureCoverage,
    /** Check if a track is liked */
    isLiked,
    /** Toggle liked status with optimistic update */
    toggleLiked,
  };
}

/**
 * Hook to auto-start prefetch on mount (use in app root or first panel)
 */
export function usePrefetchSavedTracks() {
  const { prefetchAllSavedTracks, isPrefetching, isPrefetchComplete } = useSavedTracksIndex();
  
  useEffect(() => {
    if (!isPrefetching && !isPrefetchComplete) {
      prefetchAllSavedTracks();
    }
  }, [prefetchAllSavedTracks, isPrefetching, isPrefetchComplete]);
}
