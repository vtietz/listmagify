import { getJSON, spotifyFetch } from "@/lib/spotify/client";
import { mapPlaylist, mapPlaylistItemToTrack, pageFromSpotify, type PageResult, type Playlist, type Track } from "@/lib/spotify/types";
import { batchGetCached, batchSetCached, type AudioFeatures } from "@/lib/cache/audioFeaturesCache";

/**
 * Fetch current user's playlists with paging.
 * @param limit number of items per page (1-50)
 * @param nextCursor optional "next" URL returned by Spotify to continue paging
 */
export async function getCurrentUserPlaylists(
  limit: number = 50,
  nextCursor?: string | null
): Promise<PageResult<Playlist>> {
  const path = nextCursor ?? `/me/playlists?limit=${Math.min(Math.max(limit, 1), 50)}`;
  const raw = await getJSON<any>(path);
  return pageFromSpotify(raw, mapPlaylist);
}

/**
 * Fetch a single playlist's metadata.
 */
export async function getPlaylistById(playlistId: string): Promise<Playlist> {
  const raw = await getJSON<any>(`/playlists/${encodeURIComponent(playlistId)}`);
  return mapPlaylist(raw);
}

/**
 * Fetch tracks from a playlist (items with paging).
 * Note: Uses fields to reduce payload size.
 * @param playlistId Spotify playlist id
 * @param limit number of items per page (1-100)
 * @param nextCursor optional "next" URL to continue
 */
export async function getPlaylistItems(
  playlistId: string,
  limit: number = 100,
  nextCursor?: string | null
): Promise<PageResult<Track>> {
  const base = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${Math.min(Math.max(limit, 1), 100)}`;
  const path = nextCursor ?? base;

  const res = await spotifyFetch(path, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[spotify] GET ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  const raw = await res.json();

  return pageFromSpotify(raw, mapPlaylistItemToTrack);
}

/**
 * Spotify audio features response for a single track.
 * See: https://developer.spotify.com/documentation/web-api/reference/get-audio-features
 */
interface SpotifyAudioFeaturesResponse {
  id: string;
  tempo: number;
  key: number;
  mode: number;
  acousticness: number;
  energy: number;
  instrumentalness: number;
  liveness: number;
  valence: number;
  // Other fields we don't use: danceability, loudness, speechiness, time_signature, etc.
}

/**
 * Fetch audio features for multiple tracks with caching.
 * - Checks localStorage cache first for all track IDs
 * - Only fetches missing IDs from Spotify API
 * - Stores fetched results in cache
 * - Handles batching (max 100 IDs per API call)
 * - Returns Map of track ID → audio features
 * 
 * @param trackIds Array of Spotify track IDs (not URIs)
 * @returns Map of track ID to audio features (only includes tracks with data)
 */
export async function fetchAudioFeatures(
  trackIds: string[]
): Promise<Map<string, AudioFeatures>> {
  if (trackIds.length === 0) {
    return new Map();
  }

  // 1. Check cache first
  const cached = batchGetCached(trackIds);
  
  // 2. Identify missing IDs
  const missing = trackIds.filter((id) => !cached.has(id));
  
  if (missing.length === 0) {
    return cached; // All cached, return immediately
  }

  // 3. Fetch missing IDs in batches of 100 (Spotify API limit)
  const BATCH_SIZE = 100;
  const fetched = new Map<string, AudioFeatures>();

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const ids = batch.join(',');
    
    try {
      const response = await getJSON<{ audio_features: (SpotifyAudioFeaturesResponse | null)[] }>(
        `/audio-features?ids=${encodeURIComponent(ids)}`
      );

      // Process response (nulls indicate tracks without audio features)
      for (const item of response.audio_features) {
        if (item) {
          const features: AudioFeatures = {
            tempo: item.tempo,
            key: item.key,
            mode: item.mode,
            acousticness: item.acousticness,
            energy: item.energy,
            instrumentalness: item.instrumentalness,
            liveness: item.liveness,
            valence: item.valence,
          };
          fetched.set(item.id, features);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch audio features for batch starting at index ${i}:`, error);
      // Continue with next batch even if this one fails
    }
  }

  // 4. Store fetched results in cache
  if (fetched.size > 0) {
    batchSetCached(fetched);
  }

  // 5. Merge cached and fetched results
  return new Map([...cached, ...fetched]);
}