import { getJSON, spotifyFetch } from "@/lib/spotify/client";
import { mapPlaylist, mapPlaylistItemToTrack, pageFromSpotify, type PageResult, type Playlist, type Track } from "@/lib/spotify/types";

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