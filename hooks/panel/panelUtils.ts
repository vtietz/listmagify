/**
 * Pure utility functions for playlist panel computations.
 * These are extracted to enable unit testing without hook overhead.
 */

import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import { getTrackSelectionKey } from '@/lib/dnd/selection';
import type { Track } from '@/lib/spotify/types';

/**
 * Build a set of duplicate URIs (URIs that appear more than once in the track list).
 * These are "real" duplicates - exact same Spotify track ID.
 */
export function buildDuplicateUris(filteredTracks: Track[]): Set<string> {
  const uriCounts = new Map<string, number>();
  for (const track of filteredTracks) {
    const count = uriCounts.get(track.uri) || 0;
    uriCounts.set(track.uri, count + 1);
  }
  
  const duplicates = new Set<string>();
  for (const [uri, count] of uriCounts) {
    if (count > 1) {
      duplicates.add(uri);
    }
  }
  return duplicates;
}

/**
 * Create a signature key for soft duplicate detection.
 * Uses normalized title, artist names, and duration (rounded to nearest second).
 */
function createSoftDuplicateKey(track: Track): string {
  const title = track.name.toLowerCase().trim();
  const artists = track.artists.map(a => a.toLowerCase().trim()).sort().join('|');
  // Round duration to nearest second to handle minor variations
  const durationSeconds = Math.round(track.durationMs / 1000);
  return `${title}::${artists}::${durationSeconds}`;
}

/**
 * Build a set of "soft duplicate" URIs.
 * Soft duplicates are tracks with matching title, artist, and duration,
 * but different Spotify track IDs (e.g., same song from different albums/releases).
 * Does NOT include real duplicates (same URI).
 */
export function buildSoftDuplicateUris(
  filteredTracks: Track[],
  realDuplicateUris: Set<string>
): Set<string> {
  // Group tracks by their soft duplicate key
  const keyToTracks = new Map<string, Track[]>();
  for (const track of filteredTracks) {
    const key = createSoftDuplicateKey(track);
    const existing = keyToTracks.get(key) || [];
    existing.push(track);
    keyToTracks.set(key, existing);
  }
  
  const softDuplicates = new Set<string>();
  for (const tracks of keyToTracks.values()) {
    // Check if there are multiple different URIs for this key
    const uniqueUris = new Set(tracks.map(t => t.uri));
    if (uniqueUris.size > 1) {
      // Mark all tracks with this key as soft duplicates
      // (but exclude those that are already real duplicates)
      for (const track of tracks) {
        if (!realDuplicateUris.has(track.uri)) {
          softDuplicates.add(track.uri);
        }
      }
    }
  }
  return softDuplicates;
}

/**
 * Build a set of selected duplicate URIs (URIs of selected tracks that are duplicates).
 */
export function buildSelectedDuplicateUris(
  selection: Set<string>,
  filteredTracks: Track[],
  duplicateUris: Set<string>
): Set<string> {
  const uris = new Set<string>();
  const keyToTrack = new Map<string, Track>();
  
  filteredTracks.forEach((track, index) => {
    const key = getTrackSelectionKey(track, index);
    keyToTrack.set(key, track);
  });
  
  selection.forEach((key: string) => {
    const track = keyToTrack.get(key);
    if (track && duplicateUris.has(track.uri)) {
      uris.add(track.uri);
    }
  });
  
  return uris;
}

/**
 * Compute cumulative durations and hour boundary markers for tracks.
 */
export function computeCumulativeDurationsAndHourBoundaries(filteredTracks: Track[]): {
  cumulativeDurations: number[];
  hourBoundaries: Map<number, number>;
} {
  const cumulativeDurations: number[] = [];
  const hourBoundaries: Map<number, number> = new Map();
  let runningTotal = 0;
  const ONE_HOUR_MS = 60 * 60 * 1000;
  
  for (let i = 0; i < filteredTracks.length; i++) {
    const track = filteredTracks[i];
    if (!track) continue;
    const prevHours = Math.floor(runningTotal / ONE_HOUR_MS);
    runningTotal += track.durationMs;
    cumulativeDurations.push(runningTotal);
    const newHours = Math.floor(runningTotal / ONE_HOUR_MS);
    if (newHours > prevHours) hourBoundaries.set(i, newHours);
  }
  
  return { cumulativeDurations, hourBoundaries };
}

/**
 * Build context item IDs for DnD operations.
 */
export function buildContextItems(filteredTracks: Track[], panelId: string): string[] {
  return filteredTracks.map((t: Track, index: number) =>
    makeCompositeId(panelId, t.id || t.uri, getTrackPosition(t, index))
  );
}

/**
 * Extract valid Spotify track URIs from sorted tracks.
 * Filters out: local files (spotify:local:...), episodes (spotify:episode:...), and invalid URIs.
 */
export function getSortedValidTrackUris(sortedTracks: Track[]): string[] {
  return sortedTracks
    .map((track: Track) => track.uri)
    .filter((uri): uri is string =>
      typeof uri === 'string' &&
      uri.length > 0 &&
      uri.startsWith('spotify:track:')
    );
}

/**
 * Detect if tracks have multiple contributors.
 */
export function hasMultipleContributors(tracks: Track[]): boolean {
  if (!tracks || tracks.length === 0) return false;
  const contributors = new Set<string>();
  for (const track of tracks) {
    if (track.addedBy?.id) {
      contributors.add(track.addedBy.id);
      if (contributors.size > 1) return true;
    }
  }
  return false;
}
