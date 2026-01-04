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

/**
 * Format BPM (beats per minute) value
 * @param bpm - Tempo in BPM
 * @returns Formatted BPM string (rounded to nearest integer)
 */
export function formatBpm(bpm: number): string {
  return Math.round(bpm).toString();
}

/**
 * Musical key names (Pitch Class Notation)
 * Index corresponds to Spotify's key value (0-11)
 */
const KEY_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/**
 * Format musical key and mode
 * @param key - Key value (0-11, where 0=C, 1=C♯, etc.)
 * @param mode - Mode (0=minor, 1=major)
 * @returns Formatted key string (e.g., "C major", "A♯ minor")
 */
export function formatKey(key: number, mode?: number | null): string {
  const keyName = KEY_NAMES[key] ?? "?";
  const modeName = mode === 1 ? "maj" : mode === 0 ? "min" : "";
  return modeName ? `${keyName} ${modeName}` : keyName;
}

/**
 * Format a 0-1 value as a percentage
 * @param value - Value between 0 and 1
 * @returns Formatted percentage string (e.g., "75%")
 */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Format a release date for display
 * @param dateStr - Date string in YYYY, YYYY-MM, or YYYY-MM-DD format
 * @param precision - Precision of the date ('year', 'month', 'day')
 * @returns Human-readable date string
 */
export function formatReleaseDate(
  dateStr: string,
  precision?: 'year' | 'month' | 'day' | null
): string {
  if (!dateStr) return 'Unknown';
  
  const parts = dateStr.split('-');
  const year = parts[0] || 'Unknown';
  const month = parts[1];
  const day = parts[2];
  
  // Use precision if available, otherwise infer from parts
  const effectivePrecision = precision || (day ? 'day' : month ? 'month' : 'year');
  
  if (effectivePrecision === 'year' || !month) {
    return year;
  }
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[parseInt(month, 10) - 1] || month;
  
  if (effectivePrecision === 'month' || !day) {
    return `${monthName} ${year}`;
  }
  
  // Full date
  return `${monthName} ${parseInt(day, 10)}, ${year}`;
}

/**
 * Format a scrobble/play timestamp in Last.fm style
 * - "X min ago" for < 1 hour
 * - "X hours ago" for < 24 hours (same day feel)
 * - "3 Jan, 10:24" for recent dates (current year)
 * - "31 Dec 2024, 23:52" for older dates (different year)
 * 
 * @param timestamp - Unix timestamp in seconds
 * @returns Human-readable relative or absolute date string
 */
export function formatScrobbleDate(timestamp: number): string {
  const now = Date.now();
  const date = new Date(timestamp * 1000);
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  // < 1 minute ago
  if (diffMinutes < 1) {
    return 'just now';
  }
  
  // < 1 hour ago
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  
  // < 24 hours ago
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  
  // Format date parts
  const day = date.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  
  // Same year - shorter format
  if (year === currentYear) {
    return `${day} ${month}, ${hours}:${minutes}`;
  }
  
  // Different year - include year
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

/**
 * Get a short version of scrobble date for narrow columns
 * - "Xm" for < 1 hour
 * - "Xh" for < 24 hours
 * - "3 Jan" for current year
 * - "31.12.24" for different year
 * 
 * @param timestamp - Unix timestamp in seconds
 * @returns Short date string
 */
export function formatScrobbleDateShort(timestamp: number): string {
  const now = Date.now();
  const date = new Date(timestamp * 1000);
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  // < 1 minute ago
  if (diffMinutes < 1) {
    return 'now';
  }
  
  // < 1 hour ago
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  
  // < 24 hours ago
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  
  // Format date parts
  const day = date.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  
  // Same year - day + month
  if (year === currentYear) {
    return `${day} ${month}`;
  }
  
  // Different year - compact date
  const shortYear = String(year).slice(-2);
  const monthNum = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${monthNum}.${shortYear}`;
}
