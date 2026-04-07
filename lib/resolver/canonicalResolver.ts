import { randomUUID } from 'crypto';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { getRecsDb } from '@/lib/recs/db';
import { normalizeTrackSignals, tokenSimilarity } from './normalize';
import { durationSimilarity, computeWeightedScore } from '@/lib/matching/scoring-core';
import { DEFAULT_MATCH_THRESHOLDS, scoreToConfidence } from '@/lib/matching/config';

export type MappingConfidence = 'high' | 'medium' | 'low';

export interface ResolveProviderTrackInput {
  provider: MusicProviderId;
  providerTrackId: string;
  title: string;
  artists: string[];
  durationMs?: number | null;
  isrc?: string | null;
  albumUpc?: string | null;
}

export interface CanonicalMappingResult {
  canonicalTrackId: string;
  matchScore: number;
  confidence: MappingConfidence;
  fromCache: boolean;
}

type CanonicalCandidate = {
  id: string;
  isrc: string | null;
  title_norm: string;
  artist_norm: string;
  duration_sec: number | null;
};

function getCanonicalCandidateById(canonicalTrackId: string): CanonicalCandidate | null {
  const db = getRecsDb();
  const row = db.prepare(`
    SELECT id, isrc, title_norm, artist_norm, duration_sec
    FROM canonical_tracks
    WHERE id = ?
  `).get(canonicalTrackId) as CanonicalCandidate | undefined;

  return row ?? null;
}

function isCachedMappingCompatible(
  input: ResolveProviderTrackInput,
  cachedCanonicalTrackId: string,
  acceptThreshold: number,
): boolean {
  const candidate = getCanonicalCandidateById(cachedCanonicalTrackId);
  if (!candidate) {
    return false;
  }

  // Strong guard: if both sides have ISRC and they differ, force re-resolution.
  if (input.isrc && candidate.isrc && input.isrc !== candidate.isrc) {
    return false;
  }

  const signals = normalizeTrackSignals({
    title: input.title,
    artists: input.artists,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
  });

  const score = scoreCanonicalCandidate(signals, candidate, input.isrc);
  return score >= acceptThreshold;
}

function deleteProviderMapping(provider: MusicProviderId, providerTrackId: string): void {
  const db = getRecsDb();
  db.prepare(`
    DELETE FROM provider_track_map
    WHERE provider = ? AND provider_track_id = ?
  `).run(provider, providerTrackId);
}

function scoreCanonicalCandidate(
  source: ReturnType<typeof normalizeTrackSignals>,
  candidate: CanonicalCandidate,
  isrc: string | null | undefined,
): number {
  if (isrc && candidate.isrc && isrc === candidate.isrc) {
    return 1;
  }

  // If both tracks have ISRC and they disagree, they are different recordings.
  if (isrc && candidate.isrc && isrc !== candidate.isrc) {
    return 0;
  }

  const titleScore = tokenSimilarity(source.titleNorm, candidate.title_norm);
  const artistScore = tokenSimilarity(source.artistNorm, candidate.artist_norm);

  const durationScore =
    source.durationSec != null && candidate.duration_sec != null
      ? durationSimilarity(source.durationSec, candidate.duration_sec * 1000)
      : 0;

  // No album data in canonical_tracks table, so albumScore is omitted.
  // computeWeightedScore redistributes the album weight proportionally.
  return computeWeightedScore({ titleScore, artistScore, durationScore });
}

export function upsertProviderMap(input: {
  provider: MusicProviderId;
  providerTrackId: string;
  canonicalTrackId: string;
  isrc?: string | null;
  matchScore: number;
  confidence: MappingConfidence;
}): void {
  const db = getRecsDb();
  db.prepare(`
    INSERT INTO provider_track_map (
      provider,
      provider_track_id,
      canonical_track_id,
      isrc,
      match_score,
      confidence,
      resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(provider, provider_track_id) DO UPDATE SET
      canonical_track_id = excluded.canonical_track_id,
      isrc = excluded.isrc,
      match_score = excluded.match_score,
      confidence = excluded.confidence,
      resolved_at = excluded.resolved_at
  `).run(
    input.provider,
    input.providerTrackId,
    input.canonicalTrackId,
    input.isrc ?? null,
    input.matchScore,
    input.confidence,
  );
}

function findBestCanonicalCandidate(
  input: ResolveProviderTrackInput,
  acceptThreshold: number,
): {
  candidateId: string | null;
  score: number;
} {
  const db = getRecsDb();
  const signals = normalizeTrackSignals({
    title: input.title,
    artists: input.artists,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
  });

  let candidates: CanonicalCandidate[] = [];

  if (input.isrc) {
    candidates = db.prepare(`
      SELECT id, isrc, title_norm, artist_norm, duration_sec
      FROM canonical_tracks
      WHERE isrc = ?
      LIMIT 20
    `).all(input.isrc) as CanonicalCandidate[];
  }

  if (candidates.length === 0) {
    candidates = db.prepare(`
      SELECT id, isrc, title_norm, artist_norm, duration_sec
      FROM canonical_tracks
      WHERE title_norm = ?
         OR artist_norm = ?
         OR (title_norm LIKE ? AND artist_norm LIKE ?)
      LIMIT 100
    `).all(
      signals.titleNorm,
      signals.artistNorm,
      `%${signals.titleNorm.split(' ')[0] ?? ''}%`,
      `%${signals.artistNorm.split(' ')[0] ?? ''}%`,
    ) as CanonicalCandidate[];
  }

  let bestId: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreCanonicalCandidate(signals, candidate, input.isrc);
    if (score > bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return {
    candidateId: bestScore >= acceptThreshold ? bestId : null,
    score: bestScore,
  };
}

export interface ResolveOptions {
  thresholds?: { convert: number; manual: number };
}

// ---------------------------------------------------------------------------
// Batch lookup helpers
// ---------------------------------------------------------------------------

const BATCH_CHUNK_SIZE = 500;

interface CachedMapping {
  canonicalTrackId: string;
  matchScore: number;
  confidence: MappingConfidence;
  isrc: string | null;
}

function batchLookupProviderTrackMap(
  provider: MusicProviderId,
  providerTrackIds: string[],
): Map<string, CachedMapping> {
  const db = getRecsDb();
  const result = new Map<string, CachedMapping>();

  for (let i = 0; i < providerTrackIds.length; i += BATCH_CHUNK_SIZE) {
    const chunk = providerTrackIds.slice(i, i + BATCH_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');

    const rows = db.prepare(`
      SELECT
        provider_track_id AS providerTrackId,
        canonical_track_id AS canonicalTrackId,
        match_score AS matchScore,
        confidence,
        isrc
      FROM provider_track_map
      WHERE provider = ? AND provider_track_id IN (${placeholders})
    `).all(provider, ...chunk) as Array<{
      providerTrackId: string;
      canonicalTrackId: string;
      matchScore: number;
      confidence: MappingConfidence;
      isrc: string | null;
    }>;

    for (const row of rows) {
      result.set(row.providerTrackId, {
        canonicalTrackId: row.canonicalTrackId,
        matchScore: row.matchScore,
        confidence: row.confidence,
        isrc: row.isrc,
      });
    }
  }

  return result;
}

/**
 * Resolve a batch of provider tracks to canonical IDs.
 *
 * Phase 1: bulk-query `provider_track_map` for all inputs at once.
 * Phase 2: fall back to `fromProviderTrack()` for cache misses.
 *
 * This reduces N individual SQL selects to ~1 bulk query + M miss queries.
 */
export function fromProviderTrackBatch(
  inputs: ResolveProviderTrackInput[],
  options?: ResolveOptions,
): CanonicalMappingResult[] {
  if (inputs.length === 0) return [];

  // All inputs share the same provider
  const provider = inputs[0]!.provider;
  const providerTrackIds = inputs.map((i) => i.providerTrackId);

  // Phase 1: batch cache lookup
  const cached = batchLookupProviderTrackMap(provider, providerTrackIds);
  const thresholds = options?.thresholds ?? DEFAULT_MATCH_THRESHOLDS;

  const db = getRecsDb();
  const results: CanonicalMappingResult[] = [];

  for (const input of inputs) {
    const hit = cached.get(input.providerTrackId);
    if (hit) {
      const cacheCompatible = isCachedMappingCompatible(input, hit.canonicalTrackId, thresholds.manual);
      if (!cacheCompatible) {
        deleteProviderMapping(input.provider, input.providerTrackId);
        results.push(fromProviderTrack(input, options));
        continue;
      }

      // Backfill ISRC on cached entries that were stored without it
      if (input.isrc && !hit.isrc) {
        db.prepare(`
          UPDATE canonical_tracks SET isrc = ?
          WHERE id = ? AND isrc IS NULL
        `).run(input.isrc, hit.canonicalTrackId);

        db.prepare(`
          UPDATE provider_track_map SET isrc = ?
          WHERE provider = ? AND provider_track_id = ? AND isrc IS NULL
        `).run(input.isrc, input.provider, input.providerTrackId);
      }

      results.push({
        canonicalTrackId: hit.canonicalTrackId,
        matchScore: hit.matchScore,
        confidence: hit.confidence,
        fromCache: true,
      });
    } else {
      // Phase 2: individual resolution for cache misses
      results.push(fromProviderTrack(input, options));
    }
  }

  const cacheHits = results.filter((r) => r.fromCache).length;
  if (inputs.length > 0) {
    console.debug('[resolver] batch canonicalization', {
      total: inputs.length,
      cacheHits,
      cacheMisses: inputs.length - cacheHits,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Single-track resolution
// ---------------------------------------------------------------------------

export function fromProviderTrack(
  input: ResolveProviderTrackInput,
  options?: ResolveOptions,
): CanonicalMappingResult {
  const db = getRecsDb();
  const thresholds = options?.thresholds ?? DEFAULT_MATCH_THRESHOLDS;

  const existing = db.prepare(`
    SELECT canonical_track_id as canonicalTrackId, match_score as matchScore, confidence
    FROM provider_track_map
    WHERE provider = ? AND provider_track_id = ?
  `).get(input.provider, input.providerTrackId) as
    | { canonicalTrackId: string; matchScore: number; confidence: MappingConfidence }
    | undefined;

  if (existing) {
    const cacheCompatible = isCachedMappingCompatible(input, existing.canonicalTrackId, thresholds.manual);
    if (!cacheCompatible) {
      deleteProviderMapping(input.provider, input.providerTrackId);
      return fromProviderTrack(input, options);
    }

    // Backfill ISRC on cached entries that were stored without it
    if (input.isrc) {
      db.prepare(`
        UPDATE canonical_tracks SET isrc = ?
        WHERE id = ? AND isrc IS NULL
      `).run(input.isrc, existing.canonicalTrackId);

      db.prepare(`
        UPDATE provider_track_map SET isrc = ?
        WHERE provider = ? AND provider_track_id = ? AND isrc IS NULL
      `).run(input.isrc, input.provider, input.providerTrackId);
    }

    return {
      canonicalTrackId: existing.canonicalTrackId,
      matchScore: existing.matchScore,
      confidence: existing.confidence,
      fromCache: true,
    };
  }

  const signals = normalizeTrackSignals({
    title: input.title,
    artists: input.artists,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
  });

  const { candidateId, score } = findBestCanonicalCandidate(input, thresholds.manual);
  const canonicalTrackId = candidateId ?? randomUUID();
  const matchScore = candidateId ? score : 1;
  const confidence = candidateId ? scoreToConfidence(score, thresholds) : 'high';

  db.prepare(`
    INSERT INTO canonical_tracks (
      id,
      isrc,
      title_norm,
      artist_norm,
      duration_sec,
      album_upc,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      isrc = COALESCE(excluded.isrc, canonical_tracks.isrc),
      title_norm = canonical_tracks.title_norm,
      artist_norm = canonical_tracks.artist_norm,
      duration_sec = COALESCE(canonical_tracks.duration_sec, excluded.duration_sec),
      album_upc = COALESCE(excluded.album_upc, canonical_tracks.album_upc),
      updated_at = CURRENT_TIMESTAMP
  `).run(
    canonicalTrackId,
    input.isrc ?? null,
    signals.titleNorm,
    signals.artistNorm,
    signals.durationSec,
    input.albumUpc ?? null,
  );

  upsertProviderMap({
    provider: input.provider,
    providerTrackId: input.providerTrackId,
    canonicalTrackId,
    ...(input.isrc !== undefined ? { isrc: input.isrc } : {}),
    matchScore,
    confidence,
  });

  console.debug('[resolver] canonical mapping resolved', {
    provider: input.provider,
    providerTrackId: input.providerTrackId,
    canonicalTrackId,
    matchScore,
    confidence,
    fromCache: false,
  });

  return {
    canonicalTrackId,
    matchScore,
    confidence,
    fromCache: false,
  };
}

export function toProviderTrack(
  provider: MusicProviderId,
  canonicalTrackId: string,
): { providerTrackId: string; confidence: MappingConfidence } | null {
  const db = getRecsDb();

  const row = db.prepare(`
    SELECT provider_track_id as providerTrackId, confidence
    FROM provider_track_map
    WHERE provider = ? AND canonical_track_id = ?
    ORDER BY
      CASE confidence
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      resolved_at DESC
    LIMIT 1
  `).get(provider, canonicalTrackId) as
    | { providerTrackId: string; confidence: MappingConfidence }
    | undefined;

  if (!row) {
    return null;
  }

  return row;
}

export function getCanonicalTrackMetadata(canonicalTrackId: string): {
  id: string;
  isrc: string | null;
  titleNorm: string;
  artistNorm: string;
  durationSec: number | null;
} | null {
  const db = getRecsDb();
  const row = db.prepare(`
    SELECT id, isrc, title_norm as titleNorm, artist_norm as artistNorm, duration_sec as durationSec
    FROM canonical_tracks
    WHERE id = ?
  `).get(canonicalTrackId) as
    | { id: string; isrc: string | null; titleNorm: string; artistNorm: string; durationSec: number | null }
    | undefined;

  return row ?? null;
}
