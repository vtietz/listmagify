/**
 * Last.fm importer adapter
 * 
 * Handles fetching and normalizing track data from Last.fm API endpoints.
 * Supports: recent tracks, loved tracks, top tracks, weekly chart
 */

import type {
  ImportedTrackDTO,
  ImportPaginationMeta,
  ImportResponse,
  ImportSource,
  LastfmPeriod,
  LastfmFetchParams,
} from './types';

// Last.fm API configuration
const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';

// Rate limit tracking for backoff
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 500; // 2 requests per second max

/**
 * Helper to build objects with only defined optional properties.
 * This is required for exactOptionalPropertyTypes compatibility.
 */
function buildTrackDTO(base: { artistName: string; trackName: string }, optionals: {
  albumName?: string | undefined;
  mbid?: string | undefined;
  playedAt?: number | undefined;
  playcount?: number | undefined;
  sourceUrl?: string | undefined;
  nowPlaying?: boolean | undefined;
}): ImportedTrackDTO {
  const result: ImportedTrackDTO = { ...base };
  if (optionals.albumName !== undefined) result.albumName = optionals.albumName;
  if (optionals.mbid !== undefined) result.mbid = optionals.mbid;
  if (optionals.playedAt !== undefined) result.playedAt = optionals.playedAt;
  if (optionals.playcount !== undefined) result.playcount = optionals.playcount;
  if (optionals.sourceUrl !== undefined) result.sourceUrl = optionals.sourceUrl;
  if (optionals.nowPlaying !== undefined) result.nowPlaying = optionals.nowPlaying;
  return result;
}

/**
 * Helper to build pagination meta with only defined optional properties.
 */
function buildPaginationMeta(base: { page: number; perPage: number }, optionals: {
  totalPages?: number | undefined;
  totalItems?: number | undefined;
}): ImportPaginationMeta {
  const result: ImportPaginationMeta = { ...base };
  if (optionals.totalPages !== undefined) result.totalPages = optionals.totalPages;
  if (optionals.totalItems !== undefined) result.totalItems = optionals.totalItems;
  return result;
}

/**
 * Get Last.fm API configuration from environment
 */
export function getLastfmConfig() {
  return {
    apiKey: process.env.LASTFM_API_KEY || '',
    userAgent: process.env.LASTFM_USER_AGENT || 'SpotifyPlaylistStudio/1.0',
    enabled: process.env.LASTFM_IMPORT_ENABLED === 'true',
  };
}

/**
 * Check if Last.fm import is available
 */
export function isLastfmAvailable(): boolean {
  const config = getLastfmConfig();
  return config.enabled && config.apiKey.length > 0;
}

/**
 * Sleep utility with jitter for backoff
 */
async function sleep(ms: number): Promise<void> {
  const jitter = Math.random() * 100;
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

/**
 * Rate-limited fetch with exponential backoff
 */
async function rateLimitedFetch(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  // Enforce minimum interval between requests
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - timeSinceLast);
  }
  lastRequestTime = Date.now();

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Check for rate limit error (error code 29)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, attempt);
        console.warn(`[lastfm] Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await sleep(waitTime);
        continue;
      }
      
      // Check for Last.fm-specific rate limit in response body
      if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          if (data.error === 29) {
            const waitTime = 1000 * Math.pow(2, attempt);
            console.warn(`[lastfm] Rate limit error 29, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
            await sleep(waitTime);
            continue;
          }
          // Create a new Response with the already-read body
          return new Response(text, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch {
          // Not JSON, return original-like response
          return new Response(text, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const waitTime = 1000 * Math.pow(2, attempt);
        console.warn(`[lastfm] Request failed, retrying in ${waitTime}ms: ${lastError.message}`);
        await sleep(waitTime);
      }
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}

/**
 * Build Last.fm API URL with common parameters
 */
function buildUrl(method: string, params: Record<string, string | number | undefined>): string {
  const config = getLastfmConfig();
  const url = new URL(LASTFM_API_BASE);
  
  url.searchParams.set('method', method);
  url.searchParams.set('api_key', config.apiKey);
  url.searchParams.set('format', 'json');
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  
  return url.toString();
}

/**
 * Make request to Last.fm API
 */
async function lastfmRequest<T>(method: string, params: Record<string, string | number | undefined>): Promise<T> {
  const config = getLastfmConfig();
  const url = buildUrl(method, params);
  
  const response = await rateLimitedFetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': config.userAgent,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Last.fm API error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  
  // Check for Last.fm error response
  if (data.error) {
    const errorMsg = data.message || `Error code ${data.error}`;
    throw new Error(`Last.fm API error: ${errorMsg}`);
  }
  
  return data as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// Recent Tracks
// ═══════════════════════════════════════════════════════════════════════════

interface LastfmRecentTracksResponse {
  recenttracks: {
    track: LastfmRecentTrack[];
    '@attr': {
      user: string;
      page: string;
      perPage: string;
      totalPages: string;
      total: string;
    };
  };
}

interface LastfmRecentTrack {
  artist: { '#text': string; mbid?: string };
  name: string;
  album?: { '#text': string; mbid?: string };
  url?: string;
  date?: { uts: string; '#text': string };
  '@attr'?: { nowplaying: string };
  mbid?: string;
}

/**
 * Fetch recent tracks for a Last.fm user
 */
export async function fetchRecentTracks(params: LastfmFetchParams): Promise<ImportResponse> {
  const { username, page = 1, limit = 50 } = params;
  
  const data = await lastfmRequest<LastfmRecentTracksResponse>('user.getRecentTracks', {
    user: username,
    page,
    limit,
  });
  
  const tracks: ImportedTrackDTO[] = (data.recenttracks?.track || []).map((track) => 
    buildTrackDTO(
      { artistName: track.artist?.['#text'] || '', trackName: track.name || '' },
      {
        albumName: track.album?.['#text'] || undefined,
        mbid: track.mbid || undefined,
        playedAt: track.date?.uts ? parseInt(track.date.uts, 10) : undefined,
        sourceUrl: track.url || undefined,
        nowPlaying: track['@attr']?.nowplaying === 'true',
      }
    )
  );
  
  const attr = data.recenttracks?.['@attr'];
  const pagination = buildPaginationMeta(
    { page: parseInt(attr?.page || '1', 10), perPage: parseInt(attr?.perPage || String(limit), 10) },
    {
      totalPages: attr?.totalPages ? parseInt(attr.totalPages, 10) : undefined,
      totalItems: attr?.total ? parseInt(attr.total, 10) : undefined,
    }
  );
  
  return {
    tracks,
    pagination,
    source: 'lastfm-recent' as ImportSource,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Loved Tracks
// ═══════════════════════════════════════════════════════════════════════════

interface LastfmLovedTracksResponse {
  lovedtracks: {
    track: LastfmLovedTrack[];
    '@attr': {
      user: string;
      page: string;
      perPage: string;
      totalPages: string;
      total: string;
    };
  };
}

interface LastfmLovedTrack {
  artist: { name: string; mbid?: string; url?: string };
  name: string;
  url?: string;
  date?: { uts: string; '#text': string };
  mbid?: string;
}

/**
 * Fetch loved tracks for a Last.fm user
 */
export async function fetchLovedTracks(params: LastfmFetchParams): Promise<ImportResponse> {
  const { username, page = 1, limit = 50 } = params;
  
  const data = await lastfmRequest<LastfmLovedTracksResponse>('user.getLovedTracks', {
    user: username,
    page,
    limit,
  });
  
  const tracks: ImportedTrackDTO[] = (data.lovedtracks?.track || []).map((track) =>
    buildTrackDTO(
      { artistName: track.artist?.name || '', trackName: track.name || '' },
      {
        mbid: track.mbid || undefined,
        playedAt: track.date?.uts ? parseInt(track.date.uts, 10) : undefined,
        sourceUrl: track.url || undefined,
      }
    )
  );
  
  const attr = data.lovedtracks?.['@attr'];
  const pagination = buildPaginationMeta(
    { page: parseInt(attr?.page || '1', 10), perPage: parseInt(attr?.perPage || String(limit), 10) },
    {
      totalPages: attr?.totalPages ? parseInt(attr.totalPages, 10) : undefined,
      totalItems: attr?.total ? parseInt(attr.total, 10) : undefined,
    }
  );
  
  return {
    tracks,
    pagination,
    source: 'lastfm-loved' as ImportSource,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Top Tracks
// ═══════════════════════════════════════════════════════════════════════════

interface LastfmTopTracksResponse {
  toptracks: {
    track: LastfmTopTrack[];
    '@attr': {
      user: string;
      page: string;
      perPage: string;
      totalPages: string;
      total: string;
    };
  };
}

interface LastfmTopTrack {
  artist: { name: string; mbid?: string; url?: string };
  name: string;
  url?: string;
  playcount: string;
  mbid?: string;
  '@attr'?: { rank: string };
}

/**
 * Fetch top tracks for a Last.fm user
 */
export async function fetchTopTracks(params: LastfmFetchParams): Promise<ImportResponse> {
  const { username, page = 1, limit = 50, period = 'overall' } = params;
  
  const data = await lastfmRequest<LastfmTopTracksResponse>('user.getTopTracks', {
    user: username,
    page,
    limit,
    period,
  });
  
  const tracks: ImportedTrackDTO[] = (data.toptracks?.track || []).map((track) =>
    buildTrackDTO(
      { artistName: track.artist?.name || '', trackName: track.name || '' },
      {
        mbid: track.mbid || undefined,
        playcount: track.playcount ? parseInt(track.playcount, 10) : undefined,
        sourceUrl: track.url || undefined,
      }
    )
  );
  
  const attr = data.toptracks?.['@attr'];
  const pagination = buildPaginationMeta(
    { page: parseInt(attr?.page || '1', 10), perPage: parseInt(attr?.perPage || String(limit), 10) },
    {
      totalPages: attr?.totalPages ? parseInt(attr.totalPages, 10) : undefined,
      totalItems: attr?.total ? parseInt(attr.total, 10) : undefined,
    }
  );
  
  return {
    tracks,
    pagination,
    source: 'lastfm-top' as ImportSource,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Weekly Chart
// ═══════════════════════════════════════════════════════════════════════════

interface LastfmWeeklyChartResponse {
  weeklytrackchart: {
    track: LastfmWeeklyTrack[];
    '@attr': {
      user: string;
      from: string;
      to: string;
    };
  };
}

interface LastfmWeeklyTrack {
  artist: { '#text': string; mbid?: string };
  name: string;
  url?: string;
  playcount: string;
  mbid?: string;
  '@attr'?: { rank: string };
}

/**
 * Fetch weekly track chart for a Last.fm user
 */
export async function fetchWeeklyChart(params: LastfmFetchParams): Promise<ImportResponse> {
  const { username, from, to } = params;
  
  const data = await lastfmRequest<LastfmWeeklyChartResponse>('user.getWeeklyTrackChart', {
    user: username,
    from,
    to,
  });
  
  const tracks: ImportedTrackDTO[] = (data.weeklytrackchart?.track || []).map((track) =>
    buildTrackDTO(
      { artistName: track.artist?.['#text'] || '', trackName: track.name || '' },
      {
        mbid: track.mbid || undefined,
        playcount: track.playcount ? parseInt(track.playcount, 10) : undefined,
        sourceUrl: track.url || undefined,
      }
    )
  );
  
  // Weekly chart doesn't have pagination metadata
  const pagination: ImportPaginationMeta = {
    page: 1,
    perPage: tracks.length,
    totalPages: 1,
    totalItems: tracks.length,
  };
  
  return {
    tracks,
    pagination,
    source: 'lastfm-weekly' as ImportSource,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Unified Fetcher
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch tracks from any Last.fm source
 */
export async function fetchLastfmTracks(
  source: ImportSource,
  params: LastfmFetchParams
): Promise<ImportResponse> {
  switch (source) {
    case 'lastfm-recent':
      return fetchRecentTracks(params);
    case 'lastfm-loved':
      return fetchLovedTracks(params);
    case 'lastfm-top':
      return fetchTopTracks(params);
    case 'lastfm-weekly':
      return fetchWeeklyChart(params);
    default:
      throw new Error(`Unknown Last.fm source: ${source}`);
  }
}
