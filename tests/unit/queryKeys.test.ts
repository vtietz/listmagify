/**
 * Unit tests for Query Keys utilities
 */

import { describe, it, expect } from 'vitest';
import { playlistTracks, playlistTracksInfinite, playlistMeta, playlistPermissions, userPlaylists } from '@/lib/api/queryKeys';

describe('Query Keys', () => {
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

  describe('playlistTracksInfinite', () => {
    it('should generate query key for infinite playlist tracks', () => {
      const key = playlistTracksInfinite('playlist-infinite-123');
      
      expect(key).toEqual(['playlist-tracks-infinite', 'playlist-infinite-123']);
    });

    it('should generate different keys for different playlists', () => {
      const key1 = playlistTracksInfinite('playlist-1');
      const key2 = playlistTracksInfinite('playlist-2');
      
      expect(key1).not.toEqual(key2);
      expect(key1[1]).not.toBe(key2[1]);
    });

    it('should generate different keys than non-infinite query', () => {
      const infiniteKey = playlistTracksInfinite('playlist-123');
      const regularKey = playlistTracks('playlist-123');
      
      expect(infiniteKey[0]).not.toBe(regularKey[0]);
      expect(infiniteKey[0]).toBe('playlist-tracks-infinite');
      expect(regularKey[0]).toBe('playlist-tracks');
    });
  });
});
