import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedAudioFeatures,
  setCachedAudioFeatures,
  batchGetCached,
  batchSetCached,
  clearAudioFeaturesCache,
  getCacheStats,
  type AudioFeatures,
} from '@/lib/cache/audioFeaturesCache';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() {
      return Object.keys(store).length;
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

const mockFeatures: AudioFeatures = {
  tempo: 120.5,
  key: 5,
  mode: 1,
  acousticness: 0.25,
  energy: 0.75,
  instrumentalness: 0.01,
  liveness: 0.15,
  valence: 0.65,
};

describe('audioFeaturesCache', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  describe('getCachedAudioFeatures', () => {
    it('should return null for uncached track', () => {
      const result = getCachedAudioFeatures('track123');
      expect(result).toBeNull();
    });

    it('should return cached features for existing track', () => {
      localStorage.setItem('spotify_audio_features_track123', JSON.stringify(mockFeatures));
      const result = getCachedAudioFeatures('track123');
      expect(result).toEqual(mockFeatures);
    });

    it('should return null for invalid JSON', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem('spotify_audio_features_track123', 'invalid json');
      const result = getCachedAudioFeatures('track123');
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      const result = getCachedAudioFeatures('track123');
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('setCachedAudioFeatures', () => {
    it('should cache audio features', () => {
      setCachedAudioFeatures('track123', mockFeatures);
      const cached = localStorage.getItem('spotify_audio_features_track123');
      expect(cached).toBe(JSON.stringify(mockFeatures));
    });

    it('should overwrite existing cache', () => {
      setCachedAudioFeatures('track123', mockFeatures);
      const newFeatures = { ...mockFeatures, tempo: 140 };
      setCachedAudioFeatures('track123', newFeatures);
      const cached = localStorage.getItem('spotify_audio_features_track123');
      expect(cached).toBe(JSON.stringify(newFeatures));
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Storage full');
      });
      setCachedAudioFeatures('track123', mockFeatures);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('batchGetCached', () => {
    it('should return empty map for empty input', () => {
      const result = batchGetCached([]);
      expect(result.size).toBe(0);
    });

    it('should return empty map when no tracks are cached', () => {
      const result = batchGetCached(['track1', 'track2', 'track3']);
      expect(result.size).toBe(0);
    });

    it('should return cached tracks only', () => {
      setCachedAudioFeatures('track1', mockFeatures);
      setCachedAudioFeatures('track3', { ...mockFeatures, tempo: 140 });

      const result = batchGetCached(['track1', 'track2', 'track3']);
      expect(result.size).toBe(2);
      expect(result.get('track1')).toEqual(mockFeatures);
      expect(result.get('track3')).toEqual({ ...mockFeatures, tempo: 140 });
      expect(result.has('track2')).toBe(false);
    });

    it('should handle all tracks cached', () => {
      const features1 = mockFeatures;
      const features2 = { ...mockFeatures, tempo: 130 };
      const features3 = { ...mockFeatures, tempo: 140 };

      setCachedAudioFeatures('track1', features1);
      setCachedAudioFeatures('track2', features2);
      setCachedAudioFeatures('track3', features3);

      const result = batchGetCached(['track1', 'track2', 'track3']);
      expect(result.size).toBe(3);
      expect(result.get('track1')).toEqual(features1);
      expect(result.get('track2')).toEqual(features2);
      expect(result.get('track3')).toEqual(features3);
    });
  });

  describe('batchSetCached', () => {
    it('should cache all features', () => {
      const batch = new Map<string, AudioFeatures>([
        ['track1', mockFeatures],
        ['track2', { ...mockFeatures, tempo: 130 }],
        ['track3', { ...mockFeatures, tempo: 140 }],
      ]);

      batchSetCached(batch);

      expect(getCachedAudioFeatures('track1')).toEqual(mockFeatures);
      expect(getCachedAudioFeatures('track2')).toEqual({ ...mockFeatures, tempo: 130 });
      expect(getCachedAudioFeatures('track3')).toEqual({ ...mockFeatures, tempo: 140 });
    });

    it('should handle empty map', () => {
      batchSetCached(new Map());
      expect(getCacheStats().count).toBe(0);
    });

    it('should overwrite existing cache entries', () => {
      setCachedAudioFeatures('track1', mockFeatures);
      const newFeatures = { ...mockFeatures, tempo: 150 };
      batchSetCached(new Map([['track1', newFeatures]]));
      expect(getCachedAudioFeatures('track1')).toEqual(newFeatures);
    });
  });

  describe('clearAudioFeaturesCache', () => {
    it('should clear all cached audio features', () => {
      setCachedAudioFeatures('track1', mockFeatures);
      setCachedAudioFeatures('track2', mockFeatures);
      setCachedAudioFeatures('track3', mockFeatures);

      clearAudioFeaturesCache();

      expect(getCachedAudioFeatures('track1')).toBeNull();
      expect(getCachedAudioFeatures('track2')).toBeNull();
      expect(getCachedAudioFeatures('track3')).toBeNull();
    });

    it('should not clear other localStorage keys', () => {
      localStorage.setItem('other_key', 'value');
      setCachedAudioFeatures('track1', mockFeatures);

      clearAudioFeaturesCache();

      expect(localStorage.getItem('other_key')).toBe('value');
      expect(getCachedAudioFeatures('track1')).toBeNull();
    });

    it('should handle empty cache', () => {
      expect(() => clearAudioFeaturesCache()).not.toThrow();
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Mock length to trigger error in the try block
      Object.defineProperty(localStorage, 'length', {
        get: () => {
          throw new Error('Storage error');
        },
        configurable: true,
      });
      clearAudioFeaturesCache();
      expect(consoleErrorSpy).toHaveBeenCalled();
      // Restore length property
      Object.defineProperty(localStorage, 'length', {
        get() {
          return Object.keys(localStorageMock).length;
        },
        configurable: true,
      });
    });
  });

  describe('getCacheStats', () => {
    it('should return zero stats for empty cache', () => {
      const stats = getCacheStats();
      expect(stats.count).toBe(0);
      expect(stats.sizeKB).toBe(0);
    });

    it('should count cached entries', () => {
      setCachedAudioFeatures('track1', mockFeatures);
      setCachedAudioFeatures('track2', mockFeatures);
      setCachedAudioFeatures('track3', mockFeatures);

      const stats = getCacheStats();
      expect(stats.count).toBe(3);
      expect(stats.sizeKB).toBeGreaterThan(0);
    });

    it('should not count other localStorage keys', () => {
      localStorage.setItem('other_key', 'value');
      setCachedAudioFeatures('track1', mockFeatures);

      const stats = getCacheStats();
      expect(stats.count).toBe(1);
    });

    it('should calculate size in KB', () => {
      // Cache some features to get measurable size
      setCachedAudioFeatures('track1', mockFeatures);
      setCachedAudioFeatures('track2', mockFeatures);
      setCachedAudioFeatures('track3', mockFeatures);

      const stats = getCacheStats();
      expect(stats.count).toBe(3);
      expect(stats.sizeKB).toBeGreaterThan(0);
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Mock length to trigger error in the try block
      Object.defineProperty(localStorage, 'length', {
        get: () => {
          throw new Error('Storage error');
        },
        configurable: true,
      });
      const stats = getCacheStats();
      expect(stats).toEqual({ count: 0, sizeKB: 0 });
      expect(consoleErrorSpy).toHaveBeenCalled();
      // Restore length property
      Object.defineProperty(localStorage, 'length', {
        get() {
          return Object.keys(localStorageMock).length;
        },
        configurable: true,
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle cache miss → set → get flow', () => {
      // Initial miss
      expect(getCachedAudioFeatures('track1')).toBeNull();

      // Cache it
      setCachedAudioFeatures('track1', mockFeatures);

      // Hit
      const result = getCachedAudioFeatures('track1');
      expect(result).toEqual(mockFeatures);
    });

    it('should handle batch operations', () => {
      // Set initial cache
      setCachedAudioFeatures('track1', mockFeatures);
      setCachedAudioFeatures('track2', { ...mockFeatures, tempo: 130 });

      // Batch get (partial hit)
      const result = batchGetCached(['track1', 'track2', 'track3']);
      expect(result.size).toBe(2);

      // Batch set missing track
      batchSetCached(new Map([['track3', { ...mockFeatures, tempo: 140 }]]));

      // Verify all cached
      const allCached = batchGetCached(['track1', 'track2', 'track3']);
      expect(allCached.size).toBe(3);
    });

    it('should handle cache invalidation', () => {
      // Cache some features
      setCachedAudioFeatures('track1', mockFeatures);
      setCachedAudioFeatures('track2', mockFeatures);

      // Clear and verify
      clearAudioFeaturesCache();
      expect(batchGetCached(['track1', 'track2']).size).toBe(0);
    });
  });
});
