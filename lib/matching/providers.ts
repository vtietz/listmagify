import { apiFetch } from '@/lib/api/client';
import type { MusicProviderId, Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@/hooks/dnd/types';
import { pickBestCandidate } from './scoring';

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
  };
}

export interface ProviderMatchingAdapter {
  searchBestMatch(payload: TrackPayload, targetProvider: MusicProviderId): Promise<MatchCandidate | null>;
}

function buildQuery(payload: TrackPayload): string {
  const artists = payload.artists.join(' ').trim();
  const album = payload.album?.trim() ?? '';
  return [payload.title, artists, album].filter(Boolean).join(' ').trim();
}

class ApiSearchProviderAdapter implements ProviderMatchingAdapter {
  async searchBestMatch(payload: TrackPayload, targetProvider: MusicProviderId): Promise<MatchCandidate | null> {
    const query = buildQuery(payload);
    if (!query) {
      return null;
    }

    const result = await apiFetch<{ tracks: Track[] }>('/api/search/tracks?' + new URLSearchParams({
      provider: targetProvider,
      q: query,
      limit: '10',
      offset: '0',
    }).toString());

    const best = pickBestCandidate(payload, result.tracks ?? []);
    if (!best) {
      return null;
    }

    return {
      provider: targetProvider,
      trackId: best.track.id,
      trackUri: best.track.uri,
      score: best.score,
      matchedBy: best.matchedBy,
      previewMetadata: {
        title: best.track.name,
        artists: best.track.artists ?? [],
        album: best.track.album?.name ?? null,
        durationMs: best.track.durationMs,
      },
    };
  }
}

export function createProviderMatchingAdapter(): ProviderMatchingAdapter {
  return new ApiSearchProviderAdapter();
}
