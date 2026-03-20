import { getMusicProvider } from '@/lib/music-provider';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { mapPlaylist, mapPlaylistItemToTrack, pageFromSpotify, type PageResult, type Playlist, type Track } from "@/lib/spotify/types";

/**
 * Fetch current user's playlists with paging.
 * @param limit number of items per page (1-50)
 * @param nextCursor optional "next" URL returned by Spotify to continue paging
 */
export async function getCurrentUserPlaylists(
  limit: number = 50,
  nextCursor?: string | null,
  providerId: MusicProviderId = 'spotify'
): Promise<PageResult<Playlist>> {
  const provider = getMusicProvider(providerId);
  const boundedLimit = Math.min(Math.max(limit, 1), 50);
  const page = await provider.getUserPlaylists(boundedLimit, nextCursor);

  return {
    items: page.items,
    nextCursor: page.nextCursor,
    total: typeof page.total === 'number' ? page.total : page.items.length,
  };
}

/**
 * Fetch a single playlist's metadata.
 */
export async function getPlaylistById(
  playlistId: string,
  providerId: MusicProviderId = 'spotify'
): Promise<Playlist> {
  const provider = getMusicProvider(providerId);
  const raw = await provider.getJSON<any>(`/playlists/${encodeURIComponent(playlistId)}`);
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
  nextCursor?: string | null,
  providerId: MusicProviderId = 'spotify'
): Promise<PageResult<Track>> {
  const provider = getMusicProvider(providerId);
  const base = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${Math.min(Math.max(limit, 1), 100)}`;
  const path = nextCursor ?? base;

  const res = await provider.fetch(path, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[spotify] GET ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  const raw = await res.json();

  return pageFromSpotify(raw, mapPlaylistItemToTrack);
}