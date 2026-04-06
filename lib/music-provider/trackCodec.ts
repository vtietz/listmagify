import type { MusicProviderId } from './types';

const TRACK_URI_PREFIX: Record<MusicProviderId, string> = {
  spotify: 'spotify:track:',
  tidal: 'tidal:track:',
};

const LIKED_SONGS_DISPLAY_NAMES: Record<MusicProviderId, string> = {
  spotify: 'Liked Songs',
  tidal: 'My Tracks',
};

/** Build a provider track URI from a plain track ID. */
export function toProviderTrackUri(providerId: MusicProviderId, trackId: string): string {
  if (trackId.includes(':')) {
    return trackId;
  }

  return `${TRACK_URI_PREFIX[providerId]}${trackId}`;
}

/** Normalize a provider track URI/value to a plain provider track ID. */
export function toProviderTrackId(providerId: MusicProviderId, value: string): string {
  const prefix = TRACK_URI_PREFIX[providerId];
  if (value.startsWith(prefix)) {
    return value.slice(prefix.length);
  }

  return value;
}

export function getProviderLikedSongsDisplayName(providerId: MusicProviderId): string {
  return LIKED_SONGS_DISPLAY_NAMES[providerId];
}