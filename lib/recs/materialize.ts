import type { MusicProviderId } from '@/lib/music-provider/types';
import { getCanonicalTrackMetadata, toProviderTrack, upsertProviderMap } from '@/lib/resolver/canonicalResolver';
import { scoreToConfidence, DEFAULT_MATCH_THRESHOLDS } from '@/lib/matching/config';
import { computeWeightedScore, durationSimilarity, tokenSimilarity } from '@/lib/matching/scoring-core';

export interface MaterializeSearchCandidate {
  id: string;
  title: string;
  artists: string[];
  durationSec?: number | null;
  isrc?: string | null;
}

export interface MaterializeProviderAdapter {
  searchTrack(query: {
    title: string;
    artist: string;
    isrc?: string | null;
    durationSec?: number | null;
  }): Promise<MaterializeSearchCandidate[]>;
}

export interface MaterializeCanonicalInput {
  provider: MusicProviderId;
  canonicalTrackIds: string[];
  adapter?: MaterializeProviderAdapter;
  thresholds?: { convert: number; manual: number };
  onCanonicalProcessed?: () => void;
}

export interface MaterializeCanonicalResult {
  trackIds: string[];
  unresolvedCanonicalIds: string[];
  partial: boolean;
}

function computeCandidateScore(
  metadata: NonNullable<ReturnType<typeof getCanonicalTrackMetadata>>,
  candidate: MaterializeSearchCandidate,
): number {
  if (metadata.isrc && candidate.isrc && metadata.isrc === candidate.isrc) {
    return 1;
  }

  const titleScore = tokenSimilarity(metadata.titleNorm, candidate.title);
  const artistScore = tokenSimilarity(metadata.artistNorm, candidate.artists.join(' '));

  const durationScore =
    metadata.durationSec != null && candidate.durationSec != null
      ? durationSimilarity(metadata.durationSec, candidate.durationSec * 1000)
      : 0;

  return computeWeightedScore({
    titleScore,
    artistScore,
    durationScore,
  });
}

function buildTrackSignature(candidate: MaterializeSearchCandidate): string {
  return `${candidate.title.toLowerCase()}::${candidate.artists.join(',').toLowerCase()}`;
}

function findCompatibleCandidate(
  candidates: MaterializeSearchCandidate[],
  metadata: NonNullable<ReturnType<typeof getCanonicalTrackMetadata>>,
  seenTrackSignatures: Set<string>,
  thresholds: { convert: number; manual: number },
): { match: MaterializeSearchCandidate | null; score: number } {
  let bestMatch: MaterializeSearchCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const signature = buildTrackSignature(candidate);
    if (seenTrackSignatures.has(signature)) {
      continue;
    }

    const score = computeCandidateScore(metadata, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (!bestMatch || bestScore < thresholds.convert) {
    return { match: null, score: bestScore };
  }

  seenTrackSignatures.add(buildTrackSignature(bestMatch));
  return { match: bestMatch, score: bestScore };
}

function persistDiscoveredMapping(
  provider: MusicProviderId,
  canonicalTrackId: string,
  match: MaterializeSearchCandidate,
  matchScore: number,
  thresholds: { convert: number; manual: number },
): void {
  const confidence = scoreToConfidence(matchScore, thresholds);

  upsertProviderMap({
    provider,
    providerTrackId: match.id,
    canonicalTrackId,
    isrc: match.isrc ?? null,
    matchScore,
    confidence,
  });
}

export async function materializeCanonicalTrackIds(
  input: MaterializeCanonicalInput,
): Promise<MaterializeCanonicalResult> {
  const thresholds = input.thresholds ?? DEFAULT_MATCH_THRESHOLDS;
  const trackIds: string[] = [];
  const unresolvedCanonicalIds: string[] = [];
  const seenProviderTrackIds = new Set<string>();
  const seenTrackSignatures = new Set<string>();

  for (const canonicalTrackId of input.canonicalTrackIds) {
    try {
      const mapped = toProviderTrack(input.provider, canonicalTrackId);
      if (mapped?.providerTrackId && !seenProviderTrackIds.has(mapped.providerTrackId)) {
        seenProviderTrackIds.add(mapped.providerTrackId);
        trackIds.push(mapped.providerTrackId);
        continue;
      }

      if (!input.adapter) {
        unresolvedCanonicalIds.push(canonicalTrackId);
        continue;
      }

      const metadata = getCanonicalTrackMetadata(canonicalTrackId);
      if (!metadata) {
        unresolvedCanonicalIds.push(canonicalTrackId);
        continue;
      }

      const artist = metadata.artistNorm;

      const candidates = await input.adapter.searchTrack({
        title: metadata.titleNorm,
        artist,
        isrc: metadata.isrc,
        durationSec: metadata.durationSec,
      });

      const { match, score } = findCompatibleCandidate(
        candidates,
        metadata,
        seenTrackSignatures,
        thresholds,
      );

      if (!match || seenProviderTrackIds.has(match.id)) {
        if (!match && candidates.length > 0) {
          console.debug('[recs/materialize] unresolved despite search results', {
            provider: input.provider,
            canonicalTrackId,
            titleNorm: metadata.titleNorm,
            artistNorm: metadata.artistNorm,
            durationSec: metadata.durationSec,
            candidateCount: candidates.length,
            topCandidates: candidates.slice(0, 3).map((candidate) => ({
              id: candidate.id,
              title: candidate.title,
              artists: candidate.artists,
              durationSec: candidate.durationSec ?? null,
              isrc: candidate.isrc ?? null,
            })),
          });
        }
        unresolvedCanonicalIds.push(canonicalTrackId);
        continue;
      }

      seenProviderTrackIds.add(match.id);
      trackIds.push(match.id);
      // Write back the discovered mapping so future syncs hit the cache.
      persistDiscoveredMapping(input.provider, canonicalTrackId, match, score, thresholds);
    } catch (error) {
      console.warn('[recs/materialize] provider search failed', {
        provider: input.provider,
        canonicalTrackId,
        error: error instanceof Error ? error.message : String(error),
      });
      unresolvedCanonicalIds.push(canonicalTrackId);
    } finally {
      input.onCanonicalProcessed?.();
    }
  }

  return {
    trackIds,
    unresolvedCanonicalIds,
    partial: unresolvedCanonicalIds.length > 0,
  };
}
