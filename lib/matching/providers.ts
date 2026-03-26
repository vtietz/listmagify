import { apiFetch } from '@/lib/api/client';
import type { MusicProviderId, Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@/hooks/dnd/types';
import { pickTopCandidates } from './scoring';

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

class ApiSearchProviderAdapter implements ProviderMatchingAdapter {
  async searchCandidates(payload: TrackPayload, targetProvider: MusicProviderId, limit = 3): Promise<MatchCandidate[]> {
    const query = buildQuery(payload);
    if (!query) {
      return [];
    }

    const result = await apiFetch<{ tracks: Track[] }>('/api/search/tracks?' + new URLSearchParams({
      provider: targetProvider,
      q: query,
      limit: String(Math.max(1, Math.min(25, limit * 4))),
      offset: '0',
    }).toString());

    const scored = pickTopCandidates(payload, result.tracks ?? [], limit);

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
