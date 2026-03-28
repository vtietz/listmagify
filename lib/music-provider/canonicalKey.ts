import { normalizeText, normalizeArtists } from '@/lib/resolver/normalize';
import type { Track } from './types';

/**
 * Derive a canonical comparison key for a track based on normalized title and artists.
 * Used by compare mode to match the same song across different providers.
 */
export function getCanonicalTrackKey(track: Track): string {
  const title = normalizeText(track.name);
  const artists = normalizeArtists(track.artists);
  return `${title}|${artists}`;
}
