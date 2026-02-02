/**
 * Unit tests for dropIntent computation
 *
 * Tests the core drop position logic including:
 * - Multi-select overlay height adjustment
 * - Exclusion of dragged tracks from targeting
 * - Correct mapping from filtered indices to global positions
 */

import { describe, it, expect } from 'vitest';
import { computeDropIntent, type DropIntentInput } from '@/hooks/dnd/dropIntent';
import type { Track } from '@/lib/spotify/types';

// Helper to create mock tracks
function createTrack(id: string, position: number, name?: string): Track {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: name ?? `Track ${id}`,
    artists: ['Artist'],
    artistObjects: [{ id: null, name: 'Artist' }],
    durationMs: 180000,
    position,
  };
}

// Helper to create mock virtual items
function createVirtualItems(count: number, rowHeight: number) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    start: i * rowHeight,
    size: rowHeight,
  }));
}

describe('computeDropIntent', () => {
  const ROW_HEIGHT = 60;
  const CONTAINER_TOP = 100;
  const HEADER_OFFSET = 40;

  describe('Multi-select overlay height adjustment', () => {
    it('should adjust drop position for single track (dragCount=1)', () => {
      const tracks = [
        createTrack('a', 0, 'Track A'),
        createTrack('b', 1, 'Track B'),
        createTrack('c', 2, 'Track C'),
      ];

      const input: DropIntentInput = {
        pointerY: 190, // 90px from container top
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(3, ROW_HEIGHT),
        filteredTracks: tracks,
        draggedTrackPositions: [],
        dragCount: 1,
      };

      const result = computeDropIntent(input);

      // relativeY = 190 - 100 + 0 - 40 = 50
      // overlayOffset = 0 (single track)
      // adjustedY = 50 - 30 - 0 = 20
      // Track 0 midpoint = 30 (20 < 30, insert at 0)
      expect(result.insertionIndexFiltered).toBe(0);
      expect(result.insertBeforeGlobal).toBe(0);
    });

    it('should adjust drop position for 3-track selection (dragCount=3)', () => {
      const tracks = [
        createTrack('a', 0, 'Track A'),
        createTrack('b', 1, 'Track B'),
        createTrack('c', 2, 'Track C'),
        createTrack('d', 3, 'Track D'),
        createTrack('e', 4, 'Track E'),
      ];

      const input: DropIntentInput = {
        pointerY: 190, // Same pointer position as single track test
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(5, ROW_HEIGHT),
        filteredTracks: tracks,
        draggedTrackPositions: [],
        dragCount: 3, // Multi-select!
      };

      const result = computeDropIntent(input);

      // relativeY = 190 - 100 + 0 - 40 = 50
      // overlayOffset = (3-1) * 60/2 = 60
      // adjustedY = 50 - 30 - 60 = -40 (negative, before all tracks)
      // Should insert at beginning
      expect(result.insertionIndexFiltered).toBe(0);
      expect(result.insertBeforeGlobal).toBe(0);
    });

    it('should place 3-track selection lower than single track with same pointer Y', () => {
      const tracks = Array.from({ length: 10 }, (_, i) => createTrack(`track-${i}`, i));

      const pointerY = 280; // Fixed pointer position

      // Single track
      const singleResult = computeDropIntent({
        pointerY,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(10, ROW_HEIGHT),
        filteredTracks: tracks,
        draggedTrackPositions: [],
        dragCount: 1,
      });

      // 3-track selection
      const multiResult = computeDropIntent({
        pointerY,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(10, ROW_HEIGHT),
        filteredTracks: tracks,
        draggedTrackPositions: [],
        dragCount: 3,
      });

      // Multi-select should insert earlier (lower index) due to taller overlay
      expect(multiResult.insertionIndexFiltered).toBeLessThan(singleResult.insertionIndexFiltered);
    });
  });

  describe('Exclusion of dragged tracks', () => {
    it('should skip dragged track when computing insertBeforeGlobal', () => {
      const tracks = [
        createTrack('a', 0, 'Track A'),
        createTrack('b', 1, 'Track B'), // Being dragged
        createTrack('c', 2, 'Track C'), // Being dragged
        createTrack('d', 3, 'Track D'),
        createTrack('e', 4, 'Track E'),
      ];

      // Pointer positioned to drop at filtered index 1 (over Track B which is being dragged)
      // pointerY = containerTop + headerOffset + row1_middle = 100 + 40 + 90 = 230
      const input: DropIntentInput = {
        pointerY: 230,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(5, ROW_HEIGHT),
        filteredTracks: tracks,
        draggedTrackPositions: [1, 2], // Tracks B and C are dragged
        dragCount: 2,
      };

      const result = computeDropIntent(input);

      // relativeY = 230 - 100 + 0 - 40 = 90
      // overlayOffset = (2-1) * 60/2 = 30
      // adjustedY = 90 - 30 - 30 = 30
      // Track 0 midpoint = 30 (30 >= 30, so continue to next)
      // Track 1 midpoint = 90 (30 < 90, insert at filtered index 1)
      // Track at index 1 has position 1, which IS dragged, so skip to index 2
      // Track at index 2 has position 2, which IS dragged, so skip to index 3
      // Track at index 3 has position 3, which is NOT dragged - use it!
      expect(result.insertBeforeGlobal).toBe(3); // Track D's position, not Track B's
    });

    it('should use position after last track if all remaining tracks are dragged', () => {
      const tracks = [
        createTrack('a', 0, 'Track A'),
        createTrack('b', 1, 'Track B'),
        createTrack('c', 2, 'Track C'), // Being dragged
        createTrack('d', 3, 'Track D'), // Being dragged
      ];

      // Pointer positioned to drop at filtered index 2 (over dragged track C)
      // pointerY = containerTop + headerOffset + row2_middle = 100 + 40 + 150 = 290
      const input: DropIntentInput = {
        pointerY: 290,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(4, ROW_HEIGHT),
        filteredTracks: tracks,
        draggedTrackPositions: [2, 3], // Last two tracks are dragged
        dragCount: 2,
      };

      const result = computeDropIntent(input);

      // Should use position after last track (3 + 1 = 4)
      expect(result.insertBeforeGlobal).toBe(4);
    });

    it('should handle dragged tracks in the middle of drop zone', () => {
      const tracks = [
        createTrack('a', 0),
        createTrack('b', 1), // Dragged
        createTrack('c', 2), // Dragged
        createTrack('d', 3), // Dragged
        createTrack('e', 4),
        createTrack('f', 5),
      ];

      // Drop at filtered index 2 (over Track C which is dragged)
      // pointerY = containerTop + headerOffset + row2_middle = 100 + 40 + 150 = 290
      const input: DropIntentInput = {
        pointerY: 290,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(6, ROW_HEIGHT),
        filteredTracks: tracks,
        draggedTrackPositions: [1, 2, 3],
        dragCount: 3,
      };

      const result = computeDropIntent(input);

      // Should skip dragged tracks (1,2,3) and use Track E's position (4)
      expect(result.insertBeforeGlobal).toBe(4);
    });
  });

  describe('User bug scenario: Move tracks 4,5,6 below Rodeo (position 8)', () => {
    const playlist = [
      createTrack('a', 0, 'Day Old Thoughts'),
      createTrack('b', 1, 'Lose Control'),
      createTrack('c', 2, 'Blue Left Hand'),
      createTrack('d', 3, 'Keep Me Satisfied'),
      createTrack('e', 4, 'Lack again'),        // Selected
      createTrack('f', 5, 'Not Feeling Up'),    // Selected
      createTrack('g', 6, 'Hoffnung'),          // Selected
      createTrack('h', 7, 'Dast'),
      createTrack('i', 8, 'Rodeo'),
      createTrack('j', 9, 'Alles was ich will'),
      createTrack('k', 10, 'denkst du an mich?'),
    ];

    it('should compute correct drop position below Rodeo', () => {
      // User drags 3 tracks (positions 4,5,6) and drops below Rodeo
      // Pointer is positioned below Rodeo (position 8)
      // Expected: insertBeforeGlobal = 9 (before "Alles was ich will")

      // Simulate pointer below Rodeo row to insert after it
      // Rodeo is at filtered index 8, row starts at 8*60 = 480, ends at 540
      // To drop AFTER Rodeo (insert before track 9), adjustedY must be >= row 8 midpoint (510)
      // adjustedY = relativeY - rowHeight/2 - overlayOffset
      // 510 = relativeY - 30 - 60  →  relativeY = 600
      // pointerY = containerTop + headerOffset + relativeY = 100 + 40 + 600 = 740
      const input: DropIntentInput = {
        pointerY: 740,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(11, ROW_HEIGHT),
        filteredTracks: playlist,
        draggedTrackPositions: [4, 5, 6],
        dragCount: 3,
      };

      const result = computeDropIntent(input);

      // Should insert at position 9 (below Rodeo, before "Alles was ich will")
      expect(result.insertBeforeGlobal).toBe(9);
    });

    it('should NOT target dragged tracks even if pointer is over them', () => {
      // User drags tracks 4,5,6 but pointer ends up over those tracks
      // (e.g., dragged down then back up)
      // Should NOT use positions 4,5,6 as target

      // Pointer over "Lack again" area (position 4) - this track IS being dragged!
      // Row 4 spans 240-300, midpoint at 270
      // With 3-track drag, overlayOffset = 60
      // To land at filtered index 4: adjustedY should be between 210 and 270
      // relativeY = adjustedY + 30 + 60 = adjustedY + 90
      // For adjustedY=240: relativeY = 330
      // pointerY = containerTop + headerOffset + relativeY = 100 + 40 + 330 = 470
      const input: DropIntentInput = {
        pointerY: 470,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(11, ROW_HEIGHT),
        filteredTracks: playlist,
        draggedTrackPositions: [4, 5, 6],
        dragCount: 3,
      };

      const result = computeDropIntent(input);

      // Should skip dragged tracks and use next valid position
      // Filtered index will be 4, 5, or 6, but insertBeforeGlobal should skip to 7
      expect(result.insertBeforeGlobal).not.toBe(4);
      expect(result.insertBeforeGlobal).not.toBe(5);
      expect(result.insertBeforeGlobal).not.toBe(6);
      expect(result.insertBeforeGlobal).toBe(7); // Should be position 7 (Dast)
    });
  });

  describe('Filtered view handling', () => {
    it('should map filtered index to correct global position', () => {
      // Simulate search filter: only tracks at positions 2, 5, 8 visible
      const filteredTracks = [
        createTrack('c', 2, 'Track C'),
        createTrack('f', 5, 'Track F'),
        createTrack('i', 8, 'Track I'),
      ];

      const input: DropIntentInput = {
        pointerY: 160,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(3, ROW_HEIGHT),
        filteredTracks,
        draggedTrackPositions: [],
        dragCount: 1,
      };

      const result = computeDropIntent(input);

      // Filtered index might be 0 or 1, but global position should use track.position
      expect(result.insertBeforeGlobal).toBeGreaterThanOrEqual(2);
      expect([2, 5, 9]).toContain(result.insertBeforeGlobal); // Valid positions
    });
  });

  describe('Edge cases', () => {
    it('should handle empty track list', () => {
      const input: DropIntentInput = {
        pointerY: 150,
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: [],
        filteredTracks: [],
        draggedTrackPositions: [],
        dragCount: 1,
      };

      const result = computeDropIntent(input);

      expect(result.insertionIndexFiltered).toBe(0);
      expect(result.insertBeforeGlobal).toBe(0);
    });

    it('should handle drop after all tracks', () => {
      const tracks = [
        createTrack('a', 0),
        createTrack('b', 1),
        createTrack('c', 2),
      ];

      const input: DropIntentInput = {
        pointerY: 1000, // Well past all tracks
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 0,
        rowHeight: ROW_HEIGHT,
        virtualItems: createVirtualItems(3, ROW_HEIGHT),
        filteredTracks: tracks,
        draggedTrackPositions: [],
        dragCount: 1,
      };

      const result = computeDropIntent(input);

      expect(result.insertionIndexFiltered).toBe(3);
      expect(result.insertBeforeGlobal).toBe(3); // After last track (position 2 + 1)
    });

    it('should handle scrolled container', () => {
      const tracks = Array.from({ length: 20 }, (_, i) => createTrack(`track-${i}`, i));

      // Container scrolled down 300px (5 rows)
      const input: DropIntentInput = {
        pointerY: 200, // Viewport coordinates
        headerOffset: HEADER_OFFSET,
        containerTop: CONTAINER_TOP,
        scrollTop: 300, // Scrolled!
        rowHeight: ROW_HEIGHT,
        virtualItems: [
          { index: 5, start: 300, size: 60 },
          { index: 6, start: 360, size: 60 },
          { index: 7, start: 420, size: 60 },
        ],
        filteredTracks: tracks,
        draggedTrackPositions: [],
        dragCount: 1,
      };

      const result = computeDropIntent(input);

      // relativeY = 200 - 100 + 300 - 40 = 360
      // adjustedY = 360 - 30 = 330
      // Item 5 midpoint = 330, item 6 midpoint = 390
      // Should insert at index 6
      expect(result.insertionIndexFiltered).toBe(6);
      expect(result.insertBeforeGlobal).toBe(6);
    });
  });
});
