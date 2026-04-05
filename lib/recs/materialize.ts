import type { MusicProviderId } from '@/lib/music-provider/types';
import { getCanonicalTrackMetadata, toProviderTrack, upsertProviderMap } from '@/lib/resolver/canonicalResolver';
import { scoreToConfidence, DEFAULT_MATCH_THRESHOLDS } from '@/lib/matching/config';

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
}

export interface MaterializeCanonicalResult {
  trackIds: string[];
  unresolvedCanonicalIds: string[];
  partial: boolean;
}

function isDurationCompatible(
  targetDuration: number | null,
  candidateDuration: number | null | undefined,
): boolean {
  if (targetDuration == null || candidateDuration == null) {
    return true;
  }

  // Allow up to 10 seconds difference — different masters/providers
  // often have slight duration variations
  return Math.abs(targetDuration - candidateDuration) <= 10;
}

function isLikelyArtistMatch(sourceArtistNorm: string, candidateArtists: string[]): boolean {
  if (!sourceArtistNorm) return false;
  const sourceTokens = new Set(sourceArtistNorm.split(' ').filter(Boolean));
  if (sourceTokens.size === 0) return false;

  const candidateNorm = candidateArtists.join(' ').toLowerCase();
  let matched = 0;
  for (const token of sourceTokens) {
    if (candidateNorm.includes(token)) {
      matched += 1;
    }
  }

  // Require at least one token match; for multi-token artists require
  // at least a third (rounded up) to account for name variations
  // across providers (e.g. "DJ Hell" vs "DJ Hell Remix")
  return matched >= Math.max(1, Math.ceil(sourceTokens.size / 3));
}

export async function materializeCanonicalTrackIds(
  input: MaterializeCanonicalInput,
): Promise<MaterializeCanonicalResult> {
  const trackIds: string[] = [];
  const unresolvedCanonicalIds: string[] = [];
  const seenProviderTrackIds = new Set<string>();
  const seenTrackSignatures = new Set<string>();

  for (const canonicalTrackId of input.canonicalTrackIds) {
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

    try {
      const candidates = await input.adapter.searchTrack({
        title: metadata.titleNorm,
        artist,
        isrc: metadata.isrc,
        durationSec: metadata.durationSec,
      });

      const match = candidates.find((candidate) => {
        if (!isDurationCompatible(metadata.durationSec, candidate.durationSec)) {
          return false;
        }

        if (!isLikelyArtistMatch(metadata.artistNorm, candidate.artists)) {
          return false;
        }

        const signature = `${candidate.title.toLowerCase()}::${candidate.artists.join(',').toLowerCase()}`;
        if (seenTrackSignatures.has(signature)) {
          return false;
        }

        seenTrackSignatures.add(signature);
        return true;
      });

      if (!match || seenProviderTrackIds.has(match.id)) {
        unresolvedCanonicalIds.push(canonicalTrackId);
        continue;
      }

      seenProviderTrackIds.add(match.id);
      trackIds.push(match.id);

      // Write back the discovered mapping so future syncs hit the cache
      const isIsrcMatch = !!(metadata.isrc && match.isrc && metadata.isrc === match.isrc);
      const matchScore = isIsrcMatch ? 1.0 : 0.8;
      const confidence = scoreToConfidence(matchScore, DEFAULT_MATCH_THRESHOLDS);
      upsertProviderMap({
        provider: input.provider,
        providerTrackId: match.id,
        canonicalTrackId,
        isrc: match.isrc ?? null,
        matchScore,
        confidence,
      });
    } catch (error) {
      console.warn('[recs/materialize] provider search failed', {
        provider: input.provider,
        canonicalTrackId,
        error: error instanceof Error ? error.message : String(error),
      });
      unresolvedCanonicalIds.push(canonicalTrackId);
    }
  }

  return {
    trackIds,
    unresolvedCanonicalIds,
    partial: unresolvedCanonicalIds.length > 0,
  };
}
