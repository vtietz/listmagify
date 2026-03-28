import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import type {
  MaterializeProviderAdapter,
  MaterializeSearchCandidate,
} from '@/lib/recs/materialize';
import { buildProviderSearchQuery } from '@/lib/matching/searchQuery';

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
          const track = await provider.getTrackByIsrc(query.isrc);
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

      const result = await provider.searchTracks(searchQuery, 5);

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
