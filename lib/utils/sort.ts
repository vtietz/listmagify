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
  | "tempo"
  | "key"
  | "acousticness"
  | "energy"
  | "instrumentalness"
  | "liveness"
  | "valence";

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
 * Sort by tempo (BPM)
 */
export function compareByTempo(a: Track, b: Track): number {
  const result = compareValues(
    a.tempoBpm,
    b.tempoBpm,
    (aTempo, bTempo) => aTempo - bTempo
  );
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by musical key (0-11)
 */
export function compareByKey(a: Track, b: Track): number {
  const result = compareValues(
    a.musicalKey,
    b.musicalKey,
    (aKey, bKey) => aKey - bKey
  );
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by acousticness (0-1)
 */
export function compareByAcousticness(a: Track, b: Track): number {
  const result = compareValues(
    a.acousticness,
    b.acousticness,
    (aVal, bVal) => aVal - bVal
  );
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by energy (0-1)
 */
export function compareByEnergy(a: Track, b: Track): number {
  const result = compareValues(
    a.energy,
    b.energy,
    (aVal, bVal) => aVal - bVal
  );
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by instrumentalness (0-1)
 */
export function compareByInstrumentalness(a: Track, b: Track): number {
  const result = compareValues(
    a.instrumentalness,
    b.instrumentalness,
    (aVal, bVal) => aVal - bVal
  );
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by liveness (0-1)
 */
export function compareByLiveness(a: Track, b: Track): number {
  const result = compareValues(
    a.liveness,
    b.liveness,
    (aVal, bVal) => aVal - bVal
  );
  return result !== 0 ? result : stableSort(a, b);
}

/**
 * Sort by valence / positivity (0-1)
 */
export function compareByValence(a: Track, b: Track): number {
  const result = compareValues(
    a.valence,
    b.valence,
    (aVal, bVal) => aVal - bVal
  );
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
    case "tempo":
      return compareByTempo;
    case "key":
      return compareByKey;
    case "acousticness":
      return compareByAcousticness;
    case "energy":
      return compareByEnergy;
    case "instrumentalness":
      return compareByInstrumentalness;
    case "liveness":
      return compareByLiveness;
    case "valence":
      return compareByValence;
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
