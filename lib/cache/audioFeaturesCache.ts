/**
 * localStorage cache for Spotify Audio Features
 * Caches audio features by track ID with no expiration
 */

const CACHE_KEY_PREFIX = 'spotify_audio_features_';

export interface AudioFeatures {
  tempo: number;
  key: number;
  mode: number;
  acousticness: number;
  energy: number;
  instrumentalness: number;
  liveness: number;
  valence: number;
}

/**
 * Get cached audio features for a single track
 * @param trackId - Spotify track ID
 * @returns Audio features if cached, null otherwise
 */
export function getCachedAudioFeatures(trackId: string): AudioFeatures | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${trackId}`);
    if (!cached) return null;
    
    return JSON.parse(cached) as AudioFeatures;
  } catch (error) {
    console.error(`Failed to read audio features cache for ${trackId}:`, error);
    return null;
  }
}

/**
 * Set cached audio features for a single track
 * @param trackId - Spotify track ID
 * @param features - Audio features to cache
 */
export function setCachedAudioFeatures(trackId: string, features: AudioFeatures): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${trackId}`, JSON.stringify(features));
  } catch (error) {
    console.error(`Failed to cache audio features for ${trackId}:`, error);
  }
}

/**
 * Batch get cached audio features for multiple tracks
 * @param trackIds - Array of Spotify track IDs
 * @returns Map of track ID to audio features (only includes cached tracks)
 */
export function batchGetCached(trackIds: string[]): Map<string, AudioFeatures> {
  const result = new Map<string, AudioFeatures>();
  
  for (const trackId of trackIds) {
    const cached = getCachedAudioFeatures(trackId);
    if (cached) {
      result.set(trackId, cached);
    }
  }
  
  return result;
}

/**
 * Batch set cached audio features for multiple tracks
 * @param features - Map of track ID to audio features
 */
export function batchSetCached(features: Map<string, AudioFeatures>): void {
  for (const [trackId, audioFeatures] of features.entries()) {
    setCachedAudioFeatures(trackId, audioFeatures);
  }
}

/**
 * Clear all cached audio features (useful for debugging/testing)
 */
export function clearAudioFeaturesCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const keys: string[] = [];
    // Collect all keys first (works with both real and mock localStorage)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    // Remove collected keys
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error('Failed to clear audio features cache:', error);
  }
}

/**
 * Get cache statistics (for monitoring/debugging)
 * @returns Number of cached tracks
 */
export function getCacheStats(): { count: number; sizeKB: number } {
  if (typeof window === 'undefined') return { count: 0, sizeKB: 0 };
  
  try {
    let count = 0;
    let totalSize = 0;
    
    // Iterate using localStorage.length (works with both real and mock localStorage)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        count++;
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += key.length + value.length;
        }
      }
    }
    
    return {
      count,
      sizeKB: Math.round((totalSize * 2) / 1024), // UTF-16 encoding
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return { count: 0, sizeKB: 0 };
  }
}
