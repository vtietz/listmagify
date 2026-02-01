/**
 * Tests for reorder logic consistency between:
 * 1. Optimistic update (applyReorderToInfinitePages)
 * 2. Spotify API (insert_before semantics)
 * 3. Target index calculation (computeAdjustedTargetIndex)
 * 
 * These tests document the expected behavior and catch any mismatches.
 */

import { describe, it, expect } from 'vitest';
import { applyReorderToInfinitePages } from '@/lib/dnd/sortUtils';
import { computeAdjustedTargetIndex } from '@/hooks/dnd/helpers';
import type { Track } from '@/lib/spotify/types';

// Helper to create test tracks
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

// Helper to create infinite data structure for testing
// Using explicit any to work around type mismatch between full Track and sortUtils minimal Track
function createInfiniteData(tracks: Track[]): any {
  return {
    pages: [{ tracks, snapshotId: 'snap', total: tracks.length, nextCursor: null }],
    pageParams: [undefined],
  };
}

// Helper to extract track names from infinite data
function getTrackNames(data: any): string[] {
  return data.pages.flatMap((p: { tracks: Track[] }) => p.tracks.map(t => t.name));
}

/**
 * Simulate what the Spotify API does with insert_before semantics.
 * 
 * From Spotify docs: "The position where the items should be inserted.
 * To reorder the items to the end of the playlist, simply set insert_before
 * to the position after the last item."
 * 
 * The API:
 * 1. Removes range_length items starting at range_start
 * 2. Inserts them BEFORE insert_before position (in the ORIGINAL list indexing)
 */
function simulateSpotifyReorder(
  tracks: Track[],
  rangeStart: number,
  insertBefore: number,
  rangeLength: number
): Track[] {
  const result = [...tracks];
  const movedItems = result.splice(rangeStart, rangeLength);
  
  // insert_before is relative to ORIGINAL list positions
  // After removing items, we need to adjust the insert position
  // if insert_before was after the removed items
  const adjustedInsertPos = insertBefore > rangeStart 
    ? insertBefore - rangeLength 
    : insertBefore;
  
  result.splice(adjustedInsertPos, 0, ...movedItems);
  return result;
}

describe('Reorder Logic Consistency', () => {
  // Create a test playlist matching the user's scenario
  const testTracks = [
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

  describe('User scenario: Move 3 tracks (positions 4,5,6) to below Rodeo (position 8)', () => {
    // User selects Lack again, Not Feeling Up, Hoffnung (positions 4, 5, 6)
    // User wants to move them below Rodeo (position 8)
    // Expected result: [Day Old, Lose Control, Blue Left, Keep Me, Dast, Rodeo, Lack, Not Feeling, Hoffnung, Alles, denkst]
    
    const fromIndex = 4;  // First selected track position
    const rangeLength = 3;
    
    // "Below Rodeo" means insert BEFORE position 9 (Alles was ich will)
    const dropPositionBelowRodeo = 9;

    it('should correctly reorder in optimistic update', () => {
      const data = createInfiniteData([...testTracks]);
      
      const result = applyReorderToInfinitePages(data, fromIndex, dropPositionBelowRodeo, rangeLength);
      const names = getTrackNames(result);
      
      // Expected order after moving 4,5,6 to below Rodeo
      expect(names).toEqual([
        'Day Old Thoughts',
        'Lose Control',
        'Blue Left Hand',
        'Keep Me Satisfied',
        'Dast',
        'Rodeo',
        'Lack again',        // Moved
        'Not Feeling Up',    // Moved
        'Hoffnung',          // Moved
        'Alles was ich will',
        'denkst du an mich?',
      ]);
    });

    it('should match Spotify API behavior', () => {
      // What we send to Spotify API:
      // range_start = fromIndex (4)
      // insert_before = dropPositionBelowRodeo (9)
      // range_length = 3
      
      const spotifyResult = simulateSpotifyReorder(
        [...testTracks],
        fromIndex,           // range_start
        dropPositionBelowRodeo, // insert_before
        rangeLength
      );
      
      const spotifyNames = spotifyResult.map(t => t.name);
      
      // Should match optimistic update
      expect(spotifyNames).toEqual([
        'Day Old Thoughts',
        'Lose Control',
        'Blue Left Hand',
        'Keep Me Satisfied',
        'Dast',
        'Rodeo',
        'Lack again',
        'Not Feeling Up',
        'Hoffnung',
        'Alles was ich will',
        'denkst du an mich?',
      ]);
    });

    it('optimistic update and Spotify API should produce identical results', () => {
      const data = createInfiniteData([...testTracks]);
      
      const optimisticResult = applyReorderToInfinitePages(data, fromIndex, dropPositionBelowRodeo, rangeLength);
      const spotifyResult = simulateSpotifyReorder([...testTracks], fromIndex, dropPositionBelowRodeo, rangeLength);
      
      const optimisticNames = getTrackNames(optimisticResult);
      const spotifyNames = spotifyResult.map(t => t.name);
      
      expect(optimisticNames).toEqual(spotifyNames);
    });
  });

  describe('computeAdjustedTargetIndex behavior', () => {
    const dragTracks = [testTracks[4]!, testTracks[5]!, testTracks[6]!]; // Positions 4, 5, 6
    const playlistId = 'playlist-1';
    
    it('should adjust when moving forward (target > all source positions)', () => {
      // Moving from 4,5,6 to position 9
      // Positions 4, 5, 6 are all < 9, so adjustment = 3
      const adjusted = computeAdjustedTargetIndex(9, dragTracks, testTracks, playlistId, playlistId);
      
      // After adjustment: 9 - 3 = 6
      expect(adjusted).toBe(6);
    });

    it('should NOT adjust when moving backward (target < all source positions)', () => {
      // Moving from 4,5,6 to position 1
      // No positions are < 1, so adjustment = 0
      const adjusted = computeAdjustedTargetIndex(1, dragTracks, testTracks, playlistId, playlistId);
      
      expect(adjusted).toBe(1);
    });

    it('should partially adjust when target is in the middle of selection', () => {
      // Moving from 4,5,6 to position 5
      // Only position 4 is < 5, so adjustment = 1
      const adjusted = computeAdjustedTargetIndex(5, dragTracks, testTracks, playlistId, playlistId);
      
      expect(adjusted).toBe(4);
    });
  });

  describe('The relationship between raw targetIndex and adjusted targetIndex', () => {
    /**
     * KEY INSIGHT: 
     * - Spotify API's insert_before uses the ORIGINAL list position
     * - applyReorderToInfinitePages calculates: insertAt = toIndex > fromIndex ? toIndex - rangeLength : toIndex
     * - computeAdjustedTargetIndex calculates: targetIdx - (count of dragged items before target)
     * 
     * For contiguous selections, these are equivalent when moving forward:
     * - applyReorderToInfinitePages: 9 - 3 = 6
     * - computeAdjustedTargetIndex: 9 - 3 = 6 (all 3 items at 4,5,6 are before 9)
     * 
     * This means we should pass the RAW targetIndex to the mutation, 
     * and let applyReorderToInfinitePages handle the adjustment internally.
     */
    
    it('RAW targetIndex should be passed to reorder mutation', () => {
      // When user drops at position 9 (below Rodeo), targetIndex = 9
      // The mutation should receive toIndex = 9
      // applyReorderToInfinitePages will internally calculate insertAt = 9 - 3 = 6
      
      const data = createInfiniteData([...testTracks]);
      const rawTargetIndex = 9;
      
      // This is what we should pass to the mutation
      const result = applyReorderToInfinitePages(data, 4, rawTargetIndex, 3);
      
      // Verify it produces correct result
      const names = getTrackNames(result);
      expect(names[6]).toBe('Lack again');
      expect(names[7]).toBe('Not Feeling Up');
      expect(names[8]).toBe('Hoffnung');
    });

    it('ADJUSTED targetIndex should NOT be passed to reorder mutation (causes double adjustment)', () => {
      // If we adjust BEFORE calling the mutation, we get double adjustment
      // adjustedTarget = 9 - 3 = 6
      // Then applyReorderToInfinitePages does: insertAt = 6 - 3 = 3 (WRONG!)
      
      const data = createInfiniteData([...testTracks]);
      const adjustedTargetIndex = 6; // Already adjusted!
      
      // This is WRONG - double adjustment
      const result = applyReorderToInfinitePages(data, 4, adjustedTargetIndex, 3);
      
      // This produces incorrect result - tracks end up at position 3
      const names = getTrackNames(result);
      expect(names[3]).toBe('Lack again');      // WRONG - should be at 6
      expect(names[4]).toBe('Not Feeling Up');  // WRONG
      expect(names[5]).toBe('Hoffnung');        // WRONG
    });
  });

  describe('Edge cases', () => {
    it('should handle moving to the very end of playlist', () => {
      const data = createInfiniteData([...testTracks]);
      
      // Move tracks 4,5,6 to the end (position 11)
      const result = applyReorderToInfinitePages(data, 4, 11, 3);
      const names = getTrackNames(result);
      
      expect(names.slice(-3)).toEqual(['Lack again', 'Not Feeling Up', 'Hoffnung']);
    });

    it('should handle moving to the very beginning', () => {
      const data = createInfiniteData([...testTracks]);
      
      // Move tracks 4,5,6 to the beginning (position 0)
      const result = applyReorderToInfinitePages(data, 4, 0, 3);
      const names = getTrackNames(result);
      
      expect(names.slice(0, 3)).toEqual(['Lack again', 'Not Feeling Up', 'Hoffnung']);
    });

    it('should handle single track move forward', () => {
      const data = createInfiniteData([...testTracks]);
      
      // Move track 4 to position 9
      const result = applyReorderToInfinitePages(data, 4, 9, 1);
      const names = getTrackNames(result);
      
      // Track should be at position 8 after adjustment (9 - 1)
      expect(names[8]).toBe('Lack again');
    });

    it('should handle single track move backward', () => {
      const data = createInfiniteData([...testTracks]);
      
      // Move track 8 (Rodeo) to position 2
      const result = applyReorderToInfinitePages(data, 8, 2, 1);
      const names = getTrackNames(result);
      
      // No adjustment needed when moving backward
      expect(names[2]).toBe('Rodeo');
    });
  });
});

describe('Spotify API insert_before semantics', () => {
  /**
   * Document exactly what Spotify API expects.
   * From: https://developer.spotify.com/documentation/web-api/reference/reorder-or-replace-playlists-tracks
   * 
   * insert_before: The position where the items should be inserted.
   * To reorder the items to the end of the playlist, simply set insert_before
   * to the position after the last item.
   * 
   * IMPORTANT: insert_before is the position in the ORIGINAL list (before removal).
   */
  
  const tracks = [
    createTrack('a', 0, 'A'),
    createTrack('b', 1, 'B'),
    createTrack('c', 2, 'C'),
    createTrack('d', 3, 'D'),
    createTrack('e', 4, 'E'),
  ];

  it('move single item forward: B (pos 1) to after D (insert_before=4)', () => {
    const result = simulateSpotifyReorder([...tracks], 1, 4, 1);
    const names = result.map(t => t.name);
    
    // Result: A, C, D, B, E
    expect(names).toEqual(['A', 'C', 'D', 'B', 'E']);
  });

  it('move single item backward: D (pos 3) to after A (insert_before=1)', () => {
    const result = simulateSpotifyReorder([...tracks], 3, 1, 1);
    const names = result.map(t => t.name);
    
    // Result: A, D, B, C, E
    expect(names).toEqual(['A', 'D', 'B', 'C', 'E']);
  });

  it('move range forward: B,C (pos 1-2) to after D (insert_before=4)', () => {
    const result = simulateSpotifyReorder([...tracks], 1, 4, 2);
    const names = result.map(t => t.name);
    
    // Result: A, D, B, C, E
    expect(names).toEqual(['A', 'D', 'B', 'C', 'E']);
  });

  it('move range backward: C,D (pos 2-3) to after A (insert_before=1)', () => {
    const result = simulateSpotifyReorder([...tracks], 2, 1, 2);
    const names = result.map(t => t.name);
    
    // Result: A, C, D, B, E
    expect(names).toEqual(['A', 'C', 'D', 'B', 'E']);
  });

  it('move to end: B,C (pos 1-2) to end (insert_before=5)', () => {
    const result = simulateSpotifyReorder([...tracks], 1, 5, 2);
    const names = result.map(t => t.name);
    
    // Result: A, D, E, B, C
    expect(names).toEqual(['A', 'D', 'E', 'B', 'C']);
  });

  it('move to beginning: D,E (pos 3-4) to start (insert_before=0)', () => {
    const result = simulateSpotifyReorder([...tracks], 3, 0, 2);
    const names = result.map(t => t.name);
    
    // Result: D, E, A, B, C
    expect(names).toEqual(['D', 'E', 'A', 'B', 'C']);
  });
});

describe('Critical bug reproduction: user scenario', () => {
  /**
   * User reported: 
   * - Selected tracks at positions 4, 5, 6 (Lack again, Not Feeling Up, Hoffnung)
   * - Dropped below Rodeo (position 8)
   * - Expected: tracks move to after Rodeo
   * - Actual: tracks moved to position 3-5 (before Keep Me Satisfied)
   * 
   * This means targetIndex was received as ~4 instead of 9.
   */
  
  const testTracks = [
    createTrack('a', 0, 'Day Old Thoughts'),
    createTrack('b', 1, 'Lose Control'),
    createTrack('c', 2, 'Blue Left Hand'),
    createTrack('d', 3, 'Keep Me Satisfied'),
    createTrack('e', 4, 'Lack again'),        
    createTrack('f', 5, 'Not Feeling Up'),    
    createTrack('g', 6, 'Hoffnung'),          
    createTrack('h', 7, 'Dast'),
    createTrack('i', 8, 'Rodeo'),
    createTrack('j', 9, 'Alles was ich will'),
    createTrack('k', 10, 'denkst du an mich?'),
  ];

  it('BUG: if targetIndex=4 is incorrectly passed, tracks end up at wrong position', () => {
    // This reproduces what we see in the bug
    const data = createInfiniteData([...testTracks]);
    
    // If targetIndex is incorrectly calculated as 4 (position of first selected track)
    const wrongTargetIndex = 4;
    const result = applyReorderToInfinitePages(data, 4, wrongTargetIndex, 3);
    const names = getTrackNames(result);
    
    // This would produce: tracks stay in same place (no-op since from=to)
    // Actually let's check what happens
    expect(names[3]).toBe('Keep Me Satisfied');
    expect(names[4]).toBe('Lack again');  // Stayed in place
    expect(names[5]).toBe('Not Feeling Up');
    expect(names[6]).toBe('Hoffnung');
  });

  it('BUG: if targetIndex=3 is passed, tracks move up one position', () => {
    const data = createInfiniteData([...testTracks]);
    
    // What if targetIndex is 3?
    const result = applyReorderToInfinitePages(data, 4, 3, 3);
    const names = getTrackNames(result);
    
    // Tracks move from 4,5,6 to 3,4,5
    expect(names[3]).toBe('Lack again');      // Moved up
    expect(names[4]).toBe('Not Feeling Up');
    expect(names[5]).toBe('Hoffnung');
    expect(names[6]).toBe('Keep Me Satisfied'); // Pushed down
  });

  it('CORRECT: targetIndex=9 produces correct result', () => {
    const data = createInfiniteData([...testTracks]);
    
    const result = applyReorderToInfinitePages(data, 4, 9, 3);
    const names = getTrackNames(result);
    
    // Tracks should be after Rodeo
    expect(names[5]).toBe('Rodeo');
    expect(names[6]).toBe('Lack again');      // Moved
    expect(names[7]).toBe('Not Feeling Up');
    expect(names[8]).toBe('Hoffnung');
  });

  it('Investigate: what if drop position sees position of track being dragged over?', () => {
    /**
     * Hypothesis: During drag, if the user hovers over their own selected tracks
     * (which are still visible), the drop position might return the position
     * of those tracks instead of where they're trying to drop.
     * 
     * This could happen if collision detection returns the dragged tracks
     * instead of the intended drop target.
     */
    
    // If user's pointer is technically over the dragged tracks during drag overlay animation
    // and the collision detection returns one of those tracks...
    const draggedTrackPosition = 4; // First selected track
    
    const data = createInfiniteData([...testTracks]);
    const result = applyReorderToInfinitePages(data, 4, draggedTrackPosition, 3);
    const names = getTrackNames(result);
    
    // This is effectively a no-op (from=4, to=4)
    expect(names[4]).toBe('Lack again');
    expect(names[5]).toBe('Not Feeling Up');
    expect(names[6]).toBe('Hoffnung');
  });
});
