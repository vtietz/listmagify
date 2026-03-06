import { createSpotifyProvider } from '@/lib/music-provider/spotifyProvider';
import type { ProviderClientOptions } from '@/lib/music-provider/types';

export type SpotifyClientOptions = ProviderClientOptions;

const spotifyProvider = createSpotifyProvider();

/**
 * Low-level GET/POST wrapper that injects the access token and applies
 * rate-limit/backoff retry strategy. Returns raw Response.
 */
export async function spotifyFetch(
  path: string,
  init?: RequestInit,
  opts?: SpotifyClientOptions
): Promise<Response> {
  return spotifyProvider.fetch(path, init, opts);
}

/**
 * Low-level GET/POST wrapper that uses a pre-provided access token.
 * Avoids an extra getServerSession() call when you already have the token.
 * Use with requireAuth() for reduced session fetch overhead.
 * 
 * Usage:
 * ```ts
 * const session = await requireAuth();
 * const res = await spotifyFetchWithToken(session.accessToken, '/me/playlists');
 * ```
 */
export async function spotifyFetchWithToken(
  accessToken: string,
  path: string,
  init?: RequestInit,
  opts?: SpotifyClientOptions
): Promise<Response> {
  return spotifyProvider.fetchWithToken(accessToken, path, init, opts);
}

/**
 * Convenience JSON-getter with typed generic.
 * Throws on non-2xx responses with a useful message.
 */
export async function getJSON<T>(
  path: string,
  opts?: SpotifyClientOptions
): Promise<T> {
  return spotifyProvider.getJSON<T>(path, opts);
}