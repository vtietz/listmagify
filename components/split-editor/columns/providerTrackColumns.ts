import type { MusicProviderId } from '@/lib/music-provider/types';

export type TrackColumnVisibility = {
  showReleaseYearColumn: boolean;
  showPopularityColumn: boolean;
};

const SPOTIFY_TRACK_COLUMNS: TrackColumnVisibility = {
  showReleaseYearColumn: true,
  showPopularityColumn: true,
};

const TIDAL_TRACK_COLUMNS: TrackColumnVisibility = {
  showReleaseYearColumn: true,
  showPopularityColumn: true,
};

export function getTrackColumnVisibility(providerId: MusicProviderId): TrackColumnVisibility {
  return providerId === 'tidal' ? TIDAL_TRACK_COLUMNS : SPOTIFY_TRACK_COLUMNS;
}
