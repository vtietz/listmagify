/**
 * Spotify catalog fetchers for recommendation system.
 * 
 * These functions fetch additional metadata from Spotify's API:
 * - Artist top tracks
 * - Album tracks (for adjacency)
 * - Track popularity
 * - Related artists (optional)
 * 
 * All fetchers use the existing Spotify client with rate limiting.
 */

import { getJSON, spotifyFetch } from "@/lib/spotify/client";
import { mapPlaylistItemToTrack } from "@/lib/spotify/types";
import type { Track } from "@/lib/spotify/types";

/**
 * Fetched artist top tracks response.
 */
export interface ArtistTopTracksResult {
  artistId: string;
  market: string;
  tracks: Array<{
    trackId: string;
    name: string;
    rank: number;
    popularity: number;
    albumId: string | null;
    uri: string;
  }>;
}

/**
 * Fetch an artist's top tracks for a given market.
 * Spotify returns up to 10 tracks.
 * 
 * @param artistId - Spotify artist ID
 * @param market - ISO 3166-1 alpha-2 country code
 */
export async function fetchArtistTopTracks(
  artistId: string,
  market: string = "US"
): Promise<ArtistTopTracksResult> {
  const raw = await getJSON<{
    tracks: Array<{
      id: string;
      name: string;
      popularity: number;
      album?: { id: string };
      uri: string;
    }>;
  }>(`/artists/${encodeURIComponent(artistId)}/top-tracks?market=${market}`);
  
  return {
    artistId,
    market,
    tracks: (raw.tracks ?? []).map((t, idx) => ({
      trackId: t.id,
      name: t.name,
      rank: idx + 1,
      popularity: t.popularity,
      albumId: t.album?.id ?? null,
      uri: t.uri,
    })),
  };
}

/**
 * Album tracks response.
 */
export interface AlbumTracksResult {
  albumId: string;
  tracks: Array<{
    trackId: string;
    name: string;
    position: number; // 0-indexed position in album
    discNumber: number;
    trackNumber: number;
    durationMs: number;
    uri: string;
  }>;
}

/**
 * Fetch all tracks from an album.
 * Handles pagination for albums with many tracks.
 * 
 * @param albumId - Spotify album ID
 */
interface AlbumTracksResponse {
  items: Array<{
    id: string;
    name: string;
    disc_number: number;
    track_number: number;
    duration_ms: number;
    uri: string;
  }>;
  next: string | null;
}

export async function fetchAlbumTracks(albumId: string): Promise<AlbumTracksResult> {
  const tracks: AlbumTracksResult['tracks'] = [];
  let nextUrl: string | null = `/albums/${encodeURIComponent(albumId)}/tracks?limit=50`;
  let globalPosition = 0;
  
  while (nextUrl) {
    const raw: AlbumTracksResponse = await getJSON<AlbumTracksResponse>(nextUrl);
    
    for (const item of raw.items ?? []) {
      tracks.push({
        trackId: item.id,
        name: item.name,
        position: globalPosition++,
        discNumber: item.disc_number,
        trackNumber: item.track_number,
        durationMs: item.duration_ms,
        uri: item.uri,
      });
    }
    
    nextUrl = raw.next;
  }
  
  return { albumId, tracks };
}

/**
 * Track popularity result.
 */
export interface TrackPopularityResult {
  trackId: string;
  popularity: number;
}

/**
 * Fetch popularity for multiple tracks (up to 50 at a time).
 * 
 * @param trackIds - Array of track IDs
 */
export async function fetchTrackPopularities(
  trackIds: string[]
): Promise<TrackPopularityResult[]> {
  if (trackIds.length === 0) return [];
  
  const results: TrackPopularityResult[] = [];
  
  // Process in batches of 50 (Spotify's limit)
  for (let i = 0; i < trackIds.length; i += 50) {
    const batch = trackIds.slice(i, i + 50);
    const ids = batch.join(',');
    
    const raw = await getJSON<{
      tracks: Array<{ id: string; popularity: number } | null>;
    }>(`/tracks?ids=${ids}`);
    
    for (const track of raw.tracks ?? []) {
      if (track) {
        results.push({
          trackId: track.id,
          popularity: track.popularity,
        });
      }
    }
  }
  
  return results;
}

/**
 * Related artists result.
 */
export interface RelatedArtistsResult {
  artistId: string;
  relatedArtists: Array<{
    artistId: string;
    name: string;
    weight: number; // Derived from position (higher = more related)
  }>;
}

/**
 * Fetch related artists for an artist.
 * Spotify returns up to 20 related artists.
 * 
 * @param artistId - Spotify artist ID
 */
export async function fetchRelatedArtists(
  artistId: string
): Promise<RelatedArtistsResult> {
  const raw = await getJSON<{
    artists: Array<{
      id: string;
      name: string;
    }>;
  }>(`/artists/${encodeURIComponent(artistId)}/related-artists`);
  
  return {
    artistId,
    relatedArtists: (raw.artists ?? []).map((a, idx) => ({
      artistId: a.id,
      name: a.name,
      // Weight decays with position (1.0 for first, ~0.5 for 20th)
      weight: 1.0 - (idx * 0.025),
    })),
  };
}

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
