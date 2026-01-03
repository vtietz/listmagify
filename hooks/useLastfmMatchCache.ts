/**
 * useLastfmMatchCache - Manages lazy matching of Last.fm tracks to Spotify
 * 
 * Features:
 * - In-memory cache keyed by "artist::track"
 * - On-demand matching (triggered by selection, drag, or + click)
 * - Batch matching support
 * - Match status tracking (pending, matched, failed)
 */

import { create } from 'zustand';
import { apiFetch } from '@/lib/api/client';
import type { ImportedTrackDTO, MatchResult, SpotifyMatchedTrack } from '@/lib/importers/types';

export type MatchStatus = 'idle' | 'pending' | 'matched' | 'failed';

export interface CachedMatch {
  status: MatchStatus;
  spotifyTrack?: SpotifyMatchedTrack | undefined;
  confidence?: 'high' | 'medium' | 'low' | 'none' | undefined;
  score?: number | undefined;
}

interface MatchCacheState {
  /** Cache of matches keyed by "artist::track" (lowercase, normalized) */
  cache: Map<string, CachedMatch>;
  /** Currently pending match keys */
  pendingKeys: Set<string>;
  
  // Actions
  getMatch: (key: string) => CachedMatch | undefined;
  setMatch: (key: string, match: CachedMatch) => void;
  setPending: (keys: string[]) => void;
  clearPending: (keys: string[]) => void;
  clearCache: () => void;
}

/**
 * Generate cache key from track info
 */
export function makeMatchKey(artistName: string, trackName: string): string {
  return `${artistName.toLowerCase().trim()}::${trackName.toLowerCase().trim()}`;
}

/**
 * Generate cache key from ImportedTrackDTO
 */
export function makeMatchKeyFromDTO(track: ImportedTrackDTO): string {
  return makeMatchKey(track.artistName, track.trackName);
}

export const useMatchCacheStore = create<MatchCacheState>()((set, get) => ({
  cache: new Map(),
  pendingKeys: new Set(),
  
  getMatch: (key) => get().cache.get(key),
  
  setMatch: (key, match) => set((state) => {
    const newCache = new Map(state.cache);
    newCache.set(key, match);
    const newPending = new Set(state.pendingKeys);
    newPending.delete(key);
    return { cache: newCache, pendingKeys: newPending };
  }),
  
  setPending: (keys) => set((state) => {
    const newPending = new Set(state.pendingKeys);
    const newCache = new Map(state.cache);
    for (const key of keys) {
      newPending.add(key);
      // Mark as pending in cache too
      if (!newCache.has(key)) {
        newCache.set(key, { status: 'pending' });
      } else {
        const existing = newCache.get(key)!;
        if (existing.status === 'idle') {
          newCache.set(key, { ...existing, status: 'pending' });
        }
      }
    }
    return { pendingKeys: newPending, cache: newCache };
  }),
  
  clearPending: (keys) => set((state) => {
    const newPending = new Set(state.pendingKeys);
    for (const key of keys) {
      newPending.delete(key);
    }
    return { pendingKeys: newPending };
  }),
  
  clearCache: () => set({ cache: new Map(), pendingKeys: new Set() }),
}));

interface MatchResponse {
  results: MatchResult[];
  matched: number;
  total: number;
}

/**
 * Hook for matching Last.fm tracks to Spotify on-demand
 */
export function useLastfmMatch() {
  const { cache, getMatch, setMatch, setPending, clearPending } = useMatchCacheStore();
  
  /**
   * Match a single track (returns cached result if available)
   */
  const matchTrack = async (track: ImportedTrackDTO): Promise<CachedMatch> => {
    const key = makeMatchKeyFromDTO(track);
    const cached = getMatch(key);
    
    // Return if already matched or currently pending
    if (cached?.status === 'matched' || cached?.status === 'failed') {
      return cached;
    }
    
    // Mark as pending
    setPending([key]);
    
    try {
      const response = await apiFetch<MatchResponse>('/api/lastfm/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: [track], limit: 5 }),
      });
      
      const result = response.results[0];
      if (!result) {
        const match: CachedMatch = { status: 'failed' };
        setMatch(key, match);
        return match;
      }
      
      const match: CachedMatch = {
        status: result.spotifyTrack ? 'matched' : 'failed',
        spotifyTrack: result.spotifyTrack,
        confidence: result.confidence,
        score: result.score,
      };
      
      setMatch(key, match);
      return match;
    } catch (error) {
      console.error('[useLastfmMatch] Match error:', error);
      const match: CachedMatch = { status: 'failed' };
      setMatch(key, match);
      return match;
    }
  };
  
  /**
   * Match multiple tracks in batch
   */
  const matchTracks = async (tracks: ImportedTrackDTO[]): Promise<Map<string, CachedMatch>> => {
    const results = new Map<string, CachedMatch>();
    
    // Separate cached from uncached
    const uncached: ImportedTrackDTO[] = [];
    const uncachedKeys: string[] = [];
    
    for (const track of tracks) {
      const key = makeMatchKeyFromDTO(track);
      const cached = getMatch(key);
      
      if (cached?.status === 'matched' || cached?.status === 'failed') {
        results.set(key, cached);
      } else {
        uncached.push(track);
        uncachedKeys.push(key);
      }
    }
    
    // If all cached, return immediately
    if (uncached.length === 0) {
      return results;
    }
    
    // Mark uncached as pending
    setPending(uncachedKeys);
    
    try {
      // Batch in groups of 20 (API limit)
      const batchSize = 20;
      for (let i = 0; i < uncached.length; i += batchSize) {
        const batch = uncached.slice(i, i + batchSize);
        const batchKeys = uncachedKeys.slice(i, i + batchSize);
        
        try {
          const response = await apiFetch<MatchResponse>('/api/lastfm/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: batch, limit: 5 }),
          });
          
          // Process results
          for (let j = 0; j < response.results.length; j++) {
            const result = response.results[j];
            const key = batchKeys[j];
            if (!result || !key) continue;
            
            const match: CachedMatch = {
              status: result.spotifyTrack ? 'matched' : 'failed',
              spotifyTrack: result.spotifyTrack,
              confidence: result.confidence,
              score: result.score,
            };
            
            setMatch(key, match);
            results.set(key, match);
          }
        } catch (error) {
          console.error('[useLastfmMatch] Batch match error:', error);
          // Mark batch as failed
          for (const key of batchKeys) {
            const match: CachedMatch = { status: 'failed' };
            setMatch(key, match);
            results.set(key, match);
          }
        }
      }
    } finally {
      clearPending(uncachedKeys);
    }
    
    return results;
  };
  
  /**
   * Get cached match status for a track (doesn't trigger fetch)
   */
  const getCachedMatch = (track: ImportedTrackDTO): CachedMatch | undefined => {
    const key = makeMatchKeyFromDTO(track);
    return getMatch(key);
  };
  
  /**
   * Check if a track is currently being matched
   */
  const isPending = (track: ImportedTrackDTO): boolean => {
    const key = makeMatchKeyFromDTO(track);
    const cached = getMatch(key);
    return cached?.status === 'pending';
  };
  
  return {
    cache,
    matchTrack,
    matchTracks,
    getCachedMatch,
    isPending,
  };
}
