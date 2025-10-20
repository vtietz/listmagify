/**
 * Unit tests for Quick Wins utility modules
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playlistTracks, playlistMeta, playlistPermissions, userPlaylists } from '@/lib/api/queryKeys';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import { isDebug, logDebug } from '@/lib/utils/debug';
import type { Track } from '@/lib/spotify/types';

describe('Query Keys Utilities', () => {
  describe('playlistTracks', () => {
    it('should generate consistent query key for playlist tracks', () => {
      const key = playlistTracks('playlist-123');
      
      expect(key).toEqual(['playlist-tracks', 'playlist-123']);
    });

    it('should generate different keys for different playlists', () => {
      const key1 = playlistTracks('playlist-1');
      const key2 = playlistTracks('playlist-2');
      
      expect(key1).not.toEqual(key2);
      expect(key1[1]).not.toBe(key2[1]);
    });
  });

  describe('playlistMeta', () => {
    it('should generate query key for playlist metadata', () => {
      const key = playlistMeta('playlist-456');
      
      expect(key).toEqual(['playlist', 'playlist-456']);
    });
  });

  describe('playlistPermissions', () => {
    it('should generate query key for playlist permissions', () => {
      const key = playlistPermissions('playlist-789');
      
      expect(key).toEqual(['playlist-permissions', 'playlist-789']);
    });
  });

  describe('userPlaylists', () => {
    it('should generate query key for user playlists', () => {
      const key = userPlaylists();
      
      expect(key).toEqual(['user-playlists']);
    });

    it('should generate same key every time (no parameters)', () => {
      const key1 = userPlaylists();
      const key2 = userPlaylists();
      
      expect(key1).toEqual(key2);
    });
  });
});

describe('DnD ID Utilities', () => {
  describe('makeCompositeId', () => {
    it('should create composite ID from panel and track IDs', () => {
      const compositeId = makeCompositeId('panel-1', 'track-abc123');
      
      expect(compositeId).toBe('panel-1:track-abc123');
    });

    it('should handle different panel IDs with same track ID', () => {
      const compositeId1 = makeCompositeId('panel-1', 'track-xyz');
      const compositeId2 = makeCompositeId('panel-2', 'track-xyz');
      
      expect(compositeId1).toBe('panel-1:track-xyz');
      expect(compositeId2).toBe('panel-2:track-xyz');
      expect(compositeId1).not.toBe(compositeId2);
    });

    it('should handle URIs as track IDs', () => {
      const compositeId = makeCompositeId('panel-1', 'spotify:track:1234567890');
      
      expect(compositeId).toBe('panel-1:spotify:track:1234567890');
    });
  });

  describe('getTrackPosition', () => {
    it('should return track position if available', () => {
      const track: Track = {
        id: 'track-1',
        name: 'Test Track',
        uri: 'spotify:track:1',
        artists: [],
        album: null,
        durationMs: 180000,
        position: 42,
      };
      
      const position = getTrackPosition(track, 10);
      
      expect(position).toBe(42);
    });

    it('should fall back to index if position is undefined', () => {
      const track: Track = {
        id: 'track-2',
        name: 'Test Track 2',
        uri: 'spotify:track:2',
        artists: [],
        album: null,
        durationMs: 180000,
        // position is undefined
      };
      
      const position = getTrackPosition(track, 15);
      
      expect(position).toBe(15);
    });

    it('should fall back to index if position is null', () => {
      const track: Track = {
        id: 'track-3',
        name: 'Test Track 3',
        uri: 'spotify:track:3',
        artists: [],
        album: null,
        durationMs: 180000,
        position: null as any, // Explicitly null
      };
      
      const position = getTrackPosition(track, 20);
      
      expect(position).toBe(20);
    });

    it('should return 0 for position 0', () => {
      const track: Track = {
        id: 'track-4',
        name: 'First Track',
        uri: 'spotify:track:4',
        artists: [],
        album: null,
        durationMs: 180000,
        position: 0,
      };
      
      const position = getTrackPosition(track, 99);
      
      expect(position).toBe(0); // Should return 0, not fall back to index
    });
  });
});

describe('Debug Utilities', () => {
  let originalEnv: string | undefined;
  
  beforeEach(() => {
    // Save original env value
    originalEnv = process.env.NEXT_PUBLIC_DEBUG;
  });

  afterEach(() => {
    // Restore original env value
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DEBUG;
    } else {
      process.env.NEXT_PUBLIC_DEBUG = originalEnv;
    }
  });

  describe('isDebug', () => {
    it('should return true when NEXT_PUBLIC_DEBUG is "true"', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true';
      
      expect(isDebug()).toBe(true);
    });

    it('should return false when NEXT_PUBLIC_DEBUG is not set', () => {
      delete process.env.NEXT_PUBLIC_DEBUG;
      
      expect(isDebug()).toBe(false);
    });

    it('should return false when NEXT_PUBLIC_DEBUG is "false"', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'false';
      
      expect(isDebug()).toBe(false);
    });

    it('should return false for any non-"true" value', () => {
      process.env.NEXT_PUBLIC_DEBUG = '1';
      expect(isDebug()).toBe(false);
      
      process.env.NEXT_PUBLIC_DEBUG = 'yes';
      expect(isDebug()).toBe(false);
    });
  });

  describe('logDebug', () => {
    it('should call console.log when debug is enabled', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logDebug('Test message', { data: 'value' });
      
      expect(consoleSpy).toHaveBeenCalledWith('Test message', { data: 'value' });
      consoleSpy.mockRestore();
    });

    it('should not call console.log when debug is disabled', () => {
      delete process.env.NEXT_PUBLIC_DEBUG;
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logDebug('Test message', { data: 'value' });
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle multiple arguments', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logDebug('Message', 123, true, { obj: 'data' });
      
      expect(consoleSpy).toHaveBeenCalledWith('Message', 123, true, { obj: 'data' });
      consoleSpy.mockRestore();
    });
  });
});
