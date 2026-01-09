/**
 * Unit tests for DnD helper functions
 */

import { describe, it, expect } from 'vitest';
import { getBrowsePanelDragUris } from '@/hooks/dnd/helpers';
import type { Track } from '@/lib/spotify/types';

describe('DnD Helpers', () => {
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
