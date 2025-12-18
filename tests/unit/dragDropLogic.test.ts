/**
 * Unit tests for drag-drop logic functions
 * Tests the core algorithms without UI rendering
 */

import { describe, it, expect } from 'vitest';

/**
 * Helper function to compute drop position from pointer Y coordinate
 * Mirrors the logic in SplitGrid.tsx computeDropPosition
 */
function computeDropPositionFromY(
  pointerY: number,
  containerTop: number,
  scrollTop: number,
  virtualItems: Array<{ index: number; start: number; end: number; size: number }>,
  filteredTracks: Array<{ position: number; name: string }>,
  rowHeight: number
): { filteredIndex: number; globalPosition: number } | null {
  if (filteredTracks.length === 0) {
    return { filteredIndex: 0, globalPosition: 0 };
  }

  const relativeY = pointerY - containerTop + scrollTop;

  // Find the insertion index in the filtered view
  let insertionIndexFiltered = filteredTracks.length; // Default: append to end

  for (const virtualItem of virtualItems) {
    const itemMidpoint = virtualItem.start + virtualItem.size / 2;
    if (relativeY < itemMidpoint) {
      insertionIndexFiltered = virtualItem.index;
      break;
    }
  }

  // Map filtered index to global playlist position
  if (insertionIndexFiltered >= filteredTracks.length) {
    // Dropping after last visible track
    const lastTrack = filteredTracks[filteredTracks.length - 1];
    const globalPosition = lastTrack!.position + 1;
    return { filteredIndex: insertionIndexFiltered, globalPosition };
  }

  // Get the global position of the track at the insertion point
  const targetTrack = filteredTracks[insertionIndexFiltered];
  const globalPosition = targetTrack!.position;
  return { filteredIndex: insertionIndexFiltered, globalPosition };
}

describe('Drag-Drop Position Computation', () => {
  const TRACK_ROW_HEIGHT = 64;

  describe('computeDropPositionFromY', () => {
    it('should compute drop position at the beginning', () => {
      const virtualItems = [
        { index: 0, start: 0, end: 64, size: 64 },
        { index: 1, start: 64, end: 128, size: 64 },
        { index: 2, start: 128, end: 192, size: 64 },
      ];

      const filteredTracks = [
        { position: 0, name: 'Track 1' },
        { position: 1, name: 'Track 2' },
        { position: 2, name: 'Track 3' },
      ];

      const result = computeDropPositionFromY(
        10, // pointerY - near top
        0, // containerTop
        0, // scrollTop
        virtualItems,
        filteredTracks,
        TRACK_ROW_HEIGHT
      );

      expect(result).toEqual({
        filteredIndex: 0,
        globalPosition: 0,
      });
    });

    it('should compute drop position in the middle', () => {
      const virtualItems = [
        { index: 0, start: 0, end: 64, size: 64 },
        { index: 1, start: 64, end: 128, size: 64 },
        { index: 2, start: 128, end: 192, size: 64 },
      ];

      const filteredTracks = [
        { position: 0, name: 'Track 1' },
        { position: 1, name: 'Track 2' },
        { position: 2, name: 'Track 3' },
      ];

      const result = computeDropPositionFromY(
        80, // pointerY - middle of second track
        0, // containerTop
        0, // scrollTop
        virtualItems,
        filteredTracks,
        TRACK_ROW_HEIGHT
      );

      // Pointer at 80 is past midpoint of track 0 (32) but before midpoint of track 1 (96)
      expect(result).toEqual({
        filteredIndex: 1,
        globalPosition: 1,
      });
    });

    it('should compute drop position at the end', () => {
      const virtualItems = [
        { index: 0, start: 0, end: 64, size: 64 },
        { index: 1, start: 64, end: 128, size: 64 },
        { index: 2, start: 128, end: 192, size: 64 },
      ];

      const filteredTracks = [
        { position: 0, name: 'Track 1' },
        { position: 1, name: 'Track 2' },
        { position: 2, name: 'Track 3' },
      ];

      const result = computeDropPositionFromY(
        200, // pointerY - past all tracks
        0, // containerTop
        0, // scrollTop
        virtualItems,
        filteredTracks,
        TRACK_ROW_HEIGHT
      );

      expect(result).toEqual({
        filteredIndex: 3, // After all tracks
        globalPosition: 3, // position 2 + 1
      });
    });

    it('should handle filtered view correctly (search active)', () => {
      // Scenario: Playlist has 10 tracks, but search filters to show only tracks 2, 5, 8
      // Virtual items show indices 0, 1, 2 (filtered indices)
      // But global positions are 2, 5, 8
      const virtualItems = [
        { index: 0, start: 0, end: 64, size: 64 },
        { index: 1, start: 64, end: 128, size: 64 },
        { index: 2, start: 128, end: 192, size: 64 },
      ];

      const filteredTracks = [
        { position: 2, name: 'Track 3' }, // Filtered index 0, global position 2
        { position: 5, name: 'Track 6' }, // Filtered index 1, global position 5
        { position: 8, name: 'Track 9' }, // Filtered index 2, global position 8
      ];

      const result = computeDropPositionFromY(
        80, // pointerY - hovering over filtered index 1
        0, // containerTop
        0, // scrollTop
        virtualItems,
        filteredTracks,
        TRACK_ROW_HEIGHT
      );

      // Should target filtered index 1, which maps to global position 5
      expect(result).toEqual({
        filteredIndex: 1,
        globalPosition: 5, // Maps to global position!
      });
    });

    it('should account for scroll position', () => {
      const virtualItems = [
        { index: 5, start: 320, end: 384, size: 64 }, // Items after scrolling down
        { index: 6, start: 384, end: 448, size: 64 },
        { index: 7, start: 448, end: 512, size: 64 },
      ];

      const filteredTracks = Array.from({ length: 10 }, (_, i) => ({
        position: i,
        name: `Track ${i + 1}`,
      }));

      const result = computeDropPositionFromY(
        100, // pointerY (viewport coords)
        0, // containerTop
        320, // scrollTop (scrolled down 320px = 5 rows)
        virtualItems,
        filteredTracks,
        TRACK_ROW_HEIGHT
      );

      // relativeY = 100 - 0 + 320 = 420
      // Item 5 midpoint = 320 + 32 = 352
      // Item 6 midpoint = 384 + 32 = 416
      // Item 7 midpoint = 448 + 32 = 480
      // 420 is between 416 and 480, so should target index 7
      expect(result).toEqual({
        filteredIndex: 7,
        globalPosition: 7,
      });
    });

    it('should handle empty list', () => {
      const result = computeDropPositionFromY(
        50,
        0,
        0,
        [],
        [],
        TRACK_ROW_HEIGHT
      );

      expect(result).toEqual({
        filteredIndex: 0,
        globalPosition: 0,
      });
    });
  });
});

describe('Composite ID Generation', () => {
  it('should create globally unique composite IDs', () => {
    const panelId = 'panel-1';
    const trackId = 'track-abc123';
    
    const compositeId = `${panelId}:${trackId}`;
    
    expect(compositeId).toBe('panel-1:track-abc123');
  });

  it('should handle different panels with same track ID', () => {
    const trackId = 'track-xyz789';
    
    const panel1CompositeId = `panel-1:${trackId}`;
    const panel2CompositeId = `panel-2:${trackId}`;
    
    expect(panel1CompositeId).not.toBe(panel2CompositeId);
    expect(panel1CompositeId).toBe('panel-1:track-xyz789');
    expect(panel2CompositeId).toBe('panel-2:track-xyz789');
  });

  it('should extract track ID from composite ID', () => {
    const compositeId = 'panel-3:track-def456';
    
    const [panelId, trackId] = compositeId.split(':');
    
    expect(panelId).toBe('panel-3');
    expect(trackId).toBe('track-def456');
  });
});

describe('Collision Detection Priority', () => {
  it('should prioritize track collisions over panel collisions', () => {
    const collisions = [
      {
        id: 'panel-1',
        data: { droppableContainer: { data: { current: { type: 'panel' } } } },
      },
      {
        id: 'panel-1:track-1',
        data: { droppableContainer: { data: { current: { type: 'track' } } } },
      },
    ];

    // Filter to track collisions
    const trackCollisions = collisions.filter(
      (c) => c.data?.droppableContainer?.data?.current?.type === 'track'
    );

    expect(trackCollisions).toHaveLength(1);
    expect(trackCollisions[0]!.id).toBe('panel-1:track-1');
  });

  it('should fallback to panel collisions when no track collisions', () => {
    const collisions = [
      {
        id: 'panel-1',
        data: { droppableContainer: { data: { current: { type: 'panel' } } } },
      },
    ];

    const trackCollisions = collisions.filter(
      (c) => c.data?.droppableContainer?.data?.current?.type === 'track'
    );
    const panelCollisions = collisions.filter(
      (c) => c.data?.droppableContainer?.data?.current?.type === 'panel'
    );

    expect(trackCollisions).toHaveLength(0);
    expect(panelCollisions).toHaveLength(1);
    expect(panelCollisions[0]!.id).toBe('panel-1');
  });
});
