import { apiFetch } from '@/lib/api/client';
import type { MusicProviderId, Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@features/dnd/model/types';
import { pickTopCandidates } from './scoring';
import { getConfiguredMatchThresholds } from './config';

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

function buildQuery(payload: TrackPayload): string {
  const artists = payload.artists.join(' ').trim();
  const album = payload.album?.trim() ?? '';
  return [payload.title, artists, album].filter(Boolean).join(' ').trim();
}

function buildFallbackQuery(payload: TrackPayload): string {
  const artists = payload.artists.join(' ').trim();
  return [payload.title, artists].filter(Boolean).join(' ').trim();
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

class ApiSearchProviderAdapter implements ProviderMatchingAdapter {
  async searchCandidates(payload: TrackPayload, targetProvider: MusicProviderId, limit = 3): Promise<MatchCandidate[]> {
    const query = buildQuery(payload);
    if (!query) {
      return [];
    }

    const thresholds = getConfiguredMatchThresholds();
    const primaryTracks = await searchTracks(query, targetProvider, limit);
    let combinedTracks = primaryTracks;

    const fallbackQuery = buildFallbackQuery(payload);
    const primaryBest = pickTopCandidates(payload, primaryTracks, 1)[0];
    const shouldRunFallback = Boolean(payload.album)
      && fallbackQuery.length > 0
      && fallbackQuery !== query
      && (!primaryBest || primaryBest.score < thresholds.manual);

    if (shouldRunFallback) {
      const fallbackTracks = await searchTracks(fallbackQuery, targetProvider, limit);
      combinedTracks = dedupeTracksByUri([...primaryTracks, ...fallbackTracks]);
    }

    const scored = pickTopCandidates(payload, combinedTracks, limit);

    return scored.map((candidate) => {
      const releaseYear = extractReleaseYear(candidate.track);

      return {
        provider: targetProvider,
        trackId: candidate.track.id,
        trackUri: candidate.track.uri,
        score: candidate.score,
        matchedBy: candidate.matchedBy,
        previewMetadata: {
          title: candidate.track.name,
          artists: candidate.track.artists ?? [],
          album: candidate.track.album?.name ?? null,
          durationMs: candidate.track.durationMs,
          ...(releaseYear ? { releaseYear } : {}),
        },
      };
    });
  }

  async searchBestMatch(payload: TrackPayload, targetProvider: MusicProviderId): Promise<MatchCandidate | null> {
    const [best] = await this.searchCandidates(payload, targetProvider, 1);
    return best ?? null;
  }
}

export function createProviderMatchingAdapter(): ProviderMatchingAdapter {
  return new ApiSearchProviderAdapter();
}
