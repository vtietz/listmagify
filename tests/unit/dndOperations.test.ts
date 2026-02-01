/**
 * Unit tests for DnD operations (pure business logic)
 */

import { describe, it, expect } from 'vitest';
import {
  determineDragTracks,
  determineEffectiveMode,
  shouldAdjustTargetIndex,
  validateDropOperation,
  isBrowsePanelDrop,
  calculateEffectiveTargetIndex,
} from '@/hooks/dnd/operations';
import type { Track } from '@/lib/spotify/types';

describe('DnD Operations', () => {
  const createTrack = (id: string, position: number, uri?: string): Track => ({
    id,
    uri: uri || `spotify:track:${id}`,
    name: `Track ${id}`,
    artists: ['Artist'],
    artistObjects: [{ id: null, name: 'Artist' }],
    durationMs: 180000,
    position,
  });

  describe('determineDragTracks', () => {
    it('should return single track when not in selection', () => {
      const track = createTrack('a', 0);
      const orderedTracks = [track, createTrack('b', 1), createTrack('c', 2)];
      // Use track.id as base (not URI) to match getTrackSelectionKey behavior
      const selection = new Set<string>(['b::1']);

      const result = determineDragTracks(track, 0, selection, orderedTracks);

      expect(result.dragTracks).toEqual([track]);
      expect(result.selectedIndices).toEqual([0]);
    });

    it('should return all selected tracks when dragged track is in selection', () => {
      const trackA = createTrack('a', 0);
      const trackB = createTrack('b', 1);
      const trackC = createTrack('c', 2);
      const orderedTracks = [trackA, trackB, trackC];
      // Use track.id as base (not URI) to match getTrackSelectionKey behavior
      const selection = new Set<string>(['a::0', 'c::2']);

      const result = determineDragTracks(trackA, 0, selection, orderedTracks);

      expect(result.dragTracks).toEqual([trackA, trackC]);
      expect(result.selectedIndices).toEqual([0, 2]);
    });

    it('should return single track when selection is empty', () => {
      const track = createTrack('a', 0);
      const orderedTracks = [track, createTrack('b', 1)];
      const selection = new Set<string>();

      const result = determineDragTracks(track, 0, selection, orderedTracks);

      expect(result.dragTracks).toEqual([track]);
      expect(result.selectedIndices).toEqual([0]);
    });

    it('should handle track at index -1 (not found)', () => {
      const track = createTrack('unknown', 999);
      const orderedTracks = [createTrack('a', 0), createTrack('b', 1)];
      const selection = new Set<string>();

      const result = determineDragTracks(track, -1, selection, orderedTracks);

      expect(result.dragTracks).toEqual([track]);
      expect(result.selectedIndices).toEqual([]);
    });
  });

  describe('determineEffectiveMode', () => {
    it('should return move for same panel same playlist regardless of settings', () => {
      expect(determineEffectiveMode(true, 'copy', false, true)).toBe('move');
      expect(determineEffectiveMode(true, 'copy', true, true)).toBe('move');
      expect(determineEffectiveMode(true, 'move', false, false)).toBe('move');
    });

    it('should respect source mode for cross-panel without Ctrl', () => {
      expect(determineEffectiveMode(false, 'copy', false, true)).toBe('copy');
      expect(determineEffectiveMode(false, 'move', false, true)).toBe('move');
    });

    it('should invert mode when Ctrl pressed and can invert', () => {
      expect(determineEffectiveMode(false, 'copy', true, true)).toBe('move');
      expect(determineEffectiveMode(false, 'move', true, true)).toBe('copy');
    });

    it('should not invert mode when Ctrl pressed but cannot invert', () => {
      expect(determineEffectiveMode(false, 'copy', true, false)).toBe('copy');
      expect(determineEffectiveMode(false, 'move', true, false)).toBe('move');
    });
  });

  describe('shouldAdjustTargetIndex', () => {
    it('should not adjust for single track with computed position', () => {
      expect(shouldAdjustTargetIndex(42, 1)).toBe(false);
    });

    it('should adjust for multiple tracks', () => {
      expect(shouldAdjustTargetIndex(42, 2)).toBe(true);
      expect(shouldAdjustTargetIndex(42, 5)).toBe(true);
    });

    it('should adjust when no computed position (clicked)', () => {
      expect(shouldAdjustTargetIndex(null, 1)).toBe(true);
      expect(shouldAdjustTargetIndex(null, 3)).toBe(true);
    });
  });

  describe('validateDropOperation', () => {
    it('should return error when no over target', () => {
      expect(validateDropOperation({}, {}, null)).toBe('No drop target');
    });

    it('should return error when no source data', () => {
      expect(validateDropOperation(undefined, {}, {})).toBe('Missing source data');
    });

    it('should return error for invalid source type', () => {
      expect(validateDropOperation({ type: 'panel' }, {}, {})).toBe('Invalid source type');
    });

    it('should return error when no target data', () => {
      expect(validateDropOperation({ type: 'track' }, undefined, {})).toBe('Missing target data');
    });

    it('should return error for invalid target type', () => {
      const sourceData = { type: 'track' };
      const targetData = { type: 'invalid' };
      expect(validateDropOperation(sourceData, targetData, {})).toBe('Invalid target type');
    });

    it('should return null for valid track to track', () => {
      const sourceData = { type: 'track' };
      const targetData = { type: 'track' };
      expect(validateDropOperation(sourceData, targetData, {})).toBeNull();
    });

    it('should return null for valid track to panel', () => {
      const sourceData = { type: 'track' };
      const targetData = { type: 'panel' };
      expect(validateDropOperation(sourceData, targetData, {})).toBeNull();
    });

    it('should return null for valid lastfm-track to track', () => {
      const sourceData = { type: 'lastfm-track' };
      const targetData = { type: 'track' };
      expect(validateDropOperation(sourceData, targetData, {})).toBeNull();
    });

    it('should return null for valid track to player', () => {
      const sourceData = { type: 'track' };
      const targetData = { type: 'player' };
      expect(validateDropOperation(sourceData, targetData, {})).toBeNull();
    });
  });

  describe('isBrowsePanelDrop', () => {
    it('should return true when no playlist but has panel', () => {
      expect(isBrowsePanelDrop(null, 'search-panel')).toBe(true);
      expect(isBrowsePanelDrop(undefined, 'recommendations-panel')).toBe(true);
    });

    it('should return false when has playlist', () => {
      expect(isBrowsePanelDrop('playlist-123', 'panel-1')).toBe(false);
    });

    it('should return false when no panel', () => {
      expect(isBrowsePanelDrop(null, null)).toBe(false);
      expect(isBrowsePanelDrop(null, undefined)).toBe(false);
    });
  });

  describe('calculateEffectiveTargetIndex', () => {
    it('should return adjusted index when shouldAdjust is true', () => {
      const targetIndex = 10;
      const computeAdjustment = () => 7;
      
      const result = calculateEffectiveTargetIndex(targetIndex, true, computeAdjustment);
      
      expect(result).toBe(7);
    });

    it('should return target index when shouldAdjust is false', () => {
      const targetIndex = 10;
      const computeAdjustment = () => 7;
      
      const result = calculateEffectiveTargetIndex(targetIndex, false, computeAdjustment);
      
      expect(result).toBe(10);
    });
  });
});
