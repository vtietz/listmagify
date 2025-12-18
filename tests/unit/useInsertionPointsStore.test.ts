/**
 * Unit tests for useInsertionPointsStore - insertion point markers for playlists.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';

describe('useInsertionPointsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useInsertionPointsStore.setState({ playlists: {} });
  });

  describe('markPoint', () => {
    it('should add a marker at the specified index', () => {
      const { markPoint, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      
      const markers = getMarkers('playlist-1');
      expect(markers).toHaveLength(1);
      expect(markers[0]!.index).toBe(5);
      expect(markers[0]!.markerId).toBeDefined();
      expect(markers[0]!.createdAt).toBeDefined();
    });

    it('should be idempotent - no duplicates for same index', () => {
      const { markPoint, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      markPoint('playlist-1', 5);
      markPoint('playlist-1', 5);
      
      const markers = getMarkers('playlist-1');
      expect(markers).toHaveLength(1);
    });

    it('should keep markers sorted by index', () => {
      const { markPoint, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 10);
      markPoint('playlist-1', 3);
      markPoint('playlist-1', 7);
      markPoint('playlist-1', 1);
      
      const markers = getMarkers('playlist-1');
      expect(markers.map(m => m.index)).toEqual([1, 3, 7, 10]);
    });

    it('should handle multiple playlists independently', () => {
      const { markPoint, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      markPoint('playlist-2', 10);
      
      expect(getMarkers('playlist-1').map(m => m.index)).toEqual([5]);
      expect(getMarkers('playlist-2').map(m => m.index)).toEqual([10]);
    });
  });

  describe('unmarkPoint', () => {
    it('should remove a marker at the specified index', () => {
      const { markPoint, unmarkPoint, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      markPoint('playlist-1', 10);
      unmarkPoint('playlist-1', 5);
      
      const markers = getMarkers('playlist-1');
      expect(markers).toHaveLength(1);
      expect(markers[0]!.index).toBe(10);
    });

    it('should be safe to call on non-existent marker', () => {
      const { unmarkPoint, getMarkers } = useInsertionPointsStore.getState();
      
      unmarkPoint('playlist-1', 999);
      
      expect(getMarkers('playlist-1')).toEqual([]);
    });

    it('should be safe to call on non-existent playlist', () => {
      const { unmarkPoint, getMarkers } = useInsertionPointsStore.getState();
      
      unmarkPoint('nonexistent', 5);
      
      expect(getMarkers('nonexistent')).toEqual([]);
    });
  });

  describe('togglePoint', () => {
    it('should add marker if not present', () => {
      const { togglePoint, hasMarkerAt } = useInsertionPointsStore.getState();
      
      expect(hasMarkerAt('playlist-1', 5)).toBe(false);
      togglePoint('playlist-1', 5);
      expect(hasMarkerAt('playlist-1', 5)).toBe(true);
    });

    it('should remove marker if present', () => {
      const { markPoint, togglePoint, hasMarkerAt } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      expect(hasMarkerAt('playlist-1', 5)).toBe(true);
      
      togglePoint('playlist-1', 5);
      expect(hasMarkerAt('playlist-1', 5)).toBe(false);
    });
  });

  describe('clearPlaylist', () => {
    it('should remove all markers for a specific playlist', () => {
      const { markPoint, clearPlaylist, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 1);
      markPoint('playlist-1', 5);
      markPoint('playlist-1', 10);
      markPoint('playlist-2', 3);
      
      clearPlaylist('playlist-1');
      
      expect(getMarkers('playlist-1')).toEqual([]);
      expect(getMarkers('playlist-2')).toHaveLength(1);
    });

    it('should be safe to call on non-existent playlist', () => {
      const { clearPlaylist, getMarkers } = useInsertionPointsStore.getState();
      
      clearPlaylist('nonexistent');
      
      expect(getMarkers('nonexistent')).toEqual([]);
    });
  });

  describe('clearAll', () => {
    it('should remove all markers across all playlists', () => {
      const { markPoint, clearAll, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 1);
      markPoint('playlist-2', 5);
      markPoint('playlist-3', 10);
      
      clearAll();
      
      expect(getMarkers('playlist-1')).toEqual([]);
      expect(getMarkers('playlist-2')).toEqual([]);
      expect(getMarkers('playlist-3')).toEqual([]);
    });
  });

  describe('hasActiveMarkers', () => {
    it('should return false when no markers exist', () => {
      const { hasActiveMarkers } = useInsertionPointsStore.getState();
      
      expect(hasActiveMarkers()).toBe(false);
    });

    it('should return true when markers exist', () => {
      const { markPoint, hasActiveMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      
      expect(hasActiveMarkers()).toBe(true);
    });
  });

  describe('hasMarkerAt', () => {
    it('should return true if marker exists at index', () => {
      const { markPoint, hasMarkerAt } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      
      expect(hasMarkerAt('playlist-1', 5)).toBe(true);
    });

    it('should return false if no marker at index', () => {
      const { markPoint, hasMarkerAt } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      
      expect(hasMarkerAt('playlist-1', 10)).toBe(false);
    });

    it('should return false for non-existent playlist', () => {
      const { hasMarkerAt } = useInsertionPointsStore.getState();
      
      expect(hasMarkerAt('nonexistent', 5)).toBe(false);
    });
  });

  describe('adjustIndices', () => {
    it('should increase indices when delta is positive', () => {
      const { markPoint, adjustIndices, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      markPoint('playlist-1', 10);
      
      adjustIndices('playlist-1', 3, 2); // Insert 2 items at index 3
      
      const markers = getMarkers('playlist-1');
      expect(markers.map(m => m.index)).toEqual([7, 12]);
    });

    it('should decrease indices when delta is negative', () => {
      const { markPoint, adjustIndices, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 5);
      markPoint('playlist-1', 10);
      
      adjustIndices('playlist-1', 3, -2); // Remove 2 items at index 3
      
      const markers = getMarkers('playlist-1');
      expect(markers.map(m => m.index)).toEqual([3, 8]);
    });

    it('should only affect markers at or after changeIndex', () => {
      const { markPoint, adjustIndices, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 2);
      markPoint('playlist-1', 5);
      markPoint('playlist-1', 10);
      
      adjustIndices('playlist-1', 4, 3); // Insert 3 items at index 4
      
      const markers = getMarkers('playlist-1');
      expect(markers.map(m => m.index)).toEqual([2, 8, 13]); // 2 unchanged, 5->8, 10->13
    });

    it('should remove markers that would go negative', () => {
      const { markPoint, adjustIndices, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 1);
      
      adjustIndices('playlist-1', 0, -5);
      
      // Marker at index 1 with -5 delta would be -4, so it's removed
      const markers = getMarkers('playlist-1');
      expect(markers).toEqual([]);
    });
  });

  describe('incrementIndicesFrom', () => {
    it('should increment indices at or after specified index', () => {
      const { markPoint, incrementIndicesFrom, getMarkers } = useInsertionPointsStore.getState();
      
      markPoint('playlist-1', 2);
      markPoint('playlist-1', 5);
      markPoint('playlist-1', 10);
      
      incrementIndicesFrom('playlist-1', 5, 3); // Increment from index 5 by 3
      
      const markers = getMarkers('playlist-1');
      expect(markers.map(m => m.index)).toEqual([2, 8, 13]); // 2 unchanged, 5->8, 10->13
    });
  });
});

describe('computeInsertionPositions', () => {
  it('should return empty array for empty input', () => {
    const result = computeInsertionPositions([], 1);
    expect(result).toEqual([]);
  });

  it('should adjust indices cumulatively when inserting 1 track at each position', () => {
    // Create mock markers
    const markers = [
      { markerId: 'm1', index: 2, createdAt: Date.now() },
      { markerId: 'm2', index: 5, createdAt: Date.now() },
      { markerId: 'm3', index: 8, createdAt: Date.now() },
    ];
    
    const result = computeInsertionPositions(markers, 1);
    
    // Each insert shifts subsequent positions by 1
    // First: effectiveIndex = 2 + 0 = 2
    // Second: effectiveIndex = 5 + 1 = 6
    // Third: effectiveIndex = 8 + 2 = 10
    expect(result.map(r => r.effectiveIndex)).toEqual([2, 6, 10]);
    expect(result.map(r => r.originalIndex)).toEqual([2, 5, 8]);
  });

  it('should handle single position', () => {
    const markers = [{ markerId: 'm1', index: 5, createdAt: Date.now() }];
    const result = computeInsertionPositions(markers, 1);
    
    expect(result.map(r => r.effectiveIndex)).toEqual([5]);
  });

  it('should handle adjacent positions', () => {
    const markers = [
      { markerId: 'm1', index: 3, createdAt: Date.now() },
      { markerId: 'm2', index: 4, createdAt: Date.now() },
      { markerId: 'm3', index: 5, createdAt: Date.now() },
    ];
    
    const result = computeInsertionPositions(markers, 1);
    
    // After insert at 3: 3, 5, 6
    // After insert at 5: 3, 5, 7
    // After insert at 7: 3, 5, 7
    expect(result.map(r => r.effectiveIndex)).toEqual([3, 5, 7]);
  });

  it('should scale with trackCount', () => {
    const markers = [
      { markerId: 'm1', index: 0, createdAt: Date.now() },
      { markerId: 'm2', index: 2, createdAt: Date.now() },
    ];
    
    // Insert 3 tracks at each position
    const result = computeInsertionPositions(markers, 3);
    
    // First: effectiveIndex = 0 + 0 = 0
    // Second: effectiveIndex = 2 + 3 = 5
    expect(result.map(r => r.effectiveIndex)).toEqual([0, 5]);
  });
});

describe('shiftAfterMultiInsert', () => {
  beforeEach(() => {
    useInsertionPointsStore.setState({ playlists: {} });
  });

  it('should shift each marker by its position + 1', () => {
    const { markPoint, getMarkers, shiftAfterMultiInsert } = useInsertionPointsStore.getState();
    
    // Set up markers at indices 2 and 5
    markPoint('playlist-1', 2);
    markPoint('playlist-1', 5);
    
    // After inserting 1 track at each marker:
    // - marker[0] at index 2 shifts by 1 (to 3)
    // - marker[1] at index 5 shifts by 2 (to 7)
    shiftAfterMultiInsert('playlist-1');
    
    const markers = getMarkers('playlist-1');
    expect(markers.map(m => m.index)).toEqual([3, 7]);
  });

  it('should shift single marker by 1', () => {
    const { markPoint, getMarkers, shiftAfterMultiInsert } = useInsertionPointsStore.getState();
    
    markPoint('playlist-1', 10);
    shiftAfterMultiInsert('playlist-1');
    
    const markers = getMarkers('playlist-1');
    expect(markers.map(m => m.index)).toEqual([11]);
  });

  it('should handle three markers correctly', () => {
    const { markPoint, getMarkers, shiftAfterMultiInsert } = useInsertionPointsStore.getState();
    
    // Markers at 0, 5, 10
    markPoint('playlist-1', 0);
    markPoint('playlist-1', 5);
    markPoint('playlist-1', 10);
    
    // After shift:
    // - marker[0] at 0 shifts by 1 → 1
    // - marker[1] at 5 shifts by 2 → 7
    // - marker[2] at 10 shifts by 3 → 13
    shiftAfterMultiInsert('playlist-1');
    
    const markers = getMarkers('playlist-1');
    expect(markers.map(m => m.index)).toEqual([1, 7, 13]);
  });

  it('should do nothing for empty playlist', () => {
    const { getMarkers, shiftAfterMultiInsert } = useInsertionPointsStore.getState();
    
    shiftAfterMultiInsert('non-existent');
    
    expect(getMarkers('non-existent')).toEqual([]);
  });

  it('should not affect other playlists', () => {
    const { markPoint, getMarkers, shiftAfterMultiInsert } = useInsertionPointsStore.getState();
    
    markPoint('playlist-1', 5);
    markPoint('playlist-2', 5);
    
    shiftAfterMultiInsert('playlist-1');
    
    expect(getMarkers('playlist-1').map(m => m.index)).toEqual([6]);
    expect(getMarkers('playlist-2').map(m => m.index)).toEqual([5]); // Unchanged
  });
});
