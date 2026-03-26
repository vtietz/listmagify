import type { Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@/hooks/dnd/types';
import { DEFAULT_MATCH_THRESHOLDS } from './config';

export interface ScoredCandidate {
  track: Track;
  score: number;
  matchedBy: 'text' | 'duration';
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(remaster(ed)?|live|version|mono|stereo|deluxe|radio edit)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
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

function bestArtistSimilarity(sourceArtists: string[], candidateArtists: string[]): number {
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

function durationSimilarity(sourceDurationSec: number, candidateDurationMs: number): number {
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

export function scoreCandidate(source: TrackPayload, candidate: Track): ScoredCandidate {
  const titleScore = tokenSimilarity(source.title, candidate.name);
  const artistScore = bestArtistSimilarity(source.artists, candidate.artists ?? []);
  const albumScore = tokenSimilarity(source.album ?? '', candidate.album?.name ?? '');
  const durationScore = durationSimilarity(source.durationSec, candidate.durationMs ?? 0);

  const weighted = (titleScore * 0.35)
    + (artistScore * 0.4)
    + (albumScore * 0.15)
    + (durationScore * 0.1);

  return {
    track: candidate,
    score: Number(weighted.toFixed(4)),
    matchedBy: durationScore >= 0.9 ? 'duration' : 'text',
  };
}

export function pickBestCandidate(source: TrackPayload, candidates: Track[]): ScoredCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  return candidates
    .map((candidate) => scoreCandidate(source, candidate))
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

export function pickTopCandidates(source: TrackPayload, candidates: Track[], limit = 3): ScoredCandidate[] {
  if (candidates.length === 0 || limit <= 0) {
    return [];
  }

  return candidates
    .map((candidate) => scoreCandidate(source, candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export const MATCH_THRESHOLDS = {
  convert: DEFAULT_MATCH_THRESHOLDS.convert,
  manual: DEFAULT_MATCH_THRESHOLDS.manual,
};
