export interface NormalizedTrackSignals {
  titleNorm: string;
  artistNorm: string;
  durationSec: number | null;
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(remaster(ed)?|live|version|mono|stereo|deluxe|radio edit)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeArtists(artists: string[]): string {
  return artists
    .map((artist) => normalizeText(artist))
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
    titleNorm: normalizeText(input.title),
    artistNorm: normalizeArtists(input.artists),
    durationSec: input.durationMs != null ? Math.round(input.durationMs / 1000) : null,
  };
}

export function tokenSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}
