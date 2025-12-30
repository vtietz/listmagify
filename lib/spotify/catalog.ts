/**
 * Spotify catalog fetchers for enriching recommendations with metadata.
 * 
 * These functions fetch metadata from Spotify's API for tracks and artists.
 * Used to populate track details in recommendation results.
 */

import { getJSON } from "@/lib/spotify/client";
import { mapPlaylistItemToTrack } from "@/lib/spotify/types";
import type { Track } from "@/lib/spotify/types";

/**
 * Fetch a single track's full details.
 * 
 * @param trackId - Spotify track ID
 */
export async function fetchTrack(trackId: string): Promise<Track | null> {
  try {
    const raw = await getJSON<any>(`/tracks/${encodeURIComponent(trackId)}`);
    return mapPlaylistItemToTrack(raw);
  } catch {
    return null;
  }
}

/**
 * Fetch multiple tracks by IDs (up to 50).
 * 
 * @param trackIds - Array of track IDs
 */
export async function fetchTracks(trackIds: string[]): Promise<Track[]> {
  if (trackIds.length === 0) return [];
  
  const results: Track[] = [];
  
  // Process in batches of 50
  for (let i = 0; i < trackIds.length; i += 50) {
    const batch = trackIds.slice(i, i + 50);
    const ids = batch.join(',');
    
    const raw = await getJSON<{
      tracks: Array<any | null>;
    }>(`/tracks?ids=${ids}`);
    
    for (const track of raw.tracks ?? []) {
      if (track) {
        results.push(mapPlaylistItemToTrack(track));
      }
    }
  }
  
  return results;
}

/**
 * Fetch artist info including genres.
 * 
 * @param artistId - Spotify artist ID
 */
export async function fetchArtist(artistId: string): Promise<{
  id: string;
  name: string;
  genres: string[];
  popularity: number;
} | null> {
  try {
    const raw = await getJSON<{
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
 * Fetch multiple artists by IDs (up to 50).
 * 
 * @param artistIds - Array of artist IDs
 */
export async function fetchArtists(artistIds: string[]): Promise<Array<{
  id: string;
  name: string;
  genres: string[];
  popularity: number;
}>> {
  if (artistIds.length === 0) return [];
  
  const results: Array<{
    id: string;
    name: string;
    genres: string[];
    popularity: number;
  }> = [];
  
  // Process in batches of 50
  for (let i = 0; i < artistIds.length; i += 50) {
    const batch = artistIds.slice(i, i + 50);
    const ids = batch.join(',');
    
    const raw = await getJSON<{
      artists: Array<{
        id: string;
        name: string;
        genres: string[];
        popularity: number;
      } | null>;
    }>(`/artists?ids=${ids}`);
    
    for (const artist of raw.artists ?? []) {
      if (artist) {
        results.push({
          id: artist.id,
          name: artist.name,
          genres: artist.genres ?? [],
          popularity: artist.popularity ?? 0,
        });
      }
    }
  }
  
  return results;
}

/**
 * Fetch album details.
 * 
 * @param albumId - Spotify album ID
 */
export async function fetchAlbum(albumId: string): Promise<{
  id: string;
  name: string;
  totalTracks: number;
  releaseDate: string | null;
  artistIds: string[];
} | null> {
  try {
    const raw = await getJSON<{
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
