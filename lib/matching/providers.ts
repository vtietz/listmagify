import { apiFetch } from '@/lib/api/client';
import type { MusicProviderId, Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@features/dnd/model/types';
import { pickTopCandidates, type ScoredCandidate } from './scoring';
import { getConfiguredMatchThresholds } from './config';
import { buildProviderSearchQuery, buildProviderFallbackQuery } from './searchQuery';

export interface MatchCandidate {
  provider: MusicProviderId;
  trackId: string | null;
  trackUri: string;
  score: number;
  matchedBy: 'text' | 'duration';
  previewMetadata: {
    title: string;
    artists: string[];
    album: string | null;
    durationMs: number;
    releaseYear?: string;
  };
}

function extractReleaseYear(track: Track): string | undefined {
  const raw = track.album?.releaseDate;
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/^(\d{4})/);
  return match?.[1];
}

export interface ProviderMatchingAdapter {
  searchCandidates(payload: TrackPayload, targetProvider: MusicProviderId, limit?: number): Promise<MatchCandidate[]>;
  searchBestMatch(payload: TrackPayload, targetProvider: MusicProviderId): Promise<MatchCandidate | null>;
}

function buildQuery(payload: TrackPayload, provider: MusicProviderId): string {
  return buildProviderSearchQuery({
    title: payload.title,
    artist: payload.artists.join(' '),
    album: payload.album ?? undefined,
  }, provider);
}

function buildFallbackQuery(payload: TrackPayload, provider: MusicProviderId): string {
  return buildProviderFallbackQuery({
    title: payload.title,
    artist: payload.artists.join(' '),
  }, provider);
}

function dedupeTracksByUri(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const deduped: Track[] = [];

  for (const track of tracks) {
    if (!track.uri || seen.has(track.uri)) {
      continue;
    }

    seen.add(track.uri);
    deduped.push(track);
  }

  return deduped;
}

async function searchTracks(query: string, targetProvider: MusicProviderId, limit: number): Promise<Track[]> {
  if (!query) {
    return [];
  }

  const result = await apiFetch<{ tracks: Track[] }>('/api/search/tracks?' + new URLSearchParams({
    provider: targetProvider,
    q: query,
    limit: String(Math.max(1, Math.min(25, limit * 4))),
    offset: '0',
  }).toString());

  return result.tracks ?? [];
}

async function lookupTrackByIsrc(isrc: string, targetProvider: MusicProviderId): Promise<Track | null> {
  try {
    const result = await apiFetch<{ track: Track | null }>('/api/tracks/isrc?' + new URLSearchParams({
      provider: targetProvider,
      isrc,
    }).toString());
    return result.track ?? null;
  } catch {
    return null;
  }
}

/** Build a MatchCandidate from an ISRC-matched track. */
function buildIsrcCandidate(track: Track, targetProvider: MusicProviderId): MatchCandidate {
  return {
    provider: targetProvider,
    trackId: track.id,
    trackUri: track.uri,
    score: 1.0,
    matchedBy: 'text',
    previewMetadata: buildPreviewMetadata(track),
  };
}

/** Try ISRC lookup and return a single-element array on hit, or null to continue. */
async function tryIsrcLookup(
  payload: TrackPayload,
  targetProvider: MusicProviderId
): Promise<MatchCandidate[] | null> {
  if (!payload.isrc) {
    return null;
  }

  const isrcTrack = await lookupTrackByIsrc(payload.isrc, targetProvider);
  if (!isrcTrack?.id) {
    return null;
  }

  return [buildIsrcCandidate(isrcTrack, targetProvider)];
}

/** Determine whether a fallback (album-less) search should run. */
function shouldRunFallbackSearch(
  payload: TrackPayload,
  fallbackQuery: string,
  primaryQuery: string,
  primaryBestScore: number | undefined
): boolean {
  if (!payload.album || fallbackQuery.length === 0 || fallbackQuery === primaryQuery) {
    return false;
  }

  const thresholds = getConfiguredMatchThresholds();
  return primaryBestScore === undefined || primaryBestScore < thresholds.manual;
}

/** Search with primary query, optionally augmented by a fallback query. */
async function searchWithFallback(
  payload: TrackPayload,
  targetProvider: MusicProviderId,
  limit: number
): Promise<Track[]> {
  const query = buildQuery(payload, targetProvider);
  if (!query) {
    return [];
  }

  const primaryTracks = await searchTracks(query, targetProvider, limit);
  const fallbackQuery = buildFallbackQuery(payload, targetProvider);
  const primaryBestScore = pickTopCandidates(payload, primaryTracks, 1)[0]?.score;

  if (!shouldRunFallbackSearch(payload, fallbackQuery, query, primaryBestScore)) {
    return primaryTracks;
  }

  const fallbackTracks = await searchTracks(fallbackQuery, targetProvider, limit);
  return dedupeTracksByUri([...primaryTracks, ...fallbackTracks]);
}

/** Build preview metadata from a Track. */
function buildPreviewMetadata(track: Track): MatchCandidate['previewMetadata'] {
  const releaseYear = extractReleaseYear(track);
  return {
    title: track.name,
    artists: track.artists ?? [],
    album: track.album?.name ?? null,
    durationMs: track.durationMs,
    ...(releaseYear ? { releaseYear } : {}),
  };
}

/** Map scored candidates to MatchCandidate results. */
function mapScoredToMatchCandidates(
  scored: ScoredCandidate[],
  targetProvider: MusicProviderId
): MatchCandidate[] {
  return scored.map((candidate) => ({
    provider: targetProvider,
    trackId: candidate.track.id,
    trackUri: candidate.track.uri,
    score: candidate.score,
    matchedBy: candidate.matchedBy,
    previewMetadata: buildPreviewMetadata(candidate.track),
  }));
}

class ApiSearchProviderAdapter implements ProviderMatchingAdapter {
  async searchCandidates(payload: TrackPayload, targetProvider: MusicProviderId, limit = 3): Promise<MatchCandidate[]> {
    const isrcResult = await tryIsrcLookup(payload, targetProvider);
    if (isrcResult) {
      return isrcResult;
    }

    const combinedTracks = await searchWithFallback(payload, targetProvider, limit);
    if (combinedTracks.length === 0) {
      return [];
    }

    const scored = pickTopCandidates(payload, combinedTracks, limit);
    return mapScoredToMatchCandidates(scored, targetProvider);
  }

  async searchBestMatch(payload: TrackPayload, targetProvider: MusicProviderId): Promise<MatchCandidate | null> {
    const [best] = await this.searchCandidates(payload, targetProvider, 1);
    return best ?? null;
  }
}

export function createProviderMatchingAdapter(): ProviderMatchingAdapter {
  return new ApiSearchProviderAdapter();
}
