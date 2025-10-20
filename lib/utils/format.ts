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
 * Format tempo (BPM) with one decimal place
 * @param bpm - Beats per minute
 * @returns Formatted BPM string (e.g., "120.5")
 */
export function formatBpm(bpm: number): string {
  return bpm.toFixed(1);
}

/**
 * Musical key names (Pitch Class notation)
 */
const KEY_NAMES = [
  "C", "C♯/D♭", "D", "D♯/E♭", "E", "F",
  "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"
];

/**
 * Format musical key as pitch class with mode
 * @param key - Key index (0-11, where 0=C)
 * @param mode - Mode (0=minor, 1=major)
 * @returns Formatted key string (e.g., "C major", "A minor")
 */
export function formatKey(key: number, mode?: number): string {
  const keyName = KEY_NAMES[key] ?? "?";
  
  if (mode === undefined || mode === null) {
    return keyName;
  }
  
  const modeName = mode === 1 ? "major" : "minor";
  return `${keyName} ${modeName}`;
}

/**
 * Format 0-1 value as percentage
 * @param value - Value between 0 and 1
 * @returns Percentage string without decimal (e.g., "85%")
 */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
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
