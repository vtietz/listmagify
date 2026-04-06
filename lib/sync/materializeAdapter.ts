import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import type {
  MaterializeProviderAdapter,
  MaterializeSearchCandidate,
} from '@/lib/recs/materialize';
import { buildProviderSearchQuery } from '@/lib/matching/searchQuery';

const MATERIALIZE_LOOKUP_TIMEOUT_MS = Number(process.env.SYNC_PREVIEW_LOOKUP_TIMEOUT_MS ?? 8000);

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
        provider.searchTracks(searchQuery, 5),
        `[sync/materialize] text search (${providerId ?? 'unknown'})`,
      );

      return result.tracks.map(
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
