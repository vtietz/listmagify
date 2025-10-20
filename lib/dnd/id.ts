/**
 * Utilities for drag-and-drop ID management.
 * Provides consistent composite ID generation and track position extraction.
 */

import type { Track } from '@/lib/spotify/types';

/**
 * Creates a globally unique composite ID for a track within a panel.
 * Format: `panelId:trackId`
 * 
 * @param panelId - Unique panel identifier
 * @param trackId - Spotify track ID or URI
 * @returns Composite ID string
 * 
 * @example
 * ```ts
 * makeCompositeId('panel-1', 'track-abc123')
 * // => 'panel-1:track-abc123'
 * ```
 */
export function makeCompositeId(panelId: string, trackId: string): string {
  return `${panelId}:${trackId}`;
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
