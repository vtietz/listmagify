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
 * - localStorage persistence for instant loading on page refresh
 * - Smart cache invalidation with timestamps (24h TTL)
 */

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api/client';

/**
 * Cache duration for localStorage (24 hours in ms)
 * After this time, we'll re-fetch from API even if cache exists
 */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Store state for the saved tracks index
 * Note: likedIds is stored as array for JSON serialization, converted to Set in hook
 */
interface SavedTracksIndexState {
  /** Array of track IDs that are saved (persisted, converted to Set in hook) */
  likedIds: string[];
  /** Total number of saved tracks (from API) */
  total: number;
  /** Whether we've started prefetching */
  isPrefetching: boolean;
  /** Whether prefetch is complete */
  isPrefetchComplete: boolean;
  /** IDs currently being checked via /contains (not persisted) */
  pendingContainsIds: string[];
  /** Error from last operation (not persisted) */
  error: string | null;
  /** Timestamp when cache was last updated (for invalidation) */
  lastUpdatedAt: number;
  
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
  setError: (error: string | null) => void;
  /** Reset the entire state (for testing or logout) */
  reset: () => void;
}

const initialState = {
  likedIds: [] as string[],
  total: 0,
  isPrefetching: false,
  isPrefetchComplete: false,
  pendingContainsIds: [] as string[],
  error: null as string | null,
  lastUpdatedAt: 0,
};

/**
 * Custom storage wrapper for SSR safety
 */
const customStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(name, value);
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(name);
  },
};

/**
 * Zustand store for saved tracks index with localStorage persistence
 */
export const useSavedTracksStore = create<SavedTracksIndexState>()(
  persist(
    (set) => ({
      ...initialState,
      
      addToLikedSet: (ids) => set((state) => {
        const newSet = new Set(state.likedIds);
        ids.forEach(id => newSet.add(id));
        return { 
          likedIds: Array.from(newSet),
          lastUpdatedAt: Date.now(),
        };
      }),
      
      removeFromLikedSet: (ids) => set((state) => {
        const idsToRemove = new Set(ids);
        return { 
          likedIds: state.likedIds.filter(id => !idsToRemove.has(id)),
          lastUpdatedAt: Date.now(),
        };
      }),
      
      setTotal: (total) => set({ total }),
      
      startPrefetch: () => set({ isPrefetching: true }),
      
      completePrefetch: () => set({ 
        isPrefetching: false, 
        isPrefetchComplete: true,
        lastUpdatedAt: Date.now(),
      }),
      
      addPendingContains: (ids) => set((state) => {
        const newSet = new Set(state.pendingContainsIds);
        ids.forEach(id => newSet.add(id));
        return { pendingContainsIds: Array.from(newSet) };
      }),
      
      removePendingContains: (ids) => set((state) => {
        const idsToRemove = new Set(ids);
        return { pendingContainsIds: state.pendingContainsIds.filter(id => !idsToRemove.has(id)) };
      }),
      
      setError: (error) => set({ error }),
      
      reset: () => set(initialState),
    }),
    {
      name: 'spotify-liked-tracks-cache',
      storage: createJSONStorage(() => customStorage),
      // Only persist essential data, not transient state
      partialize: (state) => ({
        likedIds: state.likedIds,
        total: state.total,
        isPrefetchComplete: state.isPrefetchComplete,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    },
  ),
);

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
  const likedIds = useSavedTracksStore((state) => state.likedIds);
  const total = useSavedTracksStore((state) => state.total);
  const isPrefetching = useSavedTracksStore((state) => state.isPrefetching);
  const isPrefetchComplete = useSavedTracksStore((state) => state.isPrefetchComplete);
  const pendingContainsIds = useSavedTracksStore((state) => state.pendingContainsIds);
  const error = useSavedTracksStore((state) => state.error);
  const lastUpdatedAt = useSavedTracksStore((state) => state.lastUpdatedAt);
  
  // Convert array to Set for efficient O(1) lookups - memoized to prevent re-renders
  const likedSet = useMemo(() => new Set(likedIds), [likedIds]);
  const pendingSet = useMemo(() => new Set(pendingContainsIds), [pendingContainsIds]);
  
  // Refs to access current values without causing callback recreation
  const likedSetRef = useRef(likedSet);
  const pendingSetRef = useRef(pendingSet);
  useEffect(() => { likedSetRef.current = likedSet; }, [likedSet]);
  useEffect(() => { pendingSetRef.current = pendingSet; }, [pendingSet]);
  
  const {
    addToLikedSet,
    removeFromLikedSet,
    setTotal,
    startPrefetch,
    completePrefetch,
    addPendingContains,
    removePendingContains,
    setError,
    reset,
  } = useSavedTracksStore.getState();

  // Ref to track if prefetch has been initiated this session
  const prefetchInitiatedRef = useRef(false);
  
  // Ref for debounced ensureCoverage
  const ensureCoverageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEnsureIdsRef = useRef<Set<string>>(new Set());

  /**
   * Check if cache is stale and needs refresh
   */
  const isCacheStale = useCallback(() => {
    if (!isPrefetchComplete || lastUpdatedAt === 0) return true;
    return Date.now() - lastUpdatedAt > CACHE_MAX_AGE_MS;
  }, [isPrefetchComplete, lastUpdatedAt]);

  /**
   * Progressively prefetch all saved tracks in the background.
   * Should be called once per app session. Skips if valid cache exists.
   */
  const prefetchAllSavedTracks = useCallback(async (forceRefresh = false) => {
    // Guard against duplicate runs (unless force refresh)
    if (!forceRefresh && (prefetchInitiatedRef.current || isPrefetching)) {
      return;
    }
    
    // If we have valid cached data, skip prefetch
    if (!forceRefresh && isPrefetchComplete && !isCacheStale()) {
      console.log('📦 Using cached liked tracks:', likedIds.length, 'tracks');
      return;
    }
    
    prefetchInitiatedRef.current = true;
    
    // If force refresh, clear existing data first
    if (forceRefresh) {
      reset();
    }
    
    startPrefetch();
    
    try {
      let nextCursor: string | null = null;
      let hasMore = true;
      const allIds: string[] = [];
      
      console.log('🔄 Fetching liked tracks from Spotify...');
      
      while (hasMore) {
        const url: string = nextCursor 
          ? `/api/liked/tracks?limit=50&nextCursor=${encodeURIComponent(nextCursor)}`
          : '/api/liked/tracks?limit=50';
        
        interface LikedTracksResponse {
          tracks: Array<{ id: string | null }>;
          total: number;
          nextCursor: string | null;
        }
        
        const response: LikedTracksResponse = await apiFetch<LikedTracksResponse>(url);
        
        // Extract IDs (filter out local files with null ID)
        const ids = response.tracks
          .map((t: { id: string | null }) => t.id)
          .filter((id: string | null): id is string => id !== null);
        
        allIds.push(...ids);
        setTotal(response.total);
        
        nextCursor = response.nextCursor;
        hasMore = nextCursor !== null;
        
        // Small delay between pages to avoid overwhelming the API
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Add all IDs at once for efficiency
      addToLikedSet(allIds);
      completePrefetch();
      console.log('✅ Loaded', allIds.length, 'liked tracks');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to prefetch saved tracks';
      setError(errorMsg);
      completePrefetch(); // Mark as complete even on error to prevent infinite retries
      console.error('❌ Failed to load liked tracks:', errorMsg);
    }
  }, [isPrefetching, isPrefetchComplete, isCacheStale, likedIds.length, startPrefetch, reset, setTotal, addToLikedSet, completePrefetch, setError]);

  /**
   * Ensure coverage for specific track IDs.
   * Uses batched /contains calls for IDs not yet in likedSet.
   * Debounced and deduped to minimize API calls.
   * Stable callback reference - uses refs to access current state.
   */
  const ensureCoverage = useCallback((ids: string[]) => {
    // Filter to IDs not in likedSet and not already pending (using refs for stability)
    const unknownIds = ids.filter(
      id => id && !likedSetRef.current.has(id) && !pendingSetRef.current.has(id)
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
        const likedIdsFound: string[] = [];
        batches.forEach((batch, batchIndex) => {
          const booleans = results[batchIndex];
          if (booleans) {
            batch.forEach((id, idIndex) => {
              if (booleans[idIndex]) {
                likedIdsFound.push(id);
              }
            });
          }
        });
        
        if (likedIdsFound.length > 0) {
          addToLikedSet(likedIdsFound);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to check track status';
        setError(errorMsg);
      } finally {
        removePendingContains(idsToCheck);
      }
    }, ENSURE_COVERAGE_DEBOUNCE);
  }, [addPendingContains, removePendingContains, addToLikedSet, setError]); // Removed likedSet/pendingSet - using refs

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
      const errorMsg = err instanceof Error ? err.message : 'Failed to toggle track';
      setError(errorMsg);
      throw err;
    }
  }, [addToLikedSet, removeFromLikedSet, setError]);

  /**
   * Force refresh cache from API (ignores cache TTL)
   */
  const refreshCache = useCallback(() => {
    prefetchInitiatedRef.current = false;
    return prefetchAllSavedTracks(true);
  }, [prefetchAllSavedTracks]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (ensureCoverageTimeoutRef.current) {
        clearTimeout(ensureCoverageTimeoutRef.current);
      }
    };
  }, []);

  return {
    /** Set of liked track IDs (derived from persisted array) */
    likedSet,
    /** Total saved tracks count */
    total,
    /** Whether prefetch is in progress */
    isPrefetching,
    /** Whether prefetch is complete */
    isPrefetchComplete,
    /** Whether cache is stale and needs refresh */
    isCacheStale: isCacheStale(),
    /** Coverage percentage (likedSet size vs total) */
    coverage: total > 0 ? likedSet.size / total : 0,
    /** Last error message */
    error,
    /** When cache was last updated (timestamp) */
    lastUpdatedAt,
    /** Start background prefetch of all saved tracks */
    prefetchAllSavedTracks,
    /** Force refresh cache from API */
    refreshCache,
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
 * Respects cache TTL - only refetches if cache is stale or missing
 */
export function usePrefetchSavedTracks() {
  const { prefetchAllSavedTracks, isPrefetching, isPrefetchComplete, isCacheStale } = useSavedTracksIndex();
  
  useEffect(() => {
    // Start prefetch if not already running and (cache is stale or not complete)
    if (!isPrefetching && (!isPrefetchComplete || isCacheStale)) {
      prefetchAllSavedTracks();
    }
  }, [prefetchAllSavedTracks, isPrefetching, isPrefetchComplete, isCacheStale]);
}

/**
 * Hook to fetch just the liked songs total count.
 * Makes a single lightweight API call (limit=1) if total is not already cached.
 * Ideal for displaying track count on playlist cards without full prefetch.
 */
export function useLikedSongsTotal() {
  const total = useSavedTracksStore((state) => state.total);
  const setTotal = useSavedTracksStore((state) => state.setTotal);
  const lastUpdatedAt = useSavedTracksStore((state) => state.lastUpdatedAt);
  
  useEffect(() => {
    // Only fetch if we don't have a cached total yet
    if (total > 0) return;
    
    // Don't re-fetch if we've checked recently (within last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (lastUpdatedAt > oneHourAgo && total === 0) {
      // We checked recently and it was 0, might actually be 0 liked songs
      return;
    }
    
    const fetchTotal = async () => {
      try {
        // Use limit=1 to minimize data transfer - we only need the total
        const response = await apiFetch<{ total: number }>('/api/liked/tracks?limit=1');
        if (response.total !== undefined) {
          setTotal(response.total);
        }
      } catch {
        // Silent fail - will try again on next visit
      }
    };
    
    fetchTotal();
  }, [total, lastUpdatedAt, setTotal]);
  
  return total;
}
