/**
 * Centralized React Query keys for consistent cache management.
 * Use these keys across all queries and invalidations to ensure proper cache updates.
 */

import type { MusicProviderId } from '@/lib/music-provider/types';

function withProvider<T extends readonly unknown[]>(
  providerId: MusicProviderId | undefined,
  base: T
): readonly unknown[] {
  if (!providerId || providerId === 'spotify') {
    return base;
  }

  const [first, ...rest] = base;
  return [first, providerId, ...rest] as const;
}

/**
 * Query key for playlist tracks with pagination support.
 * @param playlistId - Spotify playlist ID
 * @returns React Query key array
 */
export const playlistTracks = (playlistId: string) => 
  ['playlist-tracks', playlistId] as const;

export const playlistTracksByProvider = (playlistId: string, providerId?: MusicProviderId) =>
  withProvider(providerId, playlistTracks(playlistId));

/**
 * Query key for playlist tracks with infinite pagination.
 * This is the authoritative source for all tracks in a playlist.
 * @param playlistId - Spotify playlist ID
 * @returns React Query key array
 */
export const playlistTracksInfinite = (playlistId: string) => 
  ['playlist-tracks-infinite', playlistId] as const;

export const playlistTracksInfiniteByProvider = (playlistId: string, providerId?: MusicProviderId) =>
  withProvider(providerId, playlistTracksInfinite(playlistId));

/**
 * Query key for playlist metadata (name, owner, etc.).
 * @param playlistId - Spotify playlist ID
 * @returns React Query key array
 */
export const playlistMeta = (playlistId: string) => 
  ['playlist', playlistId] as const;

export const playlistMetaByProvider = (playlistId: string, providerId?: MusicProviderId) =>
  withProvider(providerId, playlistMeta(playlistId));

/**
 * Query key for playlist permissions (isEditable, etc.).
 * @param playlistId - Spotify playlist ID
 * @returns React Query key array
 */
export const playlistPermissions = (playlistId: string) => 
  ['playlist-permissions', playlistId] as const;

export const playlistPermissionsByProvider = (playlistId: string, providerId?: MusicProviderId) =>
  withProvider(providerId, playlistPermissions(playlistId));

/**
 * Query key for user's playlists with infinite pagination.
 * @returns React Query key array
 */
export const userPlaylists = () => 
  ['user-playlists'] as const;

export const userPlaylistsByProvider = (providerId?: MusicProviderId) =>
  withProvider(providerId, userPlaylists());
