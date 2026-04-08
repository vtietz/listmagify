import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import type {
  MaterializeProviderAdapter,
  MaterializeSearchCandidate,
} from '@/lib/recs/materialize';
import { buildProviderFallbackQuery, buildProviderSearchQuery } from '@/lib/matching/searchQuery';

const MATERIALIZE_LOOKUP_TIMEOUT_MS = Number(process.env.SYNC_PREVIEW_LOOKUP_TIMEOUT_MS ?? 8000);
const MATERIALIZE_SEARCH_LIMIT = Number(process.env.SYNC_PREVIEW_SEARCH_LIMIT ?? 20);

function buildNarrowArtistVariant(artist: string): string {
  const trimmed = artist.trim();
  if (!trimmed) return '';

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return trimmed;
  }

  // Keep fallback precise: use the first two words from the canonical artist string.
  return words.slice(0, 2).join(' ');
}

function toCandidate(track: Awaited<ReturnType<MusicProvider['searchTracks']>>['tracks'][number]): MaterializeSearchCandidate {
  return {
    id: track.id ?? track.uri,
    title: track.name,
    artists: track.artists,
    durationSec: track.durationMs
      ? Math.round(track.durationMs / 1000)
      : null,
    isrc: track.isrc ?? null,
  };
}

async function lookupTrackByIsrc(
  provider: MusicProvider,
  providerId: MusicProviderId | undefined,
  isrc: string | null | undefined,
): Promise<MaterializeSearchCandidate[] | null> {
  if (!isrc || !provider.getTrackByIsrc) {
    return null;
  }

  try {
    const track = await withLookupTimeout(
      provider.getTrackByIsrc(isrc),
      `[sync/materialize] ISRC lookup (${providerId ?? 'unknown'})`,
    );
    if (!track?.id) {
      return null;
    }

    return [{
      id: track.id,
      title: track.name,
      artists: track.artists,
      durationSec: track.durationMs
        ? Math.round(track.durationMs / 1000)
        : null,
      isrc: track.isrc ?? null,
    }];
  } catch {
    return null;
  }
}

function buildSearchQuery(
  providerId: MusicProviderId | undefined,
  title: string,
  artist: string,
): string {
  return providerId
    ? buildProviderSearchQuery({ title, artist }, providerId)
    : `${title} ${artist}`.trim();
}

async function runSearch(
  provider: MusicProvider,
  providerId: MusicProviderId | undefined,
  query: string,
  label: string,
) {
  return withLookupTimeout(
    provider.searchTracks(query, MATERIALIZE_SEARCH_LIMIT),
    `[sync/materialize] ${label} (${providerId ?? 'unknown'})`,
  );
}

async function searchWithFallback(
  provider: MusicProvider,
  providerId: MusicProviderId | undefined,
  title: string,
  artist: string,
): Promise<MaterializeSearchCandidate[]> {
  const searchQuery = buildSearchQuery(providerId, title, artist);
  if (!searchQuery) {
    return [];
  }

  const primaryResult = await runSearch(provider, providerId, searchQuery, 'text search');
  if (primaryResult.tracks.length > 0 || !title.trim() || !artist.trim()) {
    return primaryResult.tracks.map(toCandidate);
  }

  const fallbackArtist = buildNarrowArtistVariant(artist);
  const fallbackQuery = providerId
    ? buildProviderFallbackQuery({ title, artist: fallbackArtist }, providerId)
    : `${title.trim()} ${fallbackArtist}`.trim();
  if (!fallbackQuery) {
    return [];
  }

  const fallbackResult = await runSearch(provider, providerId, fallbackQuery, 'fallback search');
  return fallbackResult.tracks.map(toCandidate);
}

async function withLookupTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${MATERIALIZE_LOOKUP_TIMEOUT_MS}ms`));
      }, MATERIALIZE_LOOKUP_TIMEOUT_MS);
    }),
  ]);
}

/**
 * Wraps a MusicProvider to implement the MaterializeProviderAdapter interface.
 * Tries ISRC lookup first for an instant match, then falls back to text search.
 */
export function createSyncMaterializeAdapter(
  provider: MusicProvider,
  providerId?: MusicProviderId,
): MaterializeProviderAdapter {
  return {
    async searchTrack(query) {
      const isrcHit = await lookupTrackByIsrc(provider, providerId, query.isrc);
      if (isrcHit) {
        return isrcHit;
      }

      return searchWithFallback(provider, providerId, query.title, query.artist);
    },
  };
}
