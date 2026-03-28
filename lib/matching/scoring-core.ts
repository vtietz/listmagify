/**
 * Shared scoring primitives used by both the browse/search matching engine
 * and the canonical resolver. This module must remain environment-agnostic
 * (no browser APIs, no Node/SQLite dependencies).
 */

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

export function bestArtistSimilarity(sourceArtists: string[], candidateArtists: string[]): number {
  if (sourceArtists.length === 0 || candidateArtists.length === 0) {
    return 0;
  }

  let best = 0;
  for (const sourceArtist of sourceArtists) {
    for (const candidateArtist of candidateArtists) {
      best = Math.max(best, tokenSimilarity(sourceArtist, candidateArtist));
    }
  }
  return best;
}

export function durationSimilarity(sourceDurationSec: number, candidateDurationMs: number): number {
  if (sourceDurationSec <= 0 || candidateDurationMs <= 0) {
    return 0;
  }

  const candidateSec = Math.round(candidateDurationMs / 1000);
  const delta = Math.abs(sourceDurationSec - candidateSec);

  if (delta <= 1) return 1;
  if (delta <= 3) return 0.9;
  if (delta <= 6) return 0.7;
  if (delta <= 10) return 0.4;
  return 0;
}

export const SCORING_WEIGHTS = {
  title: 0.35,
  artist: 0.40,
  album: 0.15,
  duration: 0.10,
} as const;

/**
 * Compute a weighted match score. When `albumScore` is undefined (e.g. the
 * canonical resolver path where no album data is stored), the album weight
 * is redistributed proportionally across the remaining signals.
 */
export function computeWeightedScore(signals: {
  titleScore: number;
  artistScore: number;
  albumScore?: number;
  durationScore: number;
}): number {
  if (signals.albumScore !== undefined) {
    const weighted =
      signals.titleScore * SCORING_WEIGHTS.title +
      signals.artistScore * SCORING_WEIGHTS.artist +
      signals.albumScore * SCORING_WEIGHTS.album +
      signals.durationScore * SCORING_WEIGHTS.duration;
    return Number(weighted.toFixed(4));
  }

  // Redistribute album weight proportionally
  const base = SCORING_WEIGHTS.title + SCORING_WEIGHTS.artist + SCORING_WEIGHTS.duration;
  const weighted =
    signals.titleScore * (SCORING_WEIGHTS.title / base) +
    signals.artistScore * (SCORING_WEIGHTS.artist / base) +
    signals.durationScore * (SCORING_WEIGHTS.duration / base);
  return Number(weighted.toFixed(4));
}
