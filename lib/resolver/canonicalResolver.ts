import { randomUUID } from 'crypto';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { getRecsDb } from '@/lib/recs/db';
import { normalizeTrackSignals, tokenSimilarity } from './normalize';

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

function toConfidence(score: number): MappingConfidence {
  if (score >= 0.9) return 'high';
  if (score >= 0.75) return 'medium';
  return 'low';
}

function scoreCanonicalCandidate(
  source: ReturnType<typeof normalizeTrackSignals>,
  candidate: CanonicalCandidate,
  isrc: string | null | undefined,
): number {
  if (isrc && candidate.isrc && isrc === candidate.isrc) {
    return 1;
  }

  const titleScore = tokenSimilarity(source.titleNorm, candidate.title_norm);
  const artistScore = tokenSimilarity(source.artistNorm, candidate.artist_norm);

  let durationScore = 0;
  if (source.durationSec != null && candidate.duration_sec != null) {
    const delta = Math.abs(source.durationSec - candidate.duration_sec);
    if (delta <= 1) durationScore = 1;
    else if (delta <= 2) durationScore = 0.92;
    else if (delta <= 4) durationScore = 0.8;
    else if (delta <= 8) durationScore = 0.5;
  }

  return Number(((titleScore * 0.45) + (artistScore * 0.4) + (durationScore * 0.15)).toFixed(4));
}

function upsertProviderMap(input: {
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

function findBestCanonicalCandidate(input: ResolveProviderTrackInput): {
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
    candidateId: bestScore >= 0.8 ? bestId : null,
    score: bestScore,
  };
}

export function fromProviderTrack(input: ResolveProviderTrackInput): CanonicalMappingResult {
  const db = getRecsDb();

  const existing = db.prepare(`
    SELECT canonical_track_id as canonicalTrackId, match_score as matchScore, confidence
    FROM provider_track_map
    WHERE provider = ? AND provider_track_id = ?
  `).get(input.provider, input.providerTrackId) as
    | { canonicalTrackId: string; matchScore: number; confidence: MappingConfidence }
    | undefined;

  if (existing) {
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

  const { candidateId, score } = findBestCanonicalCandidate(input);
  const canonicalTrackId = candidateId ?? randomUUID();
  const matchScore = candidateId ? score : 1;
  const confidence = candidateId ? toConfidence(score) : 'high';

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
      title_norm = COALESCE(NULLIF(excluded.title_norm, ''), canonical_tracks.title_norm),
      artist_norm = COALESCE(NULLIF(excluded.artist_norm, ''), canonical_tracks.artist_norm),
      duration_sec = COALESCE(excluded.duration_sec, canonical_tracks.duration_sec),
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
