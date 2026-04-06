/**
 * Shared constants and helpers for liked-songs support in the sync/import
 * pipeline. Backend code imports from here instead of features/.
 */

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

