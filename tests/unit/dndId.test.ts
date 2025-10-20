/**
 * Unit tests for DnD ID utilities
 */

import { describe, it, expect } from 'vitest';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import type { Track } from '@/lib/spotify/types';

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
