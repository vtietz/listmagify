/**
 * Unit tests for DnD helper functions
 */

import { describe, it, expect } from 'vitest';
import { getBrowsePanelDragUris, computeAdjustedTargetIndex } from '@/hooks/dnd/helpers';
import type { Track } from '@/lib/spotify/types';

describe('DnD Helpers', () => {
  describe('computeAdjustedTargetIndex', () => {
    const createTrack = (id: string, position: number): Track => ({
      id,
      uri: `spotify:track:${id}`,
      name: `Track ${id}`,
      artists: ['Artist'],
      artistObjects: [{ id: null, name: 'Artist' }],
      durationMs: 180000,
      position,
    });

    it('should return targetIdx when different playlists', () => {
      const ordered = [createTrack('a', 0), createTrack('b', 1), createTrack('c', 2)];
      const dragList = [ordered[0]!];
      
      const result = computeAdjustedTargetIndex(2, dragList, ordered, 'playlist-1', 'playlist-2');
      
      expect(result).toBe(2);
    });

    it('should adjust for single track moved forward', () => {
      // Move track at position 0 to position 2
      // After removing track 0, position 2 becomes position 1
      const ordered = [createTrack('a', 0), createTrack('b', 1), createTrack('c', 2)];
      const dragList = [ordered[0]!];
      
      const result = computeAdjustedTargetIndex(2, dragList, ordered, 'playlist-1', 'playlist-1');
      
      expect(result).toBe(1); // 2 - 1 = 1
    });

    it('should not adjust for single track moved backward', () => {
      // Move track at position 2 to position 0
      // Track 2 is NOT before position 0, so no adjustment
      const ordered = [createTrack('a', 0), createTrack('b', 1), createTrack('c', 2)];
      const dragList = [ordered[2]!];
      
      const result = computeAdjustedTargetIndex(0, dragList, ordered, 'playlist-1', 'playlist-1');
      
      expect(result).toBe(0); // No adjustment
    });

    it('should adjust for multiple tracks moved forward', () => {
      // Move tracks at positions 0,1 to position 3
      // After removing 2 tracks before position 3, it becomes position 1
      const ordered = [createTrack('a', 0), createTrack('b', 1), createTrack('c', 2), createTrack('d', 3)];
      const dragList = [ordered[0]!, ordered[1]!];
      
      const result = computeAdjustedTargetIndex(3, dragList, ordered, 'playlist-1', 'playlist-1');
      
      expect(result).toBe(1); // 3 - 2 = 1
    });

    it('should handle tracks with non-sequential positions (filtered view)', () => {
      // Simulating a filtered view where only some tracks are visible
      // Array indices: [0, 1, 2] but positions: [0, 5, 10]
      const ordered = [
        createTrack('a', 0),
        createTrack('b', 5),
        createTrack('c', 10),
      ];
      // Dragging track at position 0, dropping at position 10
      const dragList = [ordered[0]!];
      
      const result = computeAdjustedTargetIndex(10, dragList, ordered, 'playlist-1', 'playlist-1');
      
      // Position 0 is before position 10, so subtract 1
      expect(result).toBe(9); // 10 - 1 = 9
    });

    it('should handle moving track within gaps (filtered view)', () => {
      // Array indices: [0, 1, 2] but positions: [0, 5, 10]
      const ordered = [
        createTrack('a', 0),
        createTrack('b', 5),
        createTrack('c', 10),
      ];
      // Dragging track at position 5, dropping at position 3
      // Position 5 is NOT before position 3, so no adjustment
      const dragList = [ordered[1]!];
      
      const result = computeAdjustedTargetIndex(3, dragList, ordered, 'playlist-1', 'playlist-1');
      
      expect(result).toBe(3); // No adjustment
    });

    it('should return targetIdx when dragList is empty', () => {
      const ordered = [createTrack('a', 0), createTrack('b', 1)];
      
      const result = computeAdjustedTargetIndex(2, [], ordered, 'playlist-1', 'playlist-1');
      
      expect(result).toBe(2);
    });

    it('should return targetIdx when playlist IDs are null', () => {
      const ordered = [createTrack('a', 0), createTrack('b', 1)];
      const dragList = [ordered[0]!];
      
      const result = computeAdjustedTargetIndex(2, dragList, ordered, null, null);
      
      expect(result).toBe(2);
    });
  });

  describe('getBrowsePanelDragUris', () => {
    const createTrack = (id: string, uri: string): Track => ({
      id,
      uri,
      name: `Track ${id}`,
      artists: ['Artist'],
      artistObjects: [{ id: null, name: 'Artist' }],
      durationMs: 180000,
    });

    it('should return selectedTracks URIs when available', () => {
      const tracks = [
        createTrack('1', 'spotify:track:1'),
        createTrack('2', 'spotify:track:2'),
        createTrack('3', 'spotify:track:3'),
      ];
      const sourceData = { selectedTracks: tracks };
      const fallbackTrack = createTrack('fallback', 'spotify:track:fallback');

      const result = getBrowsePanelDragUris(sourceData, fallbackTrack);

      expect(result).toEqual(['spotify:track:1', 'spotify:track:2', 'spotify:track:3']);
    });

    it('should return fallback track URI when no selection', () => {
      const sourceData = {};
      const fallbackTrack = createTrack('single', 'spotify:track:single');

      const result = getBrowsePanelDragUris(sourceData, fallbackTrack);

      expect(result).toEqual(['spotify:track:single']);
    });

    it('should return fallback track URI when selectedTracks is empty', () => {
      const sourceData = { selectedTracks: [] };
      const fallbackTrack = createTrack('single', 'spotify:track:single');

      const result = getBrowsePanelDragUris(sourceData, fallbackTrack);

      expect(result).toEqual(['spotify:track:single']);
    });

    it('should return empty array when no selection and no fallback', () => {
      const sourceData = {};
      const fallbackTrack = undefined;

      const result = getBrowsePanelDragUris(sourceData, fallbackTrack);

      expect(result).toEqual([]);
    });

    it('should filter out tracks without URIs', () => {
      const tracks = [
        createTrack('1', 'spotify:track:1'),
        { ...createTrack('2', ''), uri: '' }, // Empty URI
        createTrack('3', 'spotify:track:3'),
      ];
      const sourceData = { selectedTracks: tracks };

      const result = getBrowsePanelDragUris(sourceData, undefined);

      expect(result).toEqual(['spotify:track:1', 'spotify:track:3']);
    });

    it('should handle undefined sourceData', () => {
      const fallbackTrack = createTrack('single', 'spotify:track:single');

      const result = getBrowsePanelDragUris(undefined, fallbackTrack);

      expect(result).toEqual(['spotify:track:single']);
    });
  });
});
