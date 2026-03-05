/**
 * Types for Spotify Player/Playback state
 */

export interface SpotifyDevice {
  id: string;
  name: string;
  type: 'Computer' | 'Smartphone' | 'Speaker' | 'TV' | 'AVR' | 'STB' | 'AudioDongle' | 'GameConsole' | 'CastVideo' | 'CastAudio' | 'Automobile' | 'Unknown';
  isActive: boolean;
  isPrivateSession: boolean;
  isRestricted: boolean;
  volumePercent: number | null;
  supportsVolume: boolean;
}

export interface PlaybackContext {
  type: 'album' | 'artist' | 'playlist' | 'show';
  uri: string;
  href: string;
}

export interface PlaybackTrack {
  id: string | null;
  uri: string;
  name: string;
  artists: string[];
  albumName: string | null;
  albumImage: string | null;
  durationMs: number;
}

/**
 * Playback action restrictions.
 * Per Spotify guidelines: gate shuffle/next/prev/repeat/seek by these flags.
 * When true, the action is DISALLOWED (restricted).
 */
export interface PlaybackRestrictions {
  /** Cannot pause playback */
  pausing: boolean;
  /** Cannot resume playback */
  resuming: boolean;
  /** Cannot seek to position */
  seeking: boolean;
  /** Cannot skip to next track */
  skippingNext: boolean;
  /** Cannot skip to previous track */
  skippingPrev: boolean;
  /** Cannot toggle shuffle */
  togglingShuffle: boolean;
  /** Cannot toggle repeat mode */
  togglingRepeat: boolean;
  /** Cannot transfer playback to another device */
  transferringPlayback: boolean;
}

export interface PlaybackState {
  device: SpotifyDevice | null;
  isPlaying: boolean;
  shuffleState: boolean;
  repeatState: 'off' | 'track' | 'context';
  context: PlaybackContext | null;
  track: PlaybackTrack | null;
  progressMs: number;
  timestamp: number;
  /** Action restrictions (e.g., Free tier cannot skip) */
  restrictions: PlaybackRestrictions;
}

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

  return {
    device: raw?.device ? mapDevice(raw.device) : null,
    isPlaying: coerceBoolean(raw?.is_playing),
    shuffleState: coerceBoolean(raw?.shuffle_state),
    repeatState: coerceRepeatState(raw?.repeat_state),
    context: mapPlaybackContext(raw?.context),
    track: mapPlaybackTrack(raw?.item),
    progressMs: coerceNumber(raw?.progress_ms, 0),
    timestamp: coerceNumber(raw?.timestamp, Date.now()),
    restrictions: mapPlaybackRestrictions(raw?.actions?.disallows),
  };
}

const VALID_DEVICE_TYPES = new Set<SpotifyDevice['type']>([
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
  return typeof value === 'string' && VALID_DEVICE_TYPES.has(value as SpotifyDevice['type'])
    ? (value as SpotifyDevice['type'])
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

function mapPlaybackTrack(raw: any): PlaybackTrack | null {
  if (!raw) return null;

  const artists = Array.isArray(raw?.artists)
    ? raw.artists.map((artist: any) => coerceString(artist?.name, '')).filter(Boolean)
    : [];

  return {
    id: raw?.id ?? null,
    uri: coerceString(raw?.uri, ''),
    name: coerceString(raw?.name, ''),
    artists,
    albumName: raw?.album?.name ?? null,
    albumImage: raw?.album?.images?.[0]?.url ?? null,
    durationMs: coerceNumber(raw?.duration_ms, 0),
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
