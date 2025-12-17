/**
 * Utilities for drag-and-drop ID management.
 * Provides consistent composite ID generation and track position extraction.
 */

import type { Track } from '@/lib/spotify/types';

/**
 * Creates a globally unique composite ID for a track within a panel.
 * Format: `panelId:trackId:position`
 * 
 * The position is required to distinguish duplicate tracks (same song
 * appearing multiple times in a playlist).
 * 
 * @param panelId - Unique panel identifier
 * @param trackId - Spotify track ID or URI
 * @param position - Track position in the playlist
 * @returns Composite ID string
 * 
 * @example
 * ```ts
 * makeCompositeId('panel-1', 'track-abc123', 5)
 * // => 'panel-1:track-abc123:5'
 * ```
 */
export function makeCompositeId(panelId: string, trackId: string, position: number): string {
  return `${panelId}:${trackId}:${position}`;
}

/**
 * Extracts the track's global playlist position.
 * Falls back to filtered index if position is unavailable.
 * 
 * @param track - Spotify track object
 * @param index - Fallback filtered/virtual index
 * @returns Global position in playlist
 * 
 * @example
 * ```ts
 * getTrackPosition({ position: 5, ...otherProps }, 2)
 * // => 5
 * 
 * getTrackPosition({ position: undefined, ...otherProps }, 2)
 * // => 2
 * ```
 */
export function getTrackPosition(track: Track, index: number): number {
  return track.position ?? index;
}
