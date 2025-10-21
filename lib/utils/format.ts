/**
 * Formatting utilities for displaying track metadata and audio features
 */

/**
 * Format milliseconds as MM:SS or HH:MM:SS
 * @param ms - Duration in milliseconds
 * @returns Formatted time string
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Calculate cumulative duration from start of playlist to given index
 * @param tracks - Array of tracks
 * @param endIndex - Index up to which to calculate (inclusive)
 * @returns Formatted cumulative duration
 */
export function formatCumulativeDuration(tracks: { durationMs: number }[], endIndex: number): string {
  const totalMs = tracks
    .slice(0, endIndex + 1)
    .reduce((sum, track) => sum + track.durationMs, 0);
  
  return formatDuration(totalMs);
}
