/**
 * Spotify catalog fetchers for enriching recommendations with metadata.
 * 
 * These functions fetch metadata from Spotify's API for tracks and artists.
 * Used to populate track details in recommendation results.
 */

import { getMusicProvider } from '@/lib/music-provider';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { mapPlaylistItemToTrack } from '@/lib/spotify/types';
import type { Track } from '@/lib/music-provider/types';

function normalizeTrackIdsForProvider(
  trackIds: string[],
  providerId: MusicProviderId,
): string[] {
  const uniqueTrackIds = Array.from(new Set(
    trackIds
      .map((trackId) => trackId.trim())
      .filter((trackId) => trackId.length > 0)
  ));

  if (providerId !== 'spotify') {
    return uniqueTrackIds;
  }

  return uniqueTrackIds.filter((trackId) => /^[A-Za-z0-9]{22}$/.test(trackId));
}

/**
 * Fetch a single track's full details.
 * 
 * @param trackId - Provider track ID
 */
export async function fetchTrack(
  trackId: string,
  providerId: MusicProviderId = 'spotify'
): Promise<Track | null> {
  try {
    const provider = getMusicProvider(providerId);
    const raw = await provider.getJSON<any>(`/tracks/${encodeURIComponent(trackId)}`);
    return mapPlaylistItemToTrack(raw);
  } catch {
    return null;
  }
}

/** Parallel single-item requests; the batch GET /tracks?ids= endpoint was removed (Feb 2026). */
const CATALOG_FETCH_CONCURRENCY = 5;

async function fetchEach<T>(ids: string[], fetchOne: (id: string) => Promise<T | null>): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < ids.length; i += CATALOG_FETCH_CONCURRENCY) {
    const batch = ids.slice(i, i + CATALOG_FETCH_CONCURRENCY);
    const fetched = await Promise.all(batch.map(fetchOne));
    for (const item of fetched) {
      if (item) {
        results.push(item);
      }
    }
  }

  return results;
}

/**
 * Fetch multiple tracks by IDs.
 * 
 * @param trackIds - Array of track IDs
 */
export async function fetchTracks(
  trackIds: string[],
  providerId: MusicProviderId = 'spotify'
): Promise<Track[]> {
  const normalizedTrackIds = normalizeTrackIdsForProvider(trackIds, providerId);
  if (normalizedTrackIds.length === 0) return [];

  return fetchEach(normalizedTrackIds, (trackId) => fetchTrack(trackId, providerId));
}

/**
 * Fetch artist info including genres.
 * 
 * @param artistId - Provider artist ID
 */
export async function fetchArtist(
  artistId: string,
  providerId: MusicProviderId = 'spotify'
): Promise<{
  id: string;
  name: string;
  genres: string[];
  popularity: number;
} | null> {
  try {
    const provider = getMusicProvider(providerId);
    const raw = await provider.getJSON<{
      id: string;
      name: string;
      genres: string[];
      popularity: number;
    }>(`/artists/${encodeURIComponent(artistId)}`);
    
    return {
      id: raw.id,
      name: raw.name,
      genres: raw.genres ?? [],
      popularity: raw.popularity ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch multiple artists by IDs.
 * 
 * @param artistIds - Array of artist IDs
 */
export async function fetchArtists(
  artistIds: string[],
  providerId: MusicProviderId = 'spotify'
): Promise<Array<{
  id: string;
  name: string;
  genres: string[];
  popularity: number;
}>> {
  if (artistIds.length === 0) return [];

  return fetchEach(artistIds, (artistId) => fetchArtist(artistId, providerId));
}

/**
 * Fetch album details.
 * 
 * @param albumId - Provider album ID
 */
export async function fetchAlbum(
  albumId: string,
  providerId: MusicProviderId = 'spotify'
): Promise<{
  id: string;
  name: string;
  totalTracks: number;
  releaseDate: string | null;
  artistIds: string[];
} | null> {
  try {
    const provider = getMusicProvider(providerId);
    const raw = await provider.getJSON<{
      id: string;
      name: string;
      total_tracks: number;
      release_date: string;
      artists: Array<{ id: string }>;
    }>(`/albums/${encodeURIComponent(albumId)}`);
    
    return {
      id: raw.id,
      name: raw.name,
      totalTracks: raw.total_tracks,
      releaseDate: raw.release_date ?? null,
      artistIds: (raw.artists ?? []).map(a => a.id),
    };
  } catch {
    return null;
  }
}
