/**
 * Shared constants and helpers for liked-songs support in the sync/import
 * pipeline. Backend code imports from here instead of features/.
 */

import type { MusicProviderId } from '@/lib/music-provider/types';

export const LIKED_SONGS_PLAYLIST_ID = 'liked';

/**
 * Batch size for saveTracks / removeTracks / containsTracks calls.
 * Spotify's limit is 50 IDs per request; TIDAL has no documented cap
 * but 50 is a safe default.
 */
export const LIKED_TRACKS_BATCH_SIZE = 50;

export function isLikedSongsPlaylist(id: string | null | undefined): boolean {
  return id === LIKED_SONGS_PLAYLIST_ID;
}

/**
 * Strip provider URI prefix to get a plain track ID suitable for
 * saveTracks / removeTracks / containsTracks.
 */
export function uriToTrackId(providerId: MusicProviderId, uri: string): string {
  if (providerId === 'spotify' && uri.startsWith('spotify:track:')) {
    return uri.slice('spotify:track:'.length);
  }
  if (providerId === 'tidal' && uri.startsWith('tidal:track:')) {
    return uri.slice('tidal:track:'.length);
  }
  return uri; // TIDAL uses plain numeric IDs
}

/**
 * Provider-specific display name for the liked-songs virtual playlist.
 */
export function getLikedSongsDisplayName(providerId: MusicProviderId): string {
  return providerId === 'tidal' ? 'My Tracks' : 'Liked Songs';
}
