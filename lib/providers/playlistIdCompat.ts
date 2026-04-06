import type { MusicProviderId } from '@/lib/music-provider/types';

/**
 * Spotify IDs are base62, typically 22 characters (but can vary).
 * They contain only alphanumeric characters.
 */
const SPOTIFY_ID_RE = /^[A-Za-z0-9]{15,30}$/;

/**
 * TIDAL playlist IDs are UUIDs (lowercase hex with dashes).
 */
const TIDAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLAYLIST_ID_COMPATIBILITY: Record<MusicProviderId, (playlistId: string) => boolean> = {
  spotify: (playlistId) => SPOTIFY_ID_RE.test(playlistId),
  tidal: (playlistId) => TIDAL_UUID_RE.test(playlistId),
};

/**
 * Check whether a playlist ID is compatible with the given provider.
 *
 * Returns true if:
 * - The ID is null/undefined/empty (no playlist loaded — always valid)
 * - The ID matches the expected format for the provider
 * - The ID is a known special value (e.g. liked-songs)
 *
 * Returns false if the ID clearly belongs to a different provider
 * (e.g. a Spotify base62 ID used with TIDAL, or a UUID used with Spotify).
 */
export function isPlaylistIdCompatibleWithProvider(
  playlistId: string | null | undefined,
  providerId: MusicProviderId,
): boolean {
  if (!playlistId) {
    return true;
  }

  // Special IDs used in the app (liked songs, test fixtures)
  if (playlistId.startsWith('liked-') || playlistId.startsWith('test-')) {
    return true;
  }

  return PLAYLIST_ID_COMPATIBILITY[providerId](playlistId);
}
