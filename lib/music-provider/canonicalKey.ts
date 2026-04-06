import { normalizeText, normalizeArtists } from '@/lib/resolver/normalize';
import type { Track } from './types';

/**
 * Derive a canonical comparison key for a track based on normalized title and artists.
 * Used by compare mode to match the same song across different providers.
 */
export function getCanonicalTrackKey(track: Track): string {
  const title = normalizeText(track.name);
  const artists = normalizeArtists(track.artists);
  const textKey = `text:${title}|${artists}`;

  const isrc = track.isrc?.trim().toLowerCase();
  if (isrc) {
    // Expose both keys so compare mode can use ISRC first and fall back to text.
    return `isrc:${isrc}||${textKey}`;
  }

  return textKey;
}
