import type { MusicProvider } from '@/lib/music-provider/types';
import type {
  MaterializeProviderAdapter,
  MaterializeSearchCandidate,
} from '@/lib/recs/materialize';

/**
 * Wraps a MusicProvider to implement the MaterializeProviderAdapter interface.
 * Tries ISRC lookup first for an instant match, then falls back to text search.
 */
export function createSyncMaterializeAdapter(
  provider: MusicProvider,
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

      // Fallback: text search
      const searchQuery = `${query.title} ${query.artist}`.trim();
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
