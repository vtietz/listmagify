import { normalizeText as coreNormalizeText, tokenSimilarity as coreTokenSimilarity } from '@/lib/matching/scoring-core';

export const normalizeText = coreNormalizeText;
export const tokenSimilarity = coreTokenSimilarity;

export interface NormalizedTrackSignals {
  titleNorm: string;
  artistNorm: string;
  durationSec: number | null;
}

export function normalizeArtists(artists: string[]): string {
  return artists
    .map((artist) => coreNormalizeText(artist))
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function normalizeTrackSignals(input: {
  title: string;
  artists: string[];
  durationMs?: number | null;
}): NormalizedTrackSignals {
  return {
    titleNorm: coreNormalizeText(input.title),
    artistNorm: normalizeArtists(input.artists),
    durationSec: input.durationMs != null ? Math.round(input.durationMs / 1000) : null,
  };
}
