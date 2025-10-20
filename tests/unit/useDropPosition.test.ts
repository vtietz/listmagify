/**
 * Unit tests for useDropPosition hook and calculateDropPosition utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { calculateDropPosition } from '@/hooks/useDropPosition';
import type { Track } from '@/lib/spotify/types';

// Mock virtualizer items
function createMockVirtualItems(count: number, rowHeight: number) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    start: i * rowHeight,
    end: (i + 1) * rowHeight,
    size: rowHeight,
    key: i,
    lane: 0,
  }));
}

// Mock tracks
function createMockTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `track-${i}`,
    name: `Track ${i + 1}`,
    uri: `spotify:track:${i}`,
    artists: [`Artist ${i + 1}`],
    album: { name: `Album ${i + 1}`, uri: `spotify:album:${i}` },
    durationMs: 180000,
    position: i,
  }));
}

// Mock HTML container element
function createMockContainer(top: number, scrollTop: number) {
  return {
    getBoundingClientRect: () => ({ top, left: 0, right: 800, bottom: 600, width: 800, height: 600 }),
    scrollTop,
  } as HTMLElement;
}

// Mock virtualizer
function createMockVirtualizer(items: any[]) {
  return {
    getVirtualItems: () => items,
  } as any;
}

describe('calculateDropPosition', () => {
  const ROW_HEIGHT = 60;

  describe('basic drop position calculation', () => {
    it('should calculate drop at beginning of list', () => {
      const container = createMockContainer(100, 0);
      const virtualItems = createMockVirtualItems(5, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      const tracks = createMockTracks(5);
      
      // Pointer at Y=110 (10px below container top)
      const result = calculateDropPosition(container, virtualizer, tracks, 110);
      
      expect(result).toEqual({
        filteredIndex: 0,
        globalPosition: 0,
      });
    });

    it('should calculate drop in middle of list', () => {
      const container = createMockContainer(100, 0);
      const virtualItems = createMockVirtualItems(5, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      const tracks = createMockTracks(5);
      
      // Pointer at Y=190 (90px from container top, past midpoint of track 1)
      const result = calculateDropPosition(container, virtualizer, tracks, 190);
      
      // relativeY = 190 - 100 + 0 = 90
      // Track 0: start=0, midpoint=30 (90 > 30, skip)
      // Track 1: start=60, midpoint=90 (90 == 90, close to boundary, skip)
      // Track 2: start=120, midpoint=150 (90 < 150, insert at index 2)
      expect(result?.filteredIndex).toBe(2);
      expect(result?.globalPosition).toBe(2);
    });

    it('should calculate drop at end of list', () => {
      const container = createMockContainer(100, 0);
      const virtualItems = createMockVirtualItems(5, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      const tracks = createMockTracks(5);
      
      // Pointer at Y=500 (400px from container top, past all tracks)
      const result = calculateDropPosition(container, virtualizer, tracks, 500);
      
      expect(result).toEqual({
        filteredIndex: 5, // After all tracks
        globalPosition: 5, // position 4 + 1
      });
    });
  });

  describe('filtered view handling', () => {
    it('should map filtered index to global position correctly', () => {
      const container = createMockContainer(100, 0);
      
      // Simulate search filtering: only show tracks at global positions 2, 5, 8
      const filteredTracks: Track[] = [
        { id: 'track-2', name: 'Track 3', uri: 'spotify:track:2', artists: [], album: null, durationMs: 180000, position: 2 },
        { id: 'track-5', name: 'Track 6', uri: 'spotify:track:5', artists: [], album: null, durationMs: 180000, position: 5 },
        { id: 'track-8', name: 'Track 9', uri: 'spotify:track:8', artists: [], album: null, durationMs: 180000, position: 8 },
      ];
      
      const virtualItems = createMockVirtualItems(3, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      
      // Pointer at Y=190 (90px from container top)
      // relativeY = 190 - 100 + 0 = 90
      // Track 0: start=0, midpoint=30 (90 > 30, skip)
      // Track 1: start=60, midpoint=90 (90 >= 90, skip)
      // Track 2: start=120, midpoint=150 (90 < 150, insert at index 2)
      const result = calculateDropPosition(container, virtualizer, filteredTracks, 190);
      
      expect(result).toEqual({
        filteredIndex: 2,
        globalPosition: 8, // Maps to global position 8 (filteredTracks[2].position)
      });
    });

    it('should handle dropping after last filtered track', () => {
      const container = createMockContainer(100, 0);
      
      const filteredTracks: Track[] = [
        { id: 'track-0', name: 'Track 1', uri: 'spotify:track:0', artists: [], album: null, durationMs: 180000, position: 0 },
        { id: 'track-5', name: 'Track 6', uri: 'spotify:track:5', artists: [], album: null, durationMs: 180000, position: 5 },
      ];
      
      const virtualItems = createMockVirtualItems(2, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      
      // Pointer past all visible tracks
      const result = calculateDropPosition(container, virtualizer, filteredTracks, 500);
      
      expect(result).toEqual({
        filteredIndex: 2,
        globalPosition: 6, // position 5 + 1
      });
    });
  });

  describe('scroll handling', () => {
    it('should account for scroll position', () => {
      const container = createMockContainer(100, 300); // Scrolled down 300px (5 rows)
      
      // Virtual items show tracks 5-9 after scrolling
      const virtualItems = [
        { index: 5, start: 300, end: 360, size: 60, key: 5, lane: 0 },
        { index: 6, start: 360, end: 420, size: 60, key: 6, lane: 0 },
        { index: 7, start: 420, end: 480, size: 60, key: 7, lane: 0 },
        { index: 8, start: 480, end: 540, size: 60, key: 8, lane: 0 },
        { index: 9, start: 540, end: 600, size: 60, key: 9, lane: 0 },
      ];
      const virtualizer = createMockVirtualizer(virtualItems);
      const tracks = createMockTracks(15);
      
      // Pointer at Y=200 (viewport coords)
      // relativeY = 200 - 100 + 300 = 400
      const result = calculateDropPosition(container, virtualizer, tracks, 200);
      
      // Track 5: start=300, midpoint=330 (400 > 330, skip)
      // Track 6: start=360, midpoint=390 (400 > 390, skip)
      // Track 7: start=420, midpoint=450 (400 < 450, insert at index 7)
      expect(result?.filteredIndex).toBe(7);
      expect(result?.globalPosition).toBe(7);
    });
  });

  describe('edge cases', () => {
    it('should handle empty track list', () => {
      const container = createMockContainer(100, 0);
      const virtualizer = createMockVirtualizer([]);
      
      const result = calculateDropPosition(container, virtualizer, [], 150);
      
      expect(result).toEqual({
        filteredIndex: 0,
        globalPosition: 0,
      });
    });

    it('should handle single track', () => {
      const container = createMockContainer(100, 0);
      const virtualItems = createMockVirtualItems(1, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      const tracks = createMockTracks(1);
      
      // Pointer before midpoint
      const result1 = calculateDropPosition(container, virtualizer, tracks, 120);
      expect(result1?.filteredIndex).toBe(0);
      
      // Pointer after midpoint
      const result2 = calculateDropPosition(container, virtualizer, tracks, 140);
      expect(result2?.filteredIndex).toBe(1);
      expect(result2?.globalPosition).toBe(1);
    });

    it('should handle tracks without position property', () => {
      const container = createMockContainer(100, 0);
      const virtualItems = createMockVirtualItems(3, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      
      // Tracks without explicit position - should use index as fallback
      const tracks: Track[] = [
        { id: 'track-0', name: 'Track 1', uri: 'spotify:track:0', artists: [], album: null, durationMs: 180000 },
        { id: 'track-1', name: 'Track 2', uri: 'spotify:track:1', artists: [], album: null, durationMs: 180000 },
        { id: 'track-2', name: 'Track 3', uri: 'spotify:track:2', artists: [], album: null, durationMs: 180000 },
      ];
      
      const result = calculateDropPosition(container, virtualizer, tracks, 190);
      
      // Should fall back to using filtered index as global position
      expect(result?.filteredIndex).toBe(2);
      expect(result?.globalPosition).toBe(2);
    });
  });

  describe('precision and midpoint detection', () => {
    it('should use midpoint for drop decision', () => {
      const container = createMockContainer(0, 0);
      const virtualItems = createMockVirtualItems(3, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      const tracks = createMockTracks(3);
      
      // Track 0: 0-60, midpoint at 30
      // Pointer at 29 should drop at index 0
      const result1 = calculateDropPosition(container, virtualizer, tracks, 29);
      expect(result1?.filteredIndex).toBe(0);
      
      // Pointer at 31 should drop at index 1 (past midpoint of track 0)
      const result2 = calculateDropPosition(container, virtualizer, tracks, 31);
      expect(result2?.filteredIndex).toBe(1);
    });

    it('should handle pointer exactly at midpoint', () => {
      const container = createMockContainer(0, 0);
      const virtualItems = createMockVirtualItems(2, ROW_HEIGHT);
      const virtualizer = createMockVirtualizer(virtualItems);
      const tracks = createMockTracks(2);
      
      // Pointer exactly at midpoint of track 0 (30)
      const result = calculateDropPosition(container, virtualizer, tracks, 30);
      
      // Should insert at index 1 (after current track)
      expect(result?.filteredIndex).toBe(1);
    });
  });
});
