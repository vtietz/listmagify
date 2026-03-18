/**
 * Types for Spotify Player/Playback state
 */

import type {
  PlaybackContext,
  PlaybackDevice,
  PlaybackRestrictions,
  PlaybackState,
  PlaybackTrack,
} from '@/lib/music-provider/types';

export type { PlaybackContext, PlaybackDevice, PlaybackRestrictions, PlaybackState, PlaybackTrack };
export type SpotifyDevice = PlaybackDevice;

export interface PlayRequest {
  /** Device ID to play on (optional, uses active device if not specified) */
  deviceId?: string;
  /** Context URI to play (playlist, album, artist) */
  contextUri?: string;
  /** Array of track URIs to play (use instead of contextUri for specific tracks) */
  uris?: string[];
  /** Offset to start at (position number or track URI) */
  offset?: { position: number } | { uri: string };
  /** Position in ms to start at within the track */
  positionMs?: number;
}

/**
 * Map raw Spotify device response to our DTO
 */
export function mapDevice(raw: any): SpotifyDevice {
  const source = raw ?? {};

  return {
    id: coerceString(source.id, ''),
    name: coerceString(source.name, 'Unknown Device'),
    type: coerceDeviceType(source.type),
    isActive: coerceBoolean(source.is_active),
    isPrivateSession: coerceBoolean(source.is_private_session),
    isRestricted: coerceBoolean(source.is_restricted),
    volumePercent: coerceNumberOrNull(source.volume_percent),
    supportsVolume: coerceBoolean(source.supports_volume),
  };
}

/**
 * Map raw Spotify playback state response to our DTO
 */
/**
 * Default restrictions (nothing restricted)
 */
const DEFAULT_RESTRICTIONS: PlaybackRestrictions = {
  pausing: false,
  resuming: false,
  seeking: false,
  skippingNext: false,
  skippingPrev: false,
  togglingShuffle: false,
  togglingRepeat: false,
  transferringPlayback: false,
};

export function mapPlaybackState(raw: any): PlaybackState | null {
  if (!raw) return null;

  const source = raw ?? {};
  const device = source.device ? mapDevice(source.device) : null;
  const context = mapPlaybackContext(source.context);
  const track = mapPlaybackTrack(source.item);
  const restrictions = mapPlaybackRestrictions(source.actions?.disallows);

  return {
    device,
    isPlaying: coerceBoolean(source.is_playing),
    shuffleState: coerceBoolean(source.shuffle_state),
    repeatState: coerceRepeatState(source.repeat_state),
    context,
    track,
    progressMs: coerceNumber(source.progress_ms, 0),
    timestamp: coerceNumber(source.timestamp, Date.now()),
    restrictions,
  };
}

const VALID_DEVICE_TYPES = new Set<PlaybackDevice['type']>([
  'Computer',
  'Smartphone',
  'Speaker',
  'TV',
  'AVR',
  'STB',
  'AudioDongle',
  'GameConsole',
  'CastVideo',
  'CastAudio',
  'Automobile',
  'Unknown',
]);

const VALID_CONTEXT_TYPES = new Set<PlaybackContext['type']>(['album', 'artist', 'playlist', 'show']);
const VALID_REPEAT_STATES = new Set<PlaybackState['repeatState']>(['off', 'track', 'context']);

function coerceString(value: unknown, fallback: string): string {
  return value === null || value === undefined ? fallback : String(value);
}

function coerceBoolean(value: unknown): boolean {
  return Boolean(value);
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function coerceNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function coerceDeviceType(value: unknown): SpotifyDevice['type'] {
  return typeof value === 'string' && VALID_DEVICE_TYPES.has(value as PlaybackDevice['type'])
    ? (value as PlaybackDevice['type'])
    : 'Unknown';
}

function coerceRepeatState(value: unknown): PlaybackState['repeatState'] {
  return typeof value === 'string' && VALID_REPEAT_STATES.has(value as PlaybackState['repeatState'])
    ? (value as PlaybackState['repeatState'])
    : 'off';
}

function mapPlaybackContext(raw: any): PlaybackContext | null {
  if (!raw) return null;

  const type = VALID_CONTEXT_TYPES.has(raw?.type) ? raw.type : 'playlist';
  return {
    type,
    uri: coerceString(raw?.uri, ''),
    href: coerceString(raw?.href, ''),
  };
}

function mapArtistNames(rawArtists: unknown): string[] {
  if (!Array.isArray(rawArtists)) {
    return [];
  }

  return rawArtists
    .map((artist: any) => coerceString(artist?.name, ''))
    .filter(Boolean);
}

function getAlbumImageUrl(rawAlbum: any): string | null {
  if (!rawAlbum?.images || !Array.isArray(rawAlbum.images)) {
    return null;
  }

  const firstImage = rawAlbum.images[0];
  return firstImage?.url ?? null;
}

function mapPlaybackTrack(raw: any): PlaybackTrack | null {
  if (!raw) return null;

  const source = raw ?? {};
  const artists = mapArtistNames(source.artists);
  const album = source.album ?? null;

  return {
    id: source.id ?? null,
    uri: coerceString(source.uri, ''),
    name: coerceString(source.name, ''),
    artists,
    albumName: album?.name ?? null,
    albumImage: getAlbumImageUrl(album),
    durationMs: coerceNumber(source.duration_ms, 0),
  };
}

function mapPlaybackRestrictions(rawDisallows: any): PlaybackRestrictions {
  const disallows = rawDisallows ?? {};

  return {
    ...DEFAULT_RESTRICTIONS,
    pausing: coerceBoolean(disallows.pausing),
    resuming: coerceBoolean(disallows.resuming),
    seeking: coerceBoolean(disallows.seeking),
    skippingNext: coerceBoolean(disallows.skipping_next),
    skippingPrev: coerceBoolean(disallows.skipping_prev),
    togglingShuffle: coerceBoolean(disallows.toggling_shuffle),
    togglingRepeat: coerceBoolean(disallows.toggling_repeat_context) || coerceBoolean(disallows.toggling_repeat_track),
    transferringPlayback: coerceBoolean(disallows.transferring_playback),
  };
}
