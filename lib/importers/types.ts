/**
 * Shared types for track importers (Last.fm, etc.)
 */

/**
 * Normalized track data from an external source (Last.fm, etc.)
 */
export interface ImportedTrackDTO {
  /** Artist name */
  artistName: string;
  /** Track name */
  trackName: string;
  /** Album name (optional) */
  albumName?: string;
  /** MusicBrainz ID (optional) */
  mbid?: string;
  /** When the track was played/scrobbled (Unix timestamp) */
  playedAt?: number;
  /** Play count (for top tracks) */
  playcount?: number;
  /** URL to the track on the source service */
  sourceUrl?: string;
  /** Whether track is currently playing (for recent tracks) */
  nowPlaying?: boolean;
}

/**
 * Result of matching an imported track to Spotify
 */
export interface MatchResult {
  /** Original imported track */
  imported: ImportedTrackDTO;
  /** Matched Spotify track (if found) */
  spotifyTrack?: SpotifyMatchedTrack;
  /** Match confidence: 'high', 'medium', 'low', 'none' */
  confidence: MatchConfidence;
  /** Match score (0-100) */
  score: number;
  /** Alternative candidates for manual selection */
  candidates?: SpotifyMatchedTrack[];
}

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

/**
 * Spotify track data relevant for matching
 */
export interface SpotifyMatchedTrack {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album?: {
    id?: string | null;
    name?: string | null;
  };
  durationMs: number;
  popularity?: number;
}

/**
 * Pagination metadata for imported tracks
 */
export interface ImportPaginationMeta {
  page: number;
  perPage: number;
  totalPages?: number;
  totalItems?: number;
}

/**
 * Response from a track import source
 */
export interface ImportResponse {
  tracks: ImportedTrackDTO[];
  pagination: ImportPaginationMeta;
  source: ImportSource;
}

export type ImportSource = 'lastfm-recent' | 'lastfm-loved' | 'lastfm-top' | 'lastfm-weekly';

/**
 * Period options for Last.fm top tracks
 */
export type LastfmPeriod = 'overall' | '7day' | '1month' | '3month' | '6month' | '12month';

/**
 * Parameters for fetching Last.fm tracks
 */
export interface LastfmFetchParams {
  username: string;
  page?: number;
  limit?: number;
  /** Period for top tracks */
  period?: LastfmPeriod;
  /** From/to timestamps for weekly charts */
  from?: number;
  to?: number;
}
