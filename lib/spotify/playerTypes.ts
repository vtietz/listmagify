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
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? 'Unknown Device'),
    type: raw?.type ?? 'Unknown',
    isActive: Boolean(raw?.is_active),
    isPrivateSession: Boolean(raw?.is_private_session),
    isRestricted: Boolean(raw?.is_restricted),
    volumePercent: typeof raw?.volume_percent === 'number' ? raw.volume_percent : null,
    supportsVolume: Boolean(raw?.supports_volume),
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
  
  const track = raw?.item;
  // API returns actions.disallows where true = action is NOT allowed
  const disallows = raw?.actions?.disallows ?? {};
  
  return {
    device: raw?.device ? mapDevice(raw.device) : null,
    isPlaying: Boolean(raw?.is_playing),
    shuffleState: Boolean(raw?.shuffle_state),
    repeatState: raw?.repeat_state ?? 'off',
    context: raw?.context ? {
      type: raw.context.type,
      uri: raw.context.uri,
      href: raw.context.href,
    } : null,
    track: track ? {
      id: track.id ?? null,
      uri: track.uri,
      name: track.name,
      artists: Array.isArray(track.artists) 
        ? track.artists.map((a: any) => a.name).filter(Boolean)
        : [],
      albumName: track.album?.name ?? null,
      albumImage: track.album?.images?.[0]?.url ?? null,
      durationMs: track.duration_ms ?? 0,
    } : null,
    progressMs: raw?.progress_ms ?? 0,
    timestamp: raw?.timestamp ?? Date.now(),
    restrictions: {
      ...DEFAULT_RESTRICTIONS,
      pausing: Boolean(disallows.pausing),
      resuming: Boolean(disallows.resuming),
      seeking: Boolean(disallows.seeking),
      skippingNext: Boolean(disallows.skipping_next),
      skippingPrev: Boolean(disallows.skipping_prev),
      togglingShuffle: Boolean(disallows.toggling_shuffle),
      togglingRepeat: Boolean(disallows.toggling_repeat_context) || Boolean(disallows.toggling_repeat_track),
      transferringPlayback: Boolean(disallows.transferring_playback),
    },
  };
}
