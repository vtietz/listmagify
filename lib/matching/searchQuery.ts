import type { MusicProviderId } from '@/lib/music-provider/types';

interface SearchQueryInput {
  title: string;
  artist: string;
  album?: string | undefined;
}

/**
 * Build a provider-optimized search query.
 *
 * - Spotify: uses structured filters (`track:`, `artist:`, `album:`) for
 *   more precise matching
 * - TIDAL: plain text concatenation (TIDAL search API does not support
 *   field-specific filters)
 */
export function buildProviderSearchQuery(
  input: SearchQueryInput,
  provider: MusicProviderId,
): string {
  const title = input.title.trim();
  const artist = input.artist.trim();
  const album = input.album?.trim() ?? '';

  if (!title && !artist) return '';

  if (provider === 'spotify') {
    return buildSpotifyQuery(title, artist, album);
  }

  return [title, artist, album].filter(Boolean).join(' ').trim();
}

/**
 * Build a fallback query (no album) for cases where the primary query
 * returns poor results.
 */
export function buildProviderFallbackQuery(
  input: Omit<SearchQueryInput, 'album'>,
  provider: MusicProviderId,
): string {
  return buildProviderSearchQuery({ title: input.title, artist: input.artist }, provider);
}

function buildSpotifyQuery(title: string, artist: string, album: string): string {
  const parts: string[] = [];

  if (title) parts.push(`track:${title}`);
  if (artist) parts.push(`artist:${artist}`);
  if (album) parts.push(`album:${album}`);

  return parts.join(' ');
}
