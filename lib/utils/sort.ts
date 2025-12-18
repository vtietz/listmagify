/**
 * Sorting utilities for playlist tracks
 * All comparators use stable secondary sort by originalPosition when values are equal
 */

import type { Track } from "@/lib/spotify/types";

export type SortKey =
  | "position"
  | "name"
  | "artist"
  | "album"
  | "duration"
  | "popularity"
  | "year";

export type SortDirection = "asc" | "desc";

/**
 * Stable secondary sort by originalPosition (ascending)
 */
function stableSort(a: Track, b: Track): number {
  const aPos = a.originalPosition ?? a.position ?? 0;
  const bPos = b.originalPosition ?? b.position ?? 0;
  return aPos - bPos;
}

/**
 * Compare two values with null/undefined handling
 * Nullish values sort to the end
 */
function compareValues<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  compareFn: (a: T, b: T) => number
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return compareFn(a, b);
}

/**
 * Sort by original position (stable # column)
 */
export function compareByPosition(a: Track, b: Track): number {
  return stableSort(a, b);
}

/**
 * Sort by track name (case-insensitive)
 */
export function compareByName(a: Track, b: Track): number {
  const result = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by first artist name (case-insensitive)
 */
export function compareByArtist(a: Track, b: Track): number {
  const aArtist = a.artists[0]?.toLowerCase() ?? "";
  const bArtist = b.artists[0]?.toLowerCase() ?? "";
  const result = aArtist.localeCompare(bArtist);
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by album name (case-insensitive)
 */
export function compareByAlbum(a: Track, b: Track): number {
  const result = compareValues(
    a.album?.name,
    b.album?.name,
    (aName, bName) => aName.toLowerCase().localeCompare(bName.toLowerCase())
  );
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by duration (milliseconds)
 */
export function compareByDuration(a: Track, b: Track): number {
  const result = a.durationMs - b.durationMs;
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by popularity (0-100)
 */
export function compareByPopularity(a: Track, b: Track): number {
  const aPop = a.popularity ?? 0;
  const bPop = b.popularity ?? 0;
  const result = aPop - bPop;
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by release date (album release date)
 * Parses YYYY, YYYY-MM, or YYYY-MM-DD formats
 */
export function compareByReleaseDate(a: Track, b: Track): number {
  // Parse release date to a comparable value (YYYYMMDD format as number)
  const parseDate = (dateStr: string | null | undefined): number => {
    if (!dateStr) return 0;
    // Pad with 01 for missing month/day to ensure consistent comparison
    const parts = dateStr.split('-');
    const year = parts[0] || '0000';
    const month = parts[1] || '01';
    const day = parts[2] || '01';
    return parseInt(`${year}${month}${day}`, 10);
  };
  
  const aDate = parseDate(a.album?.releaseDate);
  const bDate = parseDate(b.album?.releaseDate);
  const result = aDate - bDate;
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Get comparator function for a given sort key
 */
export function getComparator(sortKey: SortKey): (a: Track, b: Track) => number {
  switch (sortKey) {
    case "position":
      return compareByPosition;
    case "name":
      return compareByName;
    case "artist":
      return compareByArtist;
    case "album":
      return compareByAlbum;
    case "duration":
      return compareByDuration;
    case "popularity":
      return compareByPopularity;
    case "year":
      return compareByReleaseDate;
    default:
      return compareByPosition;
  }
}

/**
 * Sort tracks by the given key and direction
 */
export function sortTracks(
  tracks: Track[],
  sortKey: SortKey,
  direction: SortDirection = "asc"
): Track[] {
  const comparator = getComparator(sortKey);
  const sorted = [...tracks].sort(comparator);
  return direction === "desc" ? sorted.reverse() : sorted;
}
