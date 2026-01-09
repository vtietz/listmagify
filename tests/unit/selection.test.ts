/**
 * Unit tests for DnD selection utilities
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptySelection,
  getSelectedTrackIds,
  isTrackSelected,
  toggleTrackSelection,
  selectSingleTrack,
  selectMultipleTracks,
  selectTrackRange,
  addToSelection,
  removeFromSelection,
  clearSelection,
  getSelectionCount,
  getNextTrackIndex,
  getTrackSelectionKey,
  parseSelectionKey,
  type SelectionState,
} from '@/lib/dnd/selection';
import type { Track } from '@/lib/spotify/types';

describe('Selection Utilities', () => {
  describe('createEmptySelection', () => {
    it('should create empty selection state', () => {
      const selection = createEmptySelection();
      
      expect(selection.selectedIds.size).toBe(0);
      expect(selection.lastSelectedId).toBeNull();
    });
  });

  describe('getSelectedTrackIds', () => {
    it('should return array of selected IDs', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1', 'track-2', 'track-3']),
        lastSelectedId: 'track-3',
      };
      
      const ids = getSelectedTrackIds(selection);
      
      expect(ids).toHaveLength(3);
      expect(ids).toContain('track-1');
      expect(ids).toContain('track-2');
      expect(ids).toContain('track-3');
    });

    it('should return empty array for empty selection', () => {
      const selection = createEmptySelection();
      const ids = getSelectedTrackIds(selection);
      
      expect(ids).toHaveLength(0);
    });
  });

  describe('isTrackSelected', () => {
    it('should return true for selected track', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1', 'track-2']),
        lastSelectedId: 'track-2',
      };
      
      expect(isTrackSelected(selection, 'track-1')).toBe(true);
      expect(isTrackSelected(selection, 'track-2')).toBe(true);
    });

    it('should return false for unselected track', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1']),
        lastSelectedId: 'track-1',
      };
      
      expect(isTrackSelected(selection, 'track-2')).toBe(false);
    });
  });

  describe('toggleTrackSelection', () => {
    it('should add track if not selected', () => {
      const selection = createEmptySelection();
      const newSelection = toggleTrackSelection(selection, 'track-1');
      
      expect(newSelection.selectedIds.has('track-1')).toBe(true);
      expect(newSelection.lastSelectedId).toBe('track-1');
    });

    it('should remove track if already selected', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1', 'track-2']),
        lastSelectedId: 'track-2',
      };
      
      const newSelection = toggleTrackSelection(selection, 'track-1');
      
      expect(newSelection.selectedIds.has('track-1')).toBe(false);
      expect(newSelection.selectedIds.has('track-2')).toBe(true);
      expect(newSelection.lastSelectedId).toBe('track-2'); // Preserved
    });

    it('should clear lastSelectedId when removing last track', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1']),
        lastSelectedId: 'track-1',
      };
      
      const newSelection = toggleTrackSelection(selection, 'track-1');
      
      expect(newSelection.selectedIds.size).toBe(0);
      expect(newSelection.lastSelectedId).toBeNull();
    });
  });

  describe('selectSingleTrack', () => {
    it('should select only the specified track', () => {
      const newSelection = selectSingleTrack('track-5');
      
      expect(newSelection.selectedIds.size).toBe(1);
      expect(newSelection.selectedIds.has('track-5')).toBe(true);
      expect(newSelection.lastSelectedId).toBe('track-5');
    });

    it('should clear previous selections', () => {
      // Previous selection state (will be cleared)
      
      const newSelection = selectSingleTrack('track-3');
      
      expect(newSelection.selectedIds.size).toBe(1);
      expect(newSelection.selectedIds.has('track-3')).toBe(true);
      expect(newSelection.selectedIds.has('track-1')).toBe(false);
    });
  });

  describe('selectMultipleTracks', () => {
    it('should select multiple tracks', () => {
      const trackIds = ['track-1', 'track-2', 'track-3'];
      const newSelection = selectMultipleTracks(trackIds);
      
      expect(newSelection.selectedIds.size).toBe(3);
      expect(newSelection.selectedIds.has('track-1')).toBe(true);
      expect(newSelection.selectedIds.has('track-2')).toBe(true);
      expect(newSelection.selectedIds.has('track-3')).toBe(true);
      expect(newSelection.lastSelectedId).toBe('track-3');
    });

    it('should handle empty array', () => {
      const newSelection = selectMultipleTracks([]);
      
      expect(newSelection.selectedIds.size).toBe(0);
      expect(newSelection.lastSelectedId).toBeNull();
    });
  });

  describe('selectTrackRange', () => {
    const mockTracks: Track[] = [
      { id: 'track-1', name: 'Track 1', uri: 'spotify:track:1', artists: [], album: null, durationMs: 180000 },
      { id: 'track-2', name: 'Track 2', uri: 'spotify:track:2', artists: [], album: null, durationMs: 180000 },
      { id: 'track-3', name: 'Track 3', uri: 'spotify:track:3', artists: [], album: null, durationMs: 180000 },
      { id: 'track-4', name: 'Track 4', uri: 'spotify:track:4', artists: [], album: null, durationMs: 180000 },
      { id: 'track-5', name: 'Track 5', uri: 'spotify:track:5', artists: [], album: null, durationMs: 180000 },
    ];

    it('should select range from last selected to clicked track (forward)', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1']),
        lastSelectedId: 'track-1',
      };
      
      const newSelection = selectTrackRange(selection, mockTracks, 'track-4');
      
      expect(newSelection.selectedIds.size).toBe(4); // tracks 1-4
      expect(newSelection.selectedIds.has('track-1')).toBe(true);
      expect(newSelection.selectedIds.has('track-2')).toBe(true);
      expect(newSelection.selectedIds.has('track-3')).toBe(true);
      expect(newSelection.selectedIds.has('track-4')).toBe(true);
      expect(newSelection.selectedIds.has('track-5')).toBe(false);
      expect(newSelection.lastSelectedId).toBe('track-4');
    });

    it('getTrackSelectionKey differentiates duplicates by position', () => {
      const track = { id: 't', uri: 't', position: 5 } as any;
      expect(getTrackSelectionKey(track, 0)).toBe('t::5');
      expect(getTrackSelectionKey({ ...track, position: undefined }, 3)).toBe('t::3');
      expect(getTrackSelectionKey({ id: undefined, uri: 'uri' } as any, 2)).toBe('uri::2');
    });

    it('parseSelectionKey parses valid keys', () => {
      expect(parseSelectionKey('abc123::5')).toEqual({ trackId: 'abc123', position: 5 });
      expect(parseSelectionKey('spotify:track:xyz::0')).toEqual({ trackId: 'spotify:track:xyz', position: 0 });
    });

    it('parseSelectionKey returns null for invalid keys', () => {
      expect(parseSelectionKey('invalid')).toBeNull();
      expect(parseSelectionKey('no-position::')).toBeNull();
      expect(parseSelectionKey('::5')).toBeNull();
      expect(parseSelectionKey('')).toBeNull();
      expect(parseSelectionKey('abc::def')).toBeNull(); // position must be a number
    });

    it('should select range from last selected to clicked track (backward)', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-4']),
        lastSelectedId: 'track-4',
      };
      
      const newSelection = selectTrackRange(selection, mockTracks, 'track-2');
      
      expect(newSelection.selectedIds.size).toBe(3); // tracks 2-4
      expect(newSelection.selectedIds.has('track-2')).toBe(true);
      expect(newSelection.selectedIds.has('track-3')).toBe(true);
      expect(newSelection.selectedIds.has('track-4')).toBe(true);
      expect(newSelection.lastSelectedId).toBe('track-2');
    });

    it('should select single track if no last selected', () => {
      const selection = createEmptySelection();
      const newSelection = selectTrackRange(selection, mockTracks, 'track-3');
      
      expect(newSelection.selectedIds.size).toBe(1);
      expect(newSelection.selectedIds.has('track-3')).toBe(true);
      expect(newSelection.lastSelectedId).toBe('track-3');
    });

    it('should select single track if clicked track not found', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1']),
        lastSelectedId: 'track-1',
      };
      
      const newSelection = selectTrackRange(selection, mockTracks, 'track-999');
      
      expect(newSelection.selectedIds.size).toBe(1);
      expect(newSelection.selectedIds.has('track-999')).toBe(true);
    });
  });

  describe('addToSelection', () => {
    it('should add tracks to existing selection', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1', 'track-2']),
        lastSelectedId: 'track-2',
      };
      
      const newSelection = addToSelection(selection, ['track-3', 'track-4']);
      
      expect(newSelection.selectedIds.size).toBe(4);
      expect(newSelection.selectedIds.has('track-1')).toBe(true);
      expect(newSelection.selectedIds.has('track-4')).toBe(true);
      expect(newSelection.lastSelectedId).toBe('track-4');
    });

    it('should handle duplicate IDs gracefully', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1']),
        lastSelectedId: 'track-1',
      };
      
      const newSelection = addToSelection(selection, ['track-1', 'track-2']);
      
      expect(newSelection.selectedIds.size).toBe(2);
      expect(newSelection.lastSelectedId).toBe('track-2');
    });
  });

  describe('removeFromSelection', () => {
    it('should remove tracks from selection', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1', 'track-2', 'track-3']),
        lastSelectedId: 'track-3',
      };
      
      const newSelection = removeFromSelection(selection, ['track-1', 'track-2']);
      
      expect(newSelection.selectedIds.size).toBe(1);
      expect(newSelection.selectedIds.has('track-3')).toBe(true);
      expect(newSelection.lastSelectedId).toBe('track-3');
    });

    it('should clear lastSelectedId when removing all tracks', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1', 'track-2']),
        lastSelectedId: 'track-2',
      };
      
      const newSelection = removeFromSelection(selection, ['track-1', 'track-2']);
      
      expect(newSelection.selectedIds.size).toBe(0);
      expect(newSelection.lastSelectedId).toBeNull();
    });
  });

  describe('clearSelection', () => {
    it('should clear all selections', () => {
      const newSelection = clearSelection();
      
      expect(newSelection.selectedIds.size).toBe(0);
      expect(newSelection.lastSelectedId).toBeNull();
    });
  });

  describe('getSelectionCount', () => {
    it('should return number of selected tracks', () => {
      const selection: SelectionState = {
        selectedIds: new Set(['track-1', 'track-2', 'track-3']),
        lastSelectedId: 'track-3',
      };
      
      expect(getSelectionCount(selection)).toBe(3);
    });

    it('should return 0 for empty selection', () => {
      const selection = createEmptySelection();
      expect(getSelectionCount(selection)).toBe(0);
    });
  });

  describe('getNextTrackIndex', () => {
    const mockTracks: Track[] = [
      { id: 'track-1', name: 'Track 1', uri: 'spotify:track:1', artists: [], album: null, durationMs: 180000 },
      { id: 'track-2', name: 'Track 2', uri: 'spotify:track:2', artists: [], album: null, durationMs: 180000 },
      { id: 'track-3', name: 'Track 3', uri: 'spotify:track:3', artists: [], album: null, durationMs: 180000 },
    ];

    it('should return -1 when there are no tracks', () => {
      expect(getNextTrackIndex([], new Set(), 1)).toBe(-1);
    });

    it('should start at index 0 when nothing is selected', () => {
      expect(getNextTrackIndex(mockTracks, new Set(), 1)).toBe(0);
      expect(getNextTrackIndex(mockTracks, new Set(), -1)).toBe(0);
    });

    it('should move forward from the current selection', () => {
      const selection = new Set<string>(['track-1']);
      expect(getNextTrackIndex(mockTracks, selection, 1)).toBe(1);
    });

    it('should clamp to the last index when moving past the end', () => {
      const selection = new Set<string>(['track-3']);
      expect(getNextTrackIndex(mockTracks, selection, 1)).toBe(2);
    });

    it('should clamp to the first index when moving above the start', () => {
      const selection = new Set<string>(['track-1']);
      expect(getNextTrackIndex(mockTracks, selection, -1)).toBe(0);
    });

    it('should use fromIndex if provided', () => {
      const selection = new Set<string>(['track-1']);
      // Even though track-1 is selected (index 0), we say we are at index 1
      expect(getNextTrackIndex(mockTracks, selection, 1, 1)).toBe(2);
    });
  });
});
