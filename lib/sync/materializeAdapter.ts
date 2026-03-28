import type { MusicProvider } from '@/lib/music-provider/types';
import type {
  MaterializeProviderAdapter,
  MaterializeSearchCandidate,
} from '@/lib/recs/materialize';

/**
 * Wraps a MusicProvider's searchTracks method to implement the
 * MaterializeProviderAdapter interface used by materializeCanonicalTrackIds.
 */
export function createSyncMaterializeAdapter(
  provider: MusicProvider,
): MaterializeProviderAdapter {
  return {
    async searchTrack(query) {
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
          isrc: null, // Standard track objects don't include ISRC
        }),
      );
    },
  };
}
