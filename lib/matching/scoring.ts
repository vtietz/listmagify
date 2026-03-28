import type { Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@features/dnd/model/types';
import { DEFAULT_MATCH_THRESHOLDS } from './config';
import {
  tokenSimilarity,
  bestArtistSimilarity,
  durationSimilarity,
  computeWeightedScore,
} from './scoring-core';

export interface ScoredCandidate {
  track: Track;
  score: number;
  matchedBy: 'text' | 'duration';
}

export function scoreCandidate(source: TrackPayload, candidate: Track): ScoredCandidate {
  const titleScore = tokenSimilarity(source.title, candidate.name);
  const artistScore = bestArtistSimilarity(source.artists, candidate.artists ?? []);
  const albumScore = tokenSimilarity(source.album ?? '', candidate.album?.name ?? '');
  const durationSec = source.durationSec;
  const durationScore = durationSimilarity(durationSec, candidate.durationMs ?? 0);

  const weighted = computeWeightedScore({ titleScore, artistScore, albumScore, durationScore });

  return {
    track: candidate,
    score: weighted,
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
