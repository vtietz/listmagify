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
      // Fast-path: ISRC lookup
      if (query.isrc && provider.getTrackByIsrc) {
        try {
          const track = await withLookupTimeout(
            provider.getTrackByIsrc(query.isrc),
            `[sync/materialize] ISRC lookup (${providerId ?? 'unknown'})`,
          );
          if (track?.id) {
            return [{
              id: track.id,
              title: track.name,
              artists: track.artists,
              durationSec: track.durationMs
                ? Math.round(track.durationMs / 1000)
                : null,
              isrc: track.isrc ?? null,
            }];
          }
        } catch {
          // ISRC lookup failed — fall through to text search
        }
      }

      // Fallback: text search (structured for Spotify, plain for TIDAL)
      const searchQuery = providerId
        ? buildProviderSearchQuery({ title: query.title, artist: query.artist }, providerId)
        : `${query.title} ${query.artist}`.trim();
      if (!searchQuery) return [];

      const result = await withLookupTimeout(
        provider.searchTracks(searchQuery, MATERIALIZE_SEARCH_LIMIT),
        `[sync/materialize] text search (${providerId ?? 'unknown'})`,
      );

      let tracks = result.tracks;

      // Retry with title + narrower artist when primary results are empty.
      if (tracks.length === 0 && query.title.trim() && query.artist.trim()) {
        const fallbackArtist = buildNarrowArtistVariant(query.artist);
        const fallbackQuery = providerId
          ? buildProviderFallbackQuery({ title: query.title, artist: fallbackArtist }, providerId)
          : `${query.title.trim()} ${fallbackArtist}`.trim();

        if (fallbackQuery) {
          const fallbackResult = await withLookupTimeout(
            provider.searchTracks(fallbackQuery, MATERIALIZE_SEARCH_LIMIT),
            `[sync/materialize] fallback search (${providerId ?? 'unknown'})`,
          );
          tracks = fallbackResult.tracks;
        }
      }

      return tracks.map(
        (track): MaterializeSearchCandidate => ({
          id: track.id ?? track.uri,
          title: track.name,
          artists: track.artists,
          durationSec: track.durationMs
            ? Math.round(track.durationMs / 1000)
            : null,
          isrc: track.isrc ?? null,
        }),
      );
    },
  };
}
