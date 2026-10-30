/**
 * Shared constants and helpers for liked-songs support in the sync/import
 * pipeline. Backend code imports from here instead of features/.
 */

export const LIKED_SONGS_PLAYLIST_ID = 'liked';

/**
 * Outer batch size for the sync apply loop (saveTracks / removeTracks).
 * Spotify's limit is 50 IDs per request. TIDAL's v2 relationship endpoints
 * accept at most ~20 items per request; the TIDAL provider handles
 * sub-batching internally via PLAYLIST_RELATIONSHIP_MAX_BATCH_SIZE.
 */
export const LIKED_TRACKS_BATCH_SIZE = 50;

export function isLikedSongsPlaylist(id: string | null | undefined): boolean {
  return id === LIKED_SONGS_PLAYLIST_ID;
}

